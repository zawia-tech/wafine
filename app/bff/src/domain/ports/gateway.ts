/**
 * Messaging gateway port — the OpenWA REST surface (see OpenWA/docs/06-api-specification.md).
 */

export type OpenWaSessionStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'action_required'
  | 'failed';

export interface OpenWaSession {
  id: string;
  name: string;
  status: OpenWaSessionStatus;
  /** Linked WhatsApp number as bare digits (e.g. `212612345678`), once the device is linked. */
  phone: string | null;
  /** Engine error detail when `status` is `failed` or `action_required`. */
  lastError: string | null;
}

export interface CreateSessionInput {
  name: string;
}

export interface QrCode {
  sessionId: string;
  /** PNG as a `data:image/png;base64,...` URL (OpenWA `qrCode`). Rotates every few seconds. */
  qrCode: string;
  status: OpenWaSessionStatus;
}

export type ApiKeyRole = 'admin' | 'operator' | 'viewer';

export interface CreateApiKeyInput {
  name: string;
  role: ApiKeyRole;
  /** OpenWA session ids (UUIDs, never names) the key is confined to. */
  allowedSessions: string[];
}

export interface CreatedApiKey {
  id: string;
  keyPrefix: string;
  /** Plaintext key (`owa_k1_...`). OpenWA returns it exactly once; never log or store it. */
  apiKey: string;
}

export interface SendTextInput {
  sessionId: string;
  chatId: string;
  text: string;
  mentions?: string[];
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface SendMediaInput {
  sessionId: string;
  chatId: string;
  kind: MediaKind;
  url?: string;
  base64?: string;
  mimetype?: string;
  filename?: string;
  caption?: string;
}

export interface SendResult {
  messageId: string;
  timestamp: string;
}

export interface OpenWaWebhookEnvelope {
  event: string;
  timestamp: string;
  sessionId: string;
  idempotencyKey: string;
  deliveryId: string;
  data: unknown;
}

/**
 * Outbound messaging gateway. Port of the OpenWA HTTP API.
 */
export interface IWhatsAppGateway {
  listSessions(): Promise<OpenWaSession[]>;
  /** Read chat summaries from a single session. The caller must resolve the session through tenancy. */
  listChats(sessionId: string, query: { limit: number; offset: number }): Promise<unknown>;
  /** Read one chat's messages without inline media payloads. */
  listMessages(
    sessionId: string,
    query: { chatId: string; limit: number; offset: number; inlineMedia: false },
  ): Promise<unknown>;
  getSession(sessionId: string): Promise<OpenWaSession>;
  createSession(input: CreateSessionInput): Promise<OpenWaSession>;
  getQr(sessionId: string): Promise<QrCode>;
  startSession(sessionId: string): Promise<OpenWaSession>;
  /** Unlink the device and stop the session; a new QR scan is needed afterwards. */
  logoutSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  /** Admin-only on the gateway: requires the BFF's key to be an unscoped admin key. */
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  revokeApiKey(keyId: string): Promise<void>;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  /**
   * True when the gateway is live AND accepts our API key. `/api/health` is public, so a
   * liveness-only check would report ready while real calls 401 on a stale key.
   */
  health(): Promise<boolean>;
}

/**
 * Verifies an inbound OpenWA webhook over the raw request body.
 * Signature: `X-OpenWA-Signature: sha256=<HMAC-SHA256(secret, rawBody)>`.
 */
export interface IWebhookVerifier {
  verify(rawBody: Uint8Array, signature: string | undefined): boolean;
}
