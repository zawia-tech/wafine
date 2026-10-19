import { test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const contentDir = join(import.meta.dirname, '..', 'content');

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (entry.endsWith('.mdx') || entry.endsWith('.md')) files.push(p);
  }
  return files;
}

function listDirs(dir: string): string[] {
  const dirs: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      dirs.push(p);
      dirs.push(...listDirs(p));
    }
  }
  return dirs;
}

test('public content has no sensitive hostnames or credentials', () => {
  const files = walk(contentDir);
  const forbidden = /bouskoura|bouskoura\.online|zawia\.tech|wafine-vm|ts\.net|mlylwzzpyrllqrcrlyhb|imfjcaoxspcqxxyxcrfi|pooler\.supabase|pass\s+[a-z0-9_\-\/]+|@gmail\b|@omnizya/gi;
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    const m = s.match(forbidden);
    if (m) throw new Error(`Forbidden content in ${f}: ${m[0]}`);
  }
});

// Allow-list of hosts a public reader may see: example placeholders and the upstream
// open-source engine repository. Any other host in content/ fails the build.
const ALLOWED_URL_HOSTS = new Set(['example.com', 'github.com']);

test('public content only links to allowed hosts', () => {
  const files = walk(contentDir);
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    const patterns = [...s.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)*([a-z0-9-]+)\.(?:[a-z]{2,})(?:[\/"'\s]|$)/gi)];
    for (const m of patterns) {
      const host = `${m[1]}`;
      // Resolve to the registrable domain of the full match: m0 up to the TLD.
      const url = m[0].replace(/[\s"'`)]+$/, '');
      const hostname = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
      const registrable = hostname.split('.').slice(-2).join('.');
      if (!ALLOWED_URL_HOSTS.has(registrable)) {
        throw new Error(`Non-example host in ${f}: ${url}`);
      }
    }
  }
});

test('public content has no phone-like numbers or IP-like addresses', () => {
  const files = walk(contentDir);
  const forbidden = [
    { re: /\+\d[\d\s.\-]{7,}\d/, why: 'phone-like number' },
    { re: /\b\d[\d\s.\-]{10,}\b(?!\w)/, why: 'long digit run' },
    { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, why: 'IP-like address' },
  ];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const { re, why } of forbidden) {
      const m = s.match(re);
      if (m) throw new Error(`${why} in ${f}: ${m[0]}`);
    }
  }
});

test('public content contains no internal project directory', () => {
  const dirs = listDirs(contentDir);
  for (const d of dirs) {
    if (d.split(/[\\/]/).pop()!.toLowerCase() === 'project') {
      throw new Error(`Internal project directory re-introduced: ${d}`);
    }
  }
});

test('public content has no legacy /docs/ internal links', () => {
  const files = walk(contentDir);
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    const m = s.match(/\]\(\/docs[\/)\.?#]/g);
    if (m) throw new Error(`Legacy /docs link in ${f}: ${m[0]}`);
  }
});
