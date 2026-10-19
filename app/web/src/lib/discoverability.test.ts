import { describe, expect, test } from 'bun:test';
import { discoverabilityUrls, humansTxt, llmsFullTxt, llmsMd, llmsTxt } from './discoverability';

const urls = {
  siteUrl: 'http://localhost:3000',
  docsUrl: 'http://localhost:3002',
  connectorUrl: 'http://localhost:4000/mcp',
  apiOrigin: 'http://localhost:4000',
};

describe('discoverability content', () => {
  test('llms.txt follows the llms.txt standard shape', () => {
    const text = llmsTxt(urls);
    expect(text.startsWith('# WaFine\n\n> ')).toBe(true);
    expect(text).toContain('## Docs');
    expect(text).toContain(`[Documentation](${urls.docsUrl})`);
    expect(text).toContain(`[Blog](${urls.siteUrl}/blog)`);
    expect(text).toContain('WaFine, sponsored by Ai4x Academy, built by ZawIA.Tech, open-core on OpenWA.');
  });

  test('llms.md includes the agent how-to and links', () => {
    const text = llmsMd(urls);
    expect(text).toContain('## How to use WaFine with an LLM agent');
    expect(text).toContain(urls.connectorUrl);
    expect(text).toContain(`[Full context for agents (llms-full.txt)](${urls.siteUrl}/llms-full.txt)`);
  });

  test('llms-full.txt covers the journey and both API surfaces', () => {
    const text = llmsFullTxt(urls);
    for (const journeyStep of ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7']) {
      expect(text).toContain(journeyStep);
    }
    expect(text).toContain('## REST surface (summary)');
    expect(text).toContain('## MCP surface (summary)');
    expect(text).toContain('## Claude connector (OAuth for MCP)');
    expect(text).toContain(urls.apiOrigin);
    expect(text).toContain(urls.connectorUrl);
  });

  test('humans.txt is humanstxt.org-shaped with the full credits', () => {
    const text = humansTxt(urls);
    expect(text).toContain('/* TEAM */');
    expect(text).toContain('/* THANKS */');
    expect(text).toContain('/* SITE */');
    expect(text).toContain(' Mohamed Moughamir');
    expect(text).toContain(
      'Project sponsored by Ai4x Academy. Built by ZawIA.Tech. Developed by Mohamed Moughamir',
    );
  });

  test('discoverability URLs never invent a host in dev', () => {
    const resolved = discoverabilityUrls();
    expect(resolved.siteUrl).toBe('http://localhost:3000');
    expect(resolved.docsUrl).toBe('http://localhost:3002');
  });
});
