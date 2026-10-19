---
name: agentic-sockets-streaming
description: Stream between agents and clients - WebSocket, Server-Sent Events (SSE), MCP Streamable HTTP, long polling, heartbeats and reconnect rules - and whether the WAFINE BFF streams today. Use when a feature needs live updates, when choosing SSE vs WebSocket vs long polling, or when diagnosing a dropped stream or reconnect problem.
---

# Sockets and streaming

When an agent must push progress to a client, pick by direction and transport.
Server-to-client over HTTP: **SSE**. Bidirectional: **WebSocket**. Tool calls: MCP
**Streamable HTTP**. No persistent connection allowed: **long polling**.

## The options
| Mechanism | Direction | Transport | Reconnect story |
|---|---|---|---|
| SSE | server → client | HTTP `text/event-stream` | built-in: `Last-Event-ID` on reconnect |
| WebSocket | both | RFC 6455 upgrade | you implement backoff + resume |
| MCP Streamable HTTP | both (JSON-RPC) | HTTP POST/GET + optional SSE | per-session `Mcp-Session-Id`, resumable SSE |
| Long polling | server → client | repeated HTTP GET | each poll is a fresh request |

## SSE
`Content-Type: text/event-stream`. Frames are fields: `event:` (name), `id:`
(cursor), `data:` (payload, may repeat; terminates on a blank line), `retry:`
(client backoff ms). The browser `EventSource` reconnects automatically and sends
`Last-Event-ID` (`https://html.spec.whatwg.org/multipage/server-sent-events.html`).
- **Heartbeats**: emit a comment line (`: ping\n\n`) every ~15-30 s so proxies do
  not idle-close the stream.
- **One stream, many events**: 
Run one frame per `TaskStatusUpdateEvent`/`TaskArtifactUpdateEvent`.

```ts
// Bun SSE server — run: bun sse.ts (see it at http://localhost:3000/events)
const enc = new TextEncoder();
Bun.serve({ port: 3000, fetch: (req) => {
  if (new URL(req.url).pathname !== "/events") return new Response("not found", { status: 404 });
  let n = 0;
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode("retry: 3000\n\n"));
      const timer = setInterval(() => {
        if (++n > 5) { clearInterval(timer); ctrl.close(); return; }
        ctrl.enqueue(enc.encode(`id: ${n}\nevent: tick\ndata: ${JSON.stringify({n})}\n\n`));
      }, 1000);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}});
```

## WebSocket
RFC 6455: an HTTP upgrade, then length-prefixed frames. Has built-in `ping`/`pong`
control frames - send a ping on a timer and close on a missed pong. Close codes
(`1000` normal, `1001` going away, `1011` server error) tell the peer why.
```ts
// Bun WS echo — run: bun ws.ts
Bun.serve({ port: 3001, fetch(req, server) {
  return server.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
}, websocket: { message(ws, m) { ws.send(`echo:${m}`); } } });
```
Heartbeats here are protocol `ping` frames, not text - do not confuse them with app
messages.

## MCP Streamable HTTP (the transport WAFINE uses)
One endpoint supporting POST and GET (`~/wafine/research/mcp-transports.md:52-137`):
- Every client JSON-RPC message is a **new POST**. Client `Accept` must list both
  `application/json` and `text/event-stream`.
- A request gets either one JSON object or an **SSE stream**; the response for the
  request arrives on that stream, which then closes. Notifications/responses get
  `202 Accepted` with no body.
- GET opens a server→client SSE stream, unrelated to any in-flight request.
- Optional **`Mcp-Session-Id`** header (from initialize); a terminated session answers
  `404`, and the client starts a new session (mcp-transports.md:170-198).
- **Resumability**: SSE `id` + `Last-Event-ID` to replay what a broken stream missed
  (mcp-transports.md:147-168).
- Send `MCP-Protocol-Version`; an unsupported value is `400` (mcp-transports.md:240-256).
- Security: validate `Origin`, bind loopback when local, authenticate (mcp-transports.md:72-80).

## Long polling
Hold the request open until an event arrives or a timeout (~30 s) fires, then return.
Cheap on infrastructure that forbids SSE; costs a request per timeout and adds
latency. Always return `Retry-After`-style guidance or an empty heartbeat, never a
silent hang.

## Reconnect rules (all mechanisms)
- Exponential backoff **with jitter**, capped (e.g. 1s → 30s).
- Resume where you can: SSE `Last-Event-ID`, MCP `Mcp-Session-Id`. Otherwise re-fetch
  state (`GetTask`, `GET /tasks/{id}`) before subscribing again.
- On the server, tag events with a monotonic cursor so a reconnecting client is not
  handed duplicates as if new; clients dedupe on the cursor id.
- A2A requires events delivered in generation order and allows multiple concurrent
  streams per task (`~/wafine/research/a2a.txt:1196-1209`).

## Does the WAFINE BFF stream today?
**It does not originate a stream** - no SSE, WebSocket, `streamSSE` or `EventSource`
route exists in `app/bff` (not found). What exists:
- **Transparent pass-through**: the proxy returns the upstream body unchanged
  (`return new Response(..., res.body, ...)`, `gateway-proxy.ts:258`), and because it
  forwards `accept` (`gateway-proxy.ts:51`) an SSE body from the engine's `/mcp` flows
  through. A test asserts `content-type: text/event-stream` propagation
  (`app/bff/src/adapters/http/oauth.test.ts:275`).
- **Inbound body reading only**: webhook ingestion reads `req.body.getReader()`
  (`app/bff/src/adapters/http/routes/webhook.ts:19-38`) - that is input, not a
  client-facing stream.
- The Vercel web proxy relays `res.body` too but only for `/api/*`
  (`app/web/src/lib/bff-proxy.ts:21,195`), so `/mcp` is not streamed through the web app.
- SSE is listed as **future** design only (`docs/05-bff-frontend-plan.md:31,140`).

If a WAFINE feature needs live updates, that is new work: add an SSE route in the BFF
(Hono) and an `EventSource`/fetch-stream consumer in the web app - do not claim a
stream that is not there.

## References
- `~/wafine/research/mcp-transports.md`, `~/wafine/research/a2a.txt`
- https://html.spec.whatwg.org/multipage/server-sent-events.html, RFC 6455
- `app/bff/src/adapters/http/routes/gateway-proxy.ts`, `app/web/src/lib/bff-proxy.ts`
