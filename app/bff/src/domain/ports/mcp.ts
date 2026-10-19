/**
 * MCP port — client factory and per-server client contract.
 */

export type McpTransport =
  | {
      kind: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  | {
      kind: 'http';
      url: string;
      headers?: Record<string, string>;
    };

export interface McpServerConfig {
  id: string;
  description: string;
  transport: McpTransport;
  /** Connected and probed only when true. */
  enabled: boolean;
  /** Write-tier tools are refused unless the factory is not read-only. */
  readOnly: boolean;
  /** A down required server fails readiness. */
  required?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface McpCallResult {
  content: unknown;
  isError: boolean;
}

export interface IMcpClient {
  readonly serverId: string;
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface IMcpClientFactory {
  /** Lazily connect and cache a client; throws if the server is unknown or disabled. */
  getClient(serverId: string): Promise<IMcpClient>;
  listServers(): McpServerConfig[];
  /** Per-enabled-server reachability. */
  health(): Promise<Record<string, boolean>>;
  closeAll(): Promise<void>;
}
