/**
 * MCP server catalog (ARD §3.2 + the operator's opencode config).
 * Tokens are read from the environment and never logged.
 */

import type { McpServerConfig } from '../../domain/ports/index.js';

function str(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function httpServer(
  id: string,
  description: string,
  url: string,
  options: { headers?: Record<string, string>; enabled?: boolean; required?: boolean } = {},
): McpServerConfig {
  return {
    id,
    description,
    transport: { kind: 'http', url, headers: options.headers ?? {} },
    enabled: options.enabled ?? true,
    readOnly: true,
    required: options.required ?? false,
  };
}

function stdioServer(
  id: string,
  description: string,
  command: string,
  args: string[],
  options: { env?: Record<string, string>; enabled?: boolean } = {},
): McpServerConfig {
  return {
    id,
    description,
    transport: { kind: 'stdio', command, args, env: options.env ?? {} },
    enabled: options.enabled ?? false,
    readOnly: false,
  };
}

export function defaultMcpServers(): McpServerConfig[] {
  const supabaseUrl = str('SUPABASE_MCP_URL');
  const vercelUrl = str('VERCEL_MCP_URL');
  const cloudflareUrl = str('CLOUDFLARE_MCP_URL');
  const context7Key = str('CONTEXT7_API_KEY');
  const beatapiKey = str('BEATAPI_API_KEY');
  const openwaUrl = str('OPENWA_MCP_URL');
  const openwaKey = str('OPENWA_MCP_KEY');

  return [
    httpServer('supabase', 'Supabase project + database tooling', supabaseUrl, {
      headers: bearer(str('SUPABASE_ACCESS_TOKEN')),
      enabled: supabaseUrl !== '',
    }),
    httpServer('vercel', 'Vercel deployments and projects', vercelUrl, {
      headers: bearer(str('VERCEL_TOKEN')),
      enabled: vercelUrl !== '',
    }),
    httpServer('cloudflare', 'Cloudflare DNS, tunnels, R2', cloudflareUrl, {
      headers: bearer(str('CLOUDFLARE_API_TOKEN')),
      enabled: cloudflareUrl !== '',
    }),
    httpServer('context7', 'Up-to-date library documentation', 'https://mcp.context7.com/mcp', {
      headers: context7Key === '' ? {} : bearer(context7Key),
    }),
    httpServer('deepwiki', 'Repository Q&A over public GitHub repos', 'https://mcp.deepwiki.com/mcp'),
    httpServer('beatapi', 'Social data and media workflows', 'https://beatapi.io/mcp', {
      headers: bearer(beatapiKey),
      enabled: beatapiKey !== '',
    }),
    stdioServer('serena', 'Semantic code tooling (local)', 'uvx', [
      '--from',
      'serena-agent',
      'serena',
      'start-mcp-server',
      '--project-from-cwd',
      '--context',
      'agent',
      '--open-web-dashboard',
      'False',
    ]),
    stdioServer('railway', 'Railway infrastructure (local CLI)', 'railway', ['mcp']),
    stdioServer('laya', 'Laya bridge (local)', 'laya-mcp-bridge', []),
    stdioServer('openviking', 'Long-term memory proxy (local)', 'node', [
      str('OPENVIKING_MCP_PROXY', 'mcp-proxy.mjs'),
    ]),
    stdioServer('headroom', 'Headroom context tools (local)', 'headroom', ['mcp', 'serve']),
    httpServer('openwa', 'OpenWA gateway MCP (read-only)', openwaUrl, {
      headers: bearer(openwaKey),
      enabled: openwaUrl !== '',
      required: false,
    }),
  ];
}
