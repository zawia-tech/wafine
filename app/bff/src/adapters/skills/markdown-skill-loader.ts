/**
 * Markdown skill loader — scans directories for SKILL.md / *.md with YAML frontmatter.
 * Malformed skills are skipped, never fatal.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { Skill } from '../../domain/ports/index.js';

export interface LoadWarning {
  path: string;
  reason: string;
}

export interface LoadResult {
  skills: Skill[];
  warnings: LoadWarning[];
}

type Frontmatter = Record<string, string | string[]>;

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

function parseValue(value: string): string | string[] {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((part) => unquote(part.trim()))
      .filter((part) => part.length > 0);
  }
  return unquote(value);
}

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };

  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: normalized };

  const header = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, '');
  const data: Frontmatter = {};

  for (const line of header.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key === '') continue;
    data[key] = parseValue(line.slice(idx + 1).trim());
  }

  return { data, body };
}

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === '') return [];
  return [value];
}

function toSkill(raw: string, sourcePath: string, fallbackName: string): Skill {
  const { data, body } = parseFrontmatter(raw);
  const name = asString(data['name']) ?? fallbackName;
  const description = asString(data['description']) ?? '';
  const triggers = asArray(data['triggers']).concat(asArray(data['tags']));
  const tools = asArray(data['tools']);
  return { name, description, triggers, tools, body: body.trim(), sourcePath };
}

async function readSkillFile(path: string, fallbackName: string): Promise<Skill | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return toSkill(raw, path, fallbackName);
  } catch {
    return null;
  }
}

export async function loadSkillsFromDirs(dirs: string[]): Promise<LoadResult> {
  const skills: Skill[] = [];
  const warnings: LoadWarning[] = [];

  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const path = join(dir, entry.name, 'SKILL.md');
        const skill = await readSkillFile(path, entry.name);
        if (skill) skills.push(skill);
        else warnings.push({ path, reason: 'SKILL.md missing or unreadable' });
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const path = join(dir, entry.name);
      const skill = await readSkillFile(path, basename(entry.name, '.md'));
      if (skill) skills.push(skill);
      else warnings.push({ path, reason: 'unreadable markdown file' });
    }
  }

  return { skills, warnings };
}
