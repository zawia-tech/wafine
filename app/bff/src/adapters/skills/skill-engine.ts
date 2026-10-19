/**
 * Skill registry + engine — deterministic matching; LLM execution is Phase 2.
 */

import type {
  ISkillEngine,
  ISkillRegistry,
  Skill,
  SkillMatch,
  SkillResult,
  SkillRunContext,
} from '../../domain/ports/index.js';

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

export class SkillRegistry implements ISkillRegistry {
  private readonly byName = new Map<string, Skill>();

  constructor(skills: Skill[]) {
    for (const skill of skills) this.byName.set(skill.name, skill);
  }

  list(): Skill[] {
    return [...this.byName.values()];
  }

  get(name: string): Skill | undefined {
    return this.byName.get(name);
  }

  match(input: string, limit = 5): SkillMatch[] {
    const haystack = input.toLowerCase();
    const tokens = new Set(tokenize(input));

    const matches: SkillMatch[] = [];
    for (const skill of this.byName.values()) {
      let score = 0;
      for (const trigger of skill.triggers) {
        if (trigger !== '' && haystack.includes(trigger.toLowerCase())) score += 3;
      }
      for (const token of tokenize(`${skill.name} ${skill.description}`)) {
        if (tokens.has(token)) score += 1;
      }
      if (score > 0) matches.push({ skillName: skill.name, score });
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export class SkillEngine implements ISkillEngine {
  constructor(private readonly registry: ISkillRegistry) {}

  async run(name: string, input: string, context: SkillRunContext): Promise<SkillResult> {
    const skill = this.registry.get(name);
    if (!skill) {
      return { ok: false, output: `Unknown skill: ${name}` };
    }

    const plan = await Promise.all(
      skill.tools.map(async (reference) => {
        const [serverId, toolName] = reference.split('.');
        if (!serverId || !toolName) return { reference, available: false };
        try {
          const client = await context.mcp.getClient(serverId);
          const tools = await client.listTools();
          return { reference, available: tools.some((tool) => tool.name === toolName) };
        } catch {
          return { reference, available: false };
        }
      }),
    );

    return {
      ok: false,
      output: 'Skill execution requires an LLM runtime (Phase 2)',
      data: { skill: skill.name, input, plan },
    };
  }
}
