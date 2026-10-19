/**
 * R2 storage adapter — ciphertext-only operations.
 * Never stores or generates presigned URLs for plaintext.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageAdapter } from '../../domain/ports/index.js';
import { env } from '../../config/env.js';

export class R2StorageAdapter implements IStorageAdapter {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.s3Endpoint || `https://${env.r2AccountId}.eu.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }

  async upload(
    bucket: string,
    key: string,
    data: Uint8Array,
    contentType?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType ?? 'application/octet-stream',
      }),
    );
  }

  async presignGet(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }
}
