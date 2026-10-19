import { describe, it, expect } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IMcpClientFactory, Skill } from '../../domain/ports/index.js';
import { loadSkillsFromDirs } from './markdown-skill-loader.js';
import { SkillEngine, SkillRegistry } from './skill-engine.js';

const skill: Skill = {
  name: 'pr-review',
  description: 'review a pull request and post findings',
  triggers: ['pull request', 'pr review'],
  tools: ['github.createReview'],
  body: 'body',
  sourcePath: 'fixture',
};

describe('SkillRegistry', () => {
  it('matches a skill by trigger phrase', () => {
    const registry = new SkillRegistry([skill]);
    const matches = registry.match('please review this pull request');
    expect(matches[0]?.skillName).toBe('pr-review');
    expect(matches[0]?.score).toBeGreaterThan(0);
  });

  it('returns no matches for unrelated input', () => {
    const registry = new SkillRegistry([skill]);
    expect(registry.match('what is the weather')).toEqual([]);
  });
});

describe('SkillEngine', () => {
  it('reports an unknown skill without throwing', async () => {
    const engine = new SkillEngine(new SkillRegistry([skill]));
    const mcp = { getClient: () => Promise.reject(new Error('no')) } as unknown as IMcpClientFactory;
    const result = await engine.run('missing', 'x', {
      tenantId: 't',
      sessionId: 's',
      chatId: 'c',
      mcp,
      metadata: {},
    });
    expect(result.ok).toBe(false);
  });

  it('builds a tool plan and stays honest about LLM execution', async () => {
    const engine = new SkillEngine(new SkillRegistry([skill]));
    const mcp = { getClient: () => Promise.reject(new Error('no')) } as unknown as IMcpClientFactory;
    const result = await engine.run('pr-review', 'review this', {
      tenantId: 't',
      sessionId: 's',
      chatId: 'c',
      mcp,
      metadata: {},
    });
    expect(result.ok).toBe(false);
    expect(result.data).toBeDefined();
  });
});

describe('loadSkillsFromDirs', () => {
  it('loads a SKILL.md with frontmatter and names bare files by filename', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-'));
    try {
      await mkdir(join(dir, 'pr'));
      await writeFile(
        join(dir, 'pr', 'SKILL.md'),
        '---\nname: pr-review\ndescription: Review PRs\ntriggers: [pr review]\n---\nbody',
      );
      await writeFile(join(dir, 'note.md'), 'plain note');

      const { skills: loaded } = await loadSkillsFromDirs([dir]);
      expect(loaded.some((s) => s.name === 'pr-review')).toBe(true);
      expect(loaded.some((s) => s.name === 'note')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores missing directories', async () => {
    const { skills: loaded, warnings } = await loadSkillsFromDirs(['/nonexistent/skills']);
    expect(loaded).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
