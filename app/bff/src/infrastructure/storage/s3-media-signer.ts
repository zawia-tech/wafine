/**
 * Presigned GET links into the private media bucket, for files OpenWA's chat-media archive wrote.
 * Provider-neutral: any S3-compatible store (OCI Object Storage, Cloudflare R2, MinIO, AWS S3).
 *
 * The engine prefixes every object key with its S3_KEY_PREFIX (default `media/`), so the storage key
 * a message row reports (`chat-media/<session>/<file>`) maps to `<prefix><storage key>` in the bucket.
 * Links are always served as attachments with a content type from a short allow-list: whatever
 * mimetype a sender declared, the object never renders as active content.
 *
 * Separate from R2StorageAdapter on purpose: that adapter is the ciphertext-only store of the E2E
 * design, this one only reads what the engine already holds in plaintext.
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IMediaUrlSigner } from '../../domain/ports/index.js';

export interface S3MediaSignerConfig {
  /** S3 API endpoint, e.g. https://<namespace>.compat.objectstorage.<region>.oraclecloud.com */
  endpoint: string;
  /** Region the endpoint expects; R2 takes `auto`, OCI its real region. */
  region?: string;
  /** Path-style addressing (bucket in the path, one hostname). True for OCI/MinIO, fine for R2. */
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** OpenWA's S3_KEY_PREFIX. */
  keyPrefix: string;
}

/** Extensions OpenWA's archive derives from the mimetype, mapped to types that never execute. */
const INERT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  '3gpp': 'video/3gpp',
  mov: 'video/quicktime',
  ogg: 'audio/ogg',
  mpeg: 'audio/mpeg',
  aac: 'audio/aac',
  amr: 'audio/amr',
  wav: 'audio/wav',
};

export function inertContentType(storageKey: string): string {
  const ext = storageKey.slice(storageKey.lastIndexOf('.') + 1).toLowerCase();
  return INERT_TYPES[ext] ?? 'application/octet-stream';
}

/** Same normalisation as OpenWA: trimmed, exactly one trailing '/', blank means `media/`. */
export function normalizeKeyPrefix(raw: string): string {
  const body = raw.trim().replace(/\/+$/, '');
  return body ? `${body}/` : 'media/';
}

export class S3MediaUrlSigner implements IMediaUrlSigner {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(config: S3MediaSignerConfig) {
    this.client = new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      // Path-style, like stack/backup.sh and preflight.sh: one hostname for every bucket. OCI's
      // compat endpoint has no virtual-host form, so this must stay on unless a store needs it off.
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
    this.keyPrefix = normalizeKeyPrefix(config.keyPrefix);
  }

  async presignGet(storageKey: string, ttlSeconds: number): Promise<string> {
    const fileName = storageKey.slice(storageKey.lastIndexOf('/') + 1);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: `${this.keyPrefix}${storageKey}`,
      ResponseContentType: inertContentType(storageKey),
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
      ResponseCacheControl: 'private, no-store',
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }
}
