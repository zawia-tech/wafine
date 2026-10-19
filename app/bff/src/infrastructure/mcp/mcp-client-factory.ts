/**
 * MCP client factory — lazily connects to configured MCP servers.
 * The SDK surface is isolated to this adapter.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  IMcpClient,
  IMcpClientFactory,
  McpCallResult,
  McpServerConfig,
  McpToolDescriptor,
} from '../../domain/ports/index.js';

class SdkMcpClient implements IMcpClient {
  constructor(
    readonly serverId: string,
    private readonly client: Client,
  ) {}

  async listTools(): Promise<McpToolDescriptor[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const result = await this.client.callTool({ name, arguments: args });
    return { content: result.content, isError: result.isError === true };
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function processEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

async function connect(config: McpServerConfig): Promise<IMcpClient> {
  const client = new Client({ name: 'wafine-bff', version: '0.1.0' });

  if (config.transport.kind === 'stdio') {
    const transport = new StdioClientTransport({
      command: config.transport.command,
      args: config.transport.args,
      env: { ...processEnv(), ...config.transport.env },
    });
    await client.connect(transport);
  } else {
    const transport = new StreamableHTTPClientTransport(new URL(config.transport.url), {
      requestInit: { headers: config.transport.headers },
    });
    await client.connect(transport);
  }

  return new SdkMcpClient(config.id, client);
}

export class McpClientFactory implements IMcpClientFactory {
  private readonly servers: McpServerConfig[];
  private readonly clients = new Map<string, Promise<IMcpClient>>();

  constructor(servers: McpServerConfig[]) {
    this.servers = servers;
  }

  listServers(): McpServerConfig[] {
    return this.servers;
  }

  private config(serverId: string): McpServerConfig {
    const config = this.servers.find((server) => server.id === serverId);
    if (!config) throw new Error(`Unknown MCP server: ${serverId}`);
    if (!config.enabled) throw new Error(`MCP server disabled: ${serverId}`);
    return config;
  }

  async getClient(serverId: string): Promise<IMcpClient> {
    const config = this.config(serverId);
    let pending = this.clients.get(serverId);
    if (!pending) {
      pending = connect(config).catch((error: unknown) => {
        this.clients.delete(serverId);
        throw error;
      });
      this.clients.set(serverId, pending);
    }
    return pending;
  }

  async health(): Promise<Record<string, boolean>> {
    const enabled = this.servers.filter((server) => server.enabled);
    const entries = await Promise.all(
      enabled.map(async (server): Promise<[string, boolean]> => {
        try {
          const client = await this.getClient(server.id);
          return [server.id, await client.ping()];
        } catch {
          return [server.id, false];
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  async closeAll(): Promise<void> {
    const pending = [...this.clients.values()];
    this.clients.clear();
    await Promise.all(
      pending.map(async (clientPromise) => {
        try {
          const client = await clientPromise;
          await client.close();
        } catch {
          // connection already failed; nothing to close
        }
      }),
    );
  }
}
