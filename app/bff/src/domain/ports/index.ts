/**
 * Domain ports (interfaces) — the hexagonal architecture boundary.
 * These define what the domain layer needs from infrastructure.
 * Implementations live in src/infrastructure/.
 */

// ── Crypto ports ──────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  version: number;
  algId: string;
}

export interface WrappedKey {
  wrappedKey: Uint8Array;
  nonce: Uint8Array;
  version: number;
  algId: string;
}

export interface ICryptoService {
  /** Encrypt plaintext with a DEK, binding AAD. */
  encrypt(plaintext: Uint8Array, dek: Uint8Array, aad: Uint8Array): Promise<EncryptedPayload>;

  /** Decrypt ciphertext with a DEK, verifying AAD. */
  decrypt(payload: EncryptedPayload, dek: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;

  /** Generate a random DEK (32 bytes). */
  generateDek(): Promise<Uint8Array>;

  /** Wrap a DEK with the tenant KEK. */
  wrapDek(dek: Uint8Array, kek: Uint8Array): Promise<WrappedKey>;

  /** Unwrap a DEK with the tenant KEK. */
  unwrapDek(wrapped: WrappedKey, kek: Uint8Array): Promise<Uint8Array>;
}

export interface IBlindIndexService {
  /** Compute a deterministic blind index for a value. */
  computeIndex(value: string, key: Uint8Array, context: string): Uint8Array;

  /** Normalize a value before indexing (NFC, trim, lowercase). */
  normalize(value: string): string;
}

export interface IKeyDerivationService {
  /** Derive KEK from passphrase + device_secret using Argon2id. */
  deriveKek(passphrase: string, deviceSecret: Uint8Array): Promise<Uint8Array>;

  /** Generate a random device secret (32 bytes). */
  generateDeviceSecret(): Uint8Array;

  /** Generate a random recovery mnemonic (256-bit entropy). */
  generateRecoveryMnemonic(): string;
}

// ── Storage ports ─────────────────────────────────────────────

export interface IMessageRepository {
  save(message: MessageEntity): Promise<MessageEntity>;
  findById(messageId: string, tenantId: string): Promise<MessageEntity | null>;
  findByTenant(tenantId: string, limit: number, offset: number): Promise<MessageEntity[]>;
  findBySender(senderRef: string, tenantId: string, limit: number): Promise<MessageEntity[]>;
  findByRecipient(recipientRef: string, tenantId: string, limit: number): Promise<MessageEntity[]>;
}

export interface IContactRepository {
  save(contact: ContactEntity): Promise<ContactEntity>;
  findById(contactId: string, tenantId: string): Promise<ContactEntity | null>;
  findByPhoneBlindIndex(tenantId: string, blindIndex: Uint8Array): Promise<ContactEntity | null>;
  findByJidBlindIndex(tenantId: string, blindIndex: Uint8Array): Promise<ContactEntity | null>;
  listByTenant(tenantId: string, limit: number, offset: number): Promise<ContactEntity[]>;
}

export interface IMediaRepository {
  save(media: MediaEntity): Promise<MediaEntity>;
  findById(mediaId: string, tenantId: string): Promise<MediaEntity | null>;
  findByMessage(messageId: string, tenantId: string): Promise<MediaEntity[]>;
}

export interface IStorageAdapter {
  /** Upload ciphertext to R2, return object key. */
  upload(bucket: string, key: string, data: Uint8Array, contentType?: string): Promise<void>;

  /** Generate a presigned URL for ciphertext download. */
  presignGet(bucket: string, key: string, ttlSeconds: number): Promise<string>;

  /** Delete an object. */
  delete(bucket: string, key: string): Promise<void>;
}

// ── Auth ports ────────────────────────────────────────────────

export interface ISessionCache {
  /** Cache an unwrapped KEK for a session. */
  cacheKek(sessionId: string, kek: Uint8Array, ttlSeconds: number): Promise<void>;

  /** Retrieve a cached KEK. Returns null if expired/missing. */
  getKek(sessionId: string): Promise<Uint8Array | null>;

  /** Invalidate a cached KEK (zeroize). */
  invalidateKek(sessionId: string): Promise<void>;
}

export interface IRateLimiter {
  /** Check if a request is allowed. Returns true if allowed. */
  isAllowed(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface IAuditLogger {
  log(event: AuditEvent): Promise<void>;
}

// ── Domain entities ───────────────────────────────────────────

export interface MessageEntity {
  messageId: string;
  tenantId: string;
  senderRef: string;
  recipientRef: string;
  ciphertext: Uint8Array;
  wrappedDek: Uint8Array;
  dekNonce: Uint8Array;
  dekVersion: number;
  algId: string;
  sentAt: Date;
  createdAt: Date;
}

export interface ContactEntity {
  contactId: string;
  tenantId: string;
  phoneBlindIndex: Uint8Array | null;
  jidBlindIndex: Uint8Array;
  nameCiphertext: Uint8Array | null;
  nameWrappedDek: Uint8Array | null;
  nameDekNonce: Uint8Array | null;
  nameDekVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaEntity {
  mediaId: string;
  tenantId: string;
  messageId: string | null;
  r2ObjectKey: string;
  ciphertextSize: number;
  wrappedDek: Uint8Array;
  dekNonce: Uint8Array;
  dekVersion: number;
  secretstreamHeader: Uint8Array | null;
  mimeType: string;
  createdAt: Date;
}

export interface TenantKeyEntity {
  tenantId: string;
  wrappedKek: Uint8Array;
  kekNonce: Uint8Array;
  kekVersion: number;
  algId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceEntity {
  deviceId: string;
  tenantId: string;
  wrappedKek: Uint8Array;
  devicePublicKey: Uint8Array;
  deviceName: string | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AuditEvent {
  auditId: string;
  tenantId: string;
  actorType: 'user' | 'agent' | 'system';
  actorId: string;
  action: 'unwrap' | 'rotate' | 'enroll' | 'revoke';
  resourceType: 'message' | 'contact' | 'media' | 'kek';
  resourceId: string | null;
  success: boolean;
  detail: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Agentic ports (ARD §3.2) ──────────────────────────────────

export * from './gateway.js';
export * from './mcp.js';
export * from './skills.js';
export * from './queue.js';
export * from './health.js';
export * from './workflows.js';
export * from './accounts.js';
export * from './wa-tenancy.js';
export * from './oauth.js';
export * from './send-budget.js';
export * from './admin.js';
export * from './waitlist.js';
export * from '../user-roles.js';
export * from './media.js';
