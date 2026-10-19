/**
 * Workflow engine — decides whether an inbound message earns an automated reply.
 * Gate order: structural filters → tenant → allowlist → rule match → rule enabled → cooldown.
 * Replies are handed to the paced sender; the engine never retries a send.
 */

import type {
  IContactAllowlist,
  IReplySender,
  ITenantDirectory,
  IWorkflowStore,
  InboundMessage,
  WorkflowDecision,
} from '../ports/index.js';
import { BUILTIN_RULES, normalizeText, type WorkflowRule } from './rules.js';

/** Stable per-contact key: the digits of the chat JID. */
export function contactKey(chatId: string): string {
  return chatId.split('@')[0]?.replace(/\D/g, '') ?? '';
}

export class WorkflowEngine {
  constructor(
    private readonly directory: ITenantDirectory,
    private readonly allowlist: IContactAllowlist,
    private readonly store: IWorkflowStore,
    private readonly sender: IReplySender,
    private readonly rules: readonly WorkflowRule[] = BUILTIN_RULES,
  ) {}

  async handle(message: InboundMessage): Promise<WorkflowDecision> {
    if (message.fromMe) return { status: 'ignored', reason: 'from_me' };
    if (message.isGroup || message.isStatusBroadcast || !message.chatId.endsWith('@c.us')) {
      return { status: 'ignored', reason: 'not_direct_chat' };
    }
    if (message.type !== 'text' && message.type !== 'chat') {
      return { status: 'ignored', reason: 'not_text' };
    }

    const tenantId = await this.directory.tenantForSession(message.sessionId);
    if (!tenantId) return { status: 'ignored', reason: 'unknown_session' };

    if (!(await this.allowlist.isAllowed(tenantId, message.chatId))) {
      return { status: 'ignored', reason: 'not_allowlisted' };
    }

    const text = normalizeText(message.body);
    const rule = this.rules.find((candidate) => candidate.matches(text));
    if (!rule) return { status: 'ignored', reason: 'no_match' };

    const settings = await this.store.getSettings(tenantId);
    if (!settings.rules[rule.id]) return { status: 'ignored', reason: 'rule_disabled' };

    const contact = contactKey(message.chatId);
    const hasCooldown = rule.cooldownMs !== undefined;
    if (hasCooldown && !(await this.store.claimCooldown(tenantId, rule.id, contact, rule.cooldownMs ?? 0))) {
      return { status: 'ignored', reason: 'cooldown' };
    }

    const delivery = this.sender
      .send({ sessionId: message.sessionId, chatId: message.chatId, text: rule.reply })
      .catch(() => 'failed' as const)
      .then(async (outcome) => {
        // The contact was not actually greeted, so don't burn their 24h slot.
        if (hasCooldown && outcome !== 'sent') {
          await this.store.releaseCooldown(tenantId, rule.id, contact);
        }
        return outcome;
      });

    return { status: 'queued', ruleId: rule.id, delivery };
  }
}
