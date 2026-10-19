import { describe, it, expect } from 'bun:test';
import { assertProductionEnv } from './env.js';

const PRODUCTION = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DATABASE_URL: 'postgresql://user:pass@host:5432/postgres',
  ADMIN_EMAILS: 'admin@example.com',
  OPENWA_API_KEY: 'key',
} as const;

type Key = keyof typeof PRODUCTION;

describe('assertProductionEnv', () => {
  it('accepts a complete production environment', () => {
    expect(() => assertProductionEnv('production', (k) => PRODUCTION[k as Key])).not.toThrow();
  });

  it('refuses to start and names the missing variable', () => {
    for (const key of Object.keys(PRODUCTION) as Key[]) {
      const read = (k: string) => (k === key ? undefined : PRODUCTION[k as Key]);
      expect(() => assertProductionEnv('production', read)).toThrow(
        `Missing required env var: ${key}`,
      );
    }
  });

  it('does not gate non-production environments', () => {
    expect(() => assertProductionEnv('development', () => undefined)).not.toThrow();
    expect(() => assertProductionEnv('test', () => undefined)).not.toThrow();
  });
});
