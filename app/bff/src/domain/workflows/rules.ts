/**
 * Built-in workflow rules. Deterministic text matching only — no LLM.
 */

import type { WorkflowRuleId } from '../ports/index.js';

export interface WorkflowRule {
  id: WorkflowRuleId;
  description: string;
  matches(normalizedText: string): boolean;
  reply: string;
  /** Minimum gap between replies of this rule to the same contact. */
  cooldownMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const GREETING_WORDS = new Set(['hello', 'hi', 'salam', 'bonjour']);

export const GREETING_REPLY =
  'Hello 👋 Salam / Bonjour — thanks for your message. This is an automated reply, a person will get back to you soon.';

/** Trim, lowercase, and drop trailing punctuation so `Ping!` and `hi.` still match. */
export function normalizeText(body: string): string {
  return body
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s!.,?؟،]+$/u, '');
}

export const BUILTIN_RULES: readonly WorkflowRule[] = [
  {
    id: 'ping-pong',
    description: 'Reply "pong" to "ping".',
    matches: (text) => text === 'ping',
    reply: 'pong',
  },
  {
    id: 'greeting',
    description: 'Reply with a fixed greeting to hello / hi / salam / bonjour (once per contact per 24h).',
    matches: (text) => GREETING_WORDS.has(text),
    reply: GREETING_REPLY,
    cooldownMs: DAY_MS,
  },
];
