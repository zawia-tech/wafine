import { describe, expect, test } from 'bun:test';
import {
  productionEnvProblems,
  readRequiredEnv,
  REQUIRED_PRODUCTION_ENV,
  shouldCheckProductionEnv,
} from './env-guard';

const validProdEnv = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  SITE_URL: 'https://app.example.org',
  NEXT_PUBLIC_API_URL: 'https://api.example.org',
  NEXT_PUBLIC_DOCS_URL: 'https://docs.example.org',
  CONTACT_EMAIL: 'hello@example.org',
  NEXT_PUBLIC_CONTACT_EMAIL: 'hello@example.org',
};

describe('productionEnvProblems', () => {
  test('accepts a complete https Vercel production env', () => {
    expect(productionEnvProblems(validProdEnv)).toEqual([]);
  });

  test('reports every missing name at once', () => {
    const problems = productionEnvProblems({ NODE_ENV: 'production' });
    for (const { name } of REQUIRED_PRODUCTION_ENV) {
      expect(problems.some((p) => p.includes(name))).toBe(true);
    }
    expect(problems).toHaveLength(REQUIRED_PRODUCTION_ENV.length);
  });

  test('rejects non-https URLs where a URL is expected', () => {
    const problems = productionEnvProblems({
      ...validProdEnv,
      NEXT_PUBLIC_DOCS_URL: 'http://docs.example.org',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('NEXT_PUBLIC_DOCS_URL');
    expect(problems[0]).toContain('https');
  });

  test('rejects unparseable URLs', () => {
    const problems = productionEnvProblems({ ...validProdEnv, SITE_URL: 'not a url' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('SITE_URL');
  });

  test('rejects example.com and localhost only on Vercel production', () => {
    const placeholder = { ...validProdEnv, SITE_URL: 'https://app.example.com' };
    expect(productionEnvProblems(placeholder)).toHaveLength(1);
    expect(productionEnvProblems(placeholder)[0]).toContain('example.com');

    const localhost = { ...validProdEnv, NEXT_PUBLIC_API_URL: 'https://localhost' };
    expect(productionEnvProblems(localhost)).toHaveLength(1);
    expect(productionEnvProblems(localhost)[0]).toContain('localhost');
  });

  test('rejects placeholder email domains only on Vercel production', () => {
    const placeholder = { ...validProdEnv, CONTACT_EMAIL: 'hello@example.com' };
    expect(productionEnvProblems(placeholder)).toHaveLength(1);
    expect(productionEnvProblems(placeholder)[0]).toContain('CONTACT_EMAIL');
    expect(productionEnvProblems(placeholder)[0]).toContain('example.com');
  });

  test('allows localhost values in a non-Vercel production build (CI)', () => {
    const ciEnv = {
      NODE_ENV: 'production',
      SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      NEXT_PUBLIC_DOCS_URL: 'http://localhost:3001',
      CONTACT_EMAIL: 'hello@example.com',
      NEXT_PUBLIC_CONTACT_EMAIL: 'hello@example.com',
    };
    expect(productionEnvProblems(ciEnv)).toEqual([]);
  });

  test('trims whitespace and strips trailing slashes consistently', () => {
    const problems = productionEnvProblems({
      ...validProdEnv,
      SITE_URL: '  https://app.example.org///  ',
    });
    expect(problems).toEqual([]);
  });
});

describe('shouldCheckProductionEnv', () => {
  const buildArgv = ['node', 'next', 'build'];
  const startArgv = ['node', 'next', 'start'];
  const lintArgv = ['node', 'next', 'lint'];

  test('fires on NODE_ENV=production or VERCEL_ENV=production for build/start', () => {
    expect(shouldCheckProductionEnv({ NODE_ENV: 'production' }, buildArgv)).toBe(true);
    expect(shouldCheckProductionEnv({ VERCEL_ENV: 'production' }, startArgv)).toBe(true);
    expect(shouldCheckProductionEnv({ NODE_ENV: 'development' }, buildArgv)).toBe(false);
    expect(shouldCheckProductionEnv({ NODE_ENV: 'test', VERCEL_ENV: 'preview' }, buildArgv)).toBe(false);
  });

  test('does not fire for non-deploy CLI commands (next lint forces NODE_ENV=production)', () => {
    expect(shouldCheckProductionEnv({ NODE_ENV: 'production' }, lintArgv)).toBe(false);
    expect(shouldCheckProductionEnv({ VERCEL_ENV: 'production' }, lintArgv)).toBe(false);
  });

  test('fires when no CLI command is present (unknown caller)', () => {
    expect(shouldCheckProductionEnv({ NODE_ENV: 'production' }, ['node', 'next'])).toBe(true);
  });
});

describe('readRequiredEnv', () => {
  test('returns the trimmed value without trailing slashes', () => {
    expect(readRequiredEnv('SITE_URL', 'http://localhost:3000', { SITE_URL: ' https://a.example.org/ ' })).toBe(
      'https://a.example.org',
    );
  });

  test('falls back to the dev default outside production', () => {
    expect(readRequiredEnv('SITE_URL', 'http://localhost:3000', { NODE_ENV: 'development' })).toBe(
      'http://localhost:3000',
    );
  });

  test('throws in production when the var is missing', () => {
    expect(() => readRequiredEnv('NEXT_PUBLIC_DOCS_URL', 'http://localhost:3001', { NODE_ENV: 'production' })).toThrow(
      'NEXT_PUBLIC_DOCS_URL',
    );
  });

  test('throws for names missing from REQUIRED_PRODUCTION_ENV', () => {
    expect(() => readRequiredEnv('NOT_A_LISTED_VAR', 'x', {})).toThrow('NOT_A_LISTED_VAR');
  });
});
