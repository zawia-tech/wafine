/**
 * WhatsApp tenancy port: which OpenWA session belongs to which user, and the per-user
 * API keys minted for it. One session per user in the PoC.
 *
 * API keys are stored only as SHA-256 hashes; the plaintext is shown to the user once.
 */

export interface WaSessionRecord {
  userId: string;
  /** OpenWA session id (UUID). */
  openwaSessionId: string;
  /** OpenWA session name (3-50 chars, letters/digits/hyphens). */
  name: string;
  createdAt: Date;
}

export interface WaApiKeyRecord {
  /** OpenWA API key id. */
  id: string;
  userId: string;
  /** First 12 characters of the key, for display only. */
  keyPrefix: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/** What the gateway passthrough needs to authorise a request made with a user key. */
export interface ActiveKeyOwner {
  keyId: string;
  userId: string;
  openwaSessionId: string;
}

export interface IWaTenancyRepository {
  getSession(userId: string): Promise<WaSessionRecord | null>;
  /** Returns false when the user already has a session (one per user). */
  createSession(record: Omit<WaSessionRecord, 'createdAt'>): Promise<boolean>;
  /** Deletes the session mapping and every key minted for it. */
  deleteSession(userId: string): Promise<void>;

  listKeys(userId: string): Promise<WaApiKeyRecord[]>;
  addKey(key: { id: string; userId: string; keyPrefix: string; keyHash: string }): Promise<void>;
  /** Marks the key revoked. Returns false if it is unknown, not the user's, or already revoked. */
  revokeKey(userId: string, keyId: string): Promise<boolean>;
  /** Active (not revoked) key with this SHA-256 hash, joined to its owner's session. */
  findActiveKeyByHash(keyHash: string): Promise<ActiveKeyOwner | null>;
}
