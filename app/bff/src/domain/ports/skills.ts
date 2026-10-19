/**
 * Skills port — markdown skill loading, matching, and execution.
 */

import type { IMcpClientFactory } from './mcp.js';

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  /** Fully-qualified MCP tool references, `server.tool`. */
  tools: string[];
  body: string;
  sourcePath: string;
}

export interface SkillMatch {
  skillName: string;
  score: number;
}

export interface SkillRunContext {
  tenantId: string;
  sessionId: string;
  chatId: string;
  mcp: IMcpClientFactory;
  metadata: Record<string, unknown>;
}

export interface SkillResult {
  ok: boolean;
  output: string;
  data?: unknown;
}

export interface ISkillRegistry {
  list(): Skill[];
  get(name: string): Skill | undefined;
  match(input: string, limit?: number): SkillMatch[];
}

export interface ISkillEngine {
  run(name: string, input: string, context: SkillRunContext): Promise<SkillResult>;
}
