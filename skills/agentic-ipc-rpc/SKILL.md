---
name: agentic-ipc-rpc
description: Wire agents together at the process level - unix domain sockets, named pipes, JSON-RPC 2.0, gRPC, stdio transports, message framing, backpressure, idempotency keys, timeouts and retries - with small shell and TypeScript examples that run. Use when two local processes or agents must exchange messages, when framing or backpressure matters, or when adding retries/idempotency to a call.
---

# Agent IPC and RPC

Two agents on the same host rarely need HTTP. This skill covers the local
transports, the framing rules that make them safe, and the reliability bits
(idempotency, timeouts, retries) that apply to any RPC.

## Pick a transport
| Transport | Use when | Notes |
|---|---|---|
| **Unix domain socket** | local, bidirectional, stream | filesystem path, not a port; `man 7 unix` |
| **Named pipe (FIFO)** | shell one-way plumbing, log/metrics tap | `mkfifo`; unidirectional, blocking |
| **stdio** | a parent launches a child and speaks on its pipes | MCP uses this (`~/wafine/research/mcp-transports.md:22-50`) |
| **TCP loopback** | you need it to look like a network socket | bind `127.0.0.1`, never `0.0.0.0` |
| **gRPC** | typed, cross-language, streaming RPC | HTTP/2 framing; https://grpc.io |

All of the stream ones need **framing**: a byte stream has no message boundaries.

## Framing
- **Newline-delimited JSON (JSON Lines)** - one JSON object per line, `\n` delimiter.
  This is exactly the MCP stdio rule: "Messages are delimited by newlines, and MUST NOT
  contain embedded newlines" (`mcp-transports.md:29-30`). Simplest and what we use below.
- **Length-prefixed** - 4-byte big-endian length then the payload. gRPC uses HTTP/2
  framing (length-prefixed DATA frames). Use when payloads may contain newlines.
- Never assume one `read()` equals one message; buffer and split.

## Example: JSON-RPC 2.0 over a unix socket (Bun/Node, runs as-is)
JSON-RPC 2.0 is the envelope MCP and A2A's JSON-RPC binding both use
(https://www.jsonrpc.org/specification; `~/wafine/research/a2a.txt:2922-2947`).

```ts
// rpc.ts — server then client over a unix socket. Run: bun rpc.ts
import { createServer, connect } from "node:net";

const SOCK = process.env.IPC_SOCKET ?? "/tmp/agent-rpc.sock"; // never a public port

// server: newline-delimited JSON-RPC
const server = createServer((sock) => {
  let buf = "";
  sock.on("data", (chunk) => {
    buf += chunk.toString();
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const req = JSON.parse(line);
      const result = req.method === "echo" ? req.params : null;
      sock.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n");
    }
  });
});
server.listen(SOCK);

// client: connect, send one request, print the response
setTimeout(() => {
  const c = connect(SOCK, () => {
    c.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "echo", params: {hi: "there"} }) + "\n");
  });
  let out = "";
  c.on("data", (d) => {
    out += d.toString();
    const n = out.indexOf("\n");
    if (n >= 0) { console.log("response:", out.slice(0, n)); c.end(); server.close(); }
  });
}, 50);
```

## Example: named pipe tap (shell, runs as-is)
```bash
# terminal 1: a producer writing lines to a FIFO
FIFO="${TMPDIR:-/tmp}/agent-tap.$$"; mkfifo "$FIFO"
printf '%s\n' '{"event":"ready"}' '{"event":"done"}' > "$FIFO" &
# terminal 2: the consumer reads the same path
while IFS= read -r line; do printf 'got: %s\n' "$line"; done < "$FIFO"
rm -f "$FIFO"
```
Forwards/relays without writing a program: `socat UNIX-LISTEN:$SOCK,fork -` and
`socat - UNIX-CONNECT:$SOCK`.

## Backpressure
`write()` returning `false` means the kernel buffer is full. Pause and wait for
`drain` instead of piling on:

```ts
if (!sock.write(frame)) await new Promise((r) => sock.once("drain", r));
```

On the read side, prefer `for await (const chunk of sock)` over manual `data`
events so the stream applies backpressure to the producer. Unbounded buffering is
how a fast agent OOMs a slow one.

## Reliability
- **Timeouts** - always bound a wait. In HTTP, `AbortController`; on a socket, a
  timer that destroys the connection. The BFF bounds proxied calls at 60 s
  (`docs/09-sessions-keys-mcp.md`).
- **Idempotency keys** - a caller-supplied key so a retry does not double-act. WAFINE
  already forwards `idempotency-key` on MCP/REST calls
  (`app/bff/src/adapters/http/routes/gateway-proxy.ts:51`) and de-dupes inbound
  webhooks on the same idea with a 1-hour replay guard
  (`app/bff/src/adapters/http/routes/webhook.ts:13,94-97`). Concurrency-safe, not just
  "check then act".
- **Retries** - retry only idempotent work; exponential backoff **with jitter**; cap
  attempts; never retry a 4xx that is the client's fault. A retried send must reuse
  the same idempotency key.
- **At-least-once** - A2A push notifications are explicitly at-least-once and clients
  must process idempotently (`~/wafine/research/a2a.txt:1550-1554`). Assume duplicates.

## What this repo uses today
- JSON-RPC: parsed from proxied MCP bodies and error replies
  (`gateway-proxy.ts:108-121,203-211`).
- stdio: as an MCP **client** transport for local MCP servers
  (`app/bff/src/infrastructure/mcp/mcp-client-factory.ts:62-68`,
  `app/bff/src/domain/ports/mcp.ts:5-7`).
- gRPC, unix domain sockets, named pipes: **not found** in `app/bff` or `stack/`
  (they are general-purpose tools, not current WAFINE plumbing).

## References
- `~/wafine/research/mcp-transports.md` (stdio, Streamable HTTP)
- `~/wafine/research/a2a.txt` (JSON-RPC binding, idempotency, push delivery)
- https://www.jsonrpc.org/specification, https://grpc.io, `man 7 unix`, `man 3 mkfifo`
- `app/bff/src/adapters/http/routes/{gateway-proxy,webhook}.ts`
