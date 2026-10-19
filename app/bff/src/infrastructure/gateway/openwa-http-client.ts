/**
 * OpenWA HTTP client — implements IWhatsAppGateway (OpenWA/docs/06-api-specification.md).
 */

import type {
  IWhatsAppGateway,
  OpenWaSession,
  OpenWaSessionStatus,
  CreateSessionInput,
  QrCode,
  CreateApiKeyInput,
  CreatedApiKey,
  SendTextInput,
  SendMediaInput,
  SendResult,
} from '../../domain/ports/index.js';
import { env } from '../../config/env.js';

export class OpenWaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
    /** Seconds from a `Retry-After` header, when the gateway sent one. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'OpenWaApiError';
  }
}

interface OpenWaSessionDto {
  id: string;
  name: string;
  status: string;
  phone?: string | null;
  lastError?: string | null;
}

interface SendResultDto {
  messageId: string;
  timestamp: string;
}

interface QrCodeDto {
  qrCode: string;
  status: string;
}

interface CreatedApiKeyDto {
  id: string;
  keyPrefix: string;
  apiKey: string;
}

const MEDIA_PATHS: Record<SendMediaInput['kind'], string> = {
  image: 'send-image',
  video: 'send-video',
  audio: 'send-audio',
  document: 'send-document',
  sticker: 'send-sticker',
};

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toSession(dto: OpenWaSessionDto): OpenWaSession {
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status as OpenWaSessionStatus,
    phone: dto.phone ?? null,
    lastError: dto.lastError ?? null,
  };
}

export class OpenWaHttpClient implements IWhatsAppGateway {
  constructor(
    private readonly baseUrl: string = env.openwaBaseUrl,
    private readonly apiKey: string = env.openwaApiKey,
    private readonly timeoutMs: number = env.openwaTimeoutMs,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const parsed = await readBody(res);
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      throw new OpenWaApiError(
        res.status,
        parsed,
        `OpenWA ${method} ${path} → ${res.status}`,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    return parsed as T;
  }

  async listSessions(): Promise<OpenWaSession[]> {
    const dtos = await this.request<OpenWaSessionDto[]>('GET', '/api/sessions');
    return dtos.map(toSession);
  }

  async listChats(sessionId: string, query: { limit: number; offset: number }): Promise<unknown> {
    const params = new URLSearchParams({ limit: String(query.limit), offset: String(query.offset) });
    return this.request(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}/chats?${params.toString()}`,
    );
  }

  async listMessages(
    sessionId: string,
    query: { chatId: string; limit: number; offset: number; inlineMedia: false },
  ): Promise<unknown> {
    const params = new URLSearchParams({
      chatId: query.chatId,
      limit: String(query.limit),
      offset: String(query.offset),
      inlineMedia: 'false',
    });
    return this.request(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}/messages?${params.toString()}`,
    );
  }

  async getSession(sessionId: string): Promise<OpenWaSession> {
    const dto = await this.request<OpenWaSessionDto>(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}`,
    );
    return toSession(dto);
  }

  async createSession(input: CreateSessionInput): Promise<OpenWaSession> {
    const dto = await this.request<OpenWaSessionDto>('POST', '/api/sessions', {
      name: input.name,
    });
    return toSession(dto);
  }

  async getQr(sessionId: string): Promise<QrCode> {
    const dto = await this.request<QrCodeDto>(
      'GET',
      `/api/sessions/${encodeURIComponent(sessionId)}/qr`,
    );
    return { sessionId, qrCode: dto.qrCode, status: dto.status as OpenWaSessionStatus };
  }

  async startSession(sessionId: string): Promise<OpenWaSession> {
    const dto = await this.request<OpenWaSessionDto>(
      'POST',
      `/api/sessions/${encodeURIComponent(sessionId)}/start`,
    );
    return toSession(dto);
  }

  async logoutSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}/logout`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const dto = await this.request<CreatedApiKeyDto>('POST', '/api/auth/api-keys', {
      name: input.name,
      role: input.role,
      allowedSessions: input.allowedSessions,
    });
    return { id: dto.id, keyPrefix: dto.keyPrefix, apiKey: dto.apiKey };
  }

  async revokeApiKey(keyId: string): Promise<void> {
    await this.request('POST', `/api/auth/api-keys/${encodeURIComponent(keyId)}/revoke`);
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const dto = await this.request<SendResultDto>(
      'POST',
      `/api/sessions/${encodeURIComponent(input.sessionId)}/messages/send-text`,
      { chatId: input.chatId, text: input.text, mentions: input.mentions },
    );
    return { messageId: dto.messageId, timestamp: dto.timestamp };
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    const payload: Record<string, unknown> = { chatId: input.chatId };
    if (input.url !== undefined) payload['url'] = input.url;
    if (input.base64 !== undefined) payload['base64'] = input.base64;
    if (input.mimetype !== undefined) payload['mimetype'] = input.mimetype;
    if (input.filename !== undefined) payload['filename'] = input.filename;
    if (input.caption !== undefined) payload['caption'] = input.caption;

    const dto = await this.request<SendResultDto>(
      'POST',
      `/api/sessions/${encodeURIComponent(input.sessionId)}/messages/${MEDIA_PATHS[input.kind]}`,
      payload,
    );
    return { messageId: dto.messageId, timestamp: dto.timestamp };
  }

  /**
   * Ready only if the gateway is up AND accepts our API key. `/api/health` is public, so a
   * liveness-only check reports "up" while every real call would 401 on a stale key.
   */
  async health(): Promise<boolean> {
    try {
      const live = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!live.ok) return false;
      const authed = await fetch(`${this.baseUrl}/api/sessions`, {
        headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return authed.ok;
    } catch {
      return false;
    }
  }
}
