import { describe, it, expect } from 'bun:test';
import { S3MediaUrlSigner, inertContentType, normalizeKeyPrefix } from './s3-media-signer.js';

describe('S3MediaUrlSigner', () => {
  const signer = new S3MediaUrlSigner({
    endpoint: 'https://0123456789abcdef.eu.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'not-a-real-secret',
    bucket: 'openwa-media',
    keyPrefix: 'media',
  });

  it('signs a GET under the engine key prefix, as an inert attachment', async () => {
    const url = new URL(await signer.presignGet('chat-media/s-1/0b0e5f7e.jpg', 120));
    expect(url.hostname).toBe('0123456789abcdef.eu.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/openwa-media/media/chat-media/s-1/0b0e5f7e.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('response-content-type')).toBe('image/jpeg');
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="0b0e5f7e.jpg"');
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
  });

  it('signs path-style against an OCI-compatible endpoint with its own region', async () => {
    const oci = new S3MediaUrlSigner({
      endpoint: 'https://example-namespace.compat.objectstorage.example-region.oraclecloud.com',
      region: 'example-region',
      forcePathStyle: true,
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'not-a-real-secret',
      bucket: 'openwa-media',
      keyPrefix: 'media/',
    });
    const url = new URL(await oci.presignGet('chat-media/s-1/0b0e5f7e.jpg', 120));
    expect(url.hostname).toBe('example-namespace.compat.objectstorage.example-region.oraclecloud.com');
    expect(url.pathname).toBe('/openwa-media/media/chat-media/s-1/0b0e5f7e.jpg');
  });

  it('never hands out an active content type', () => {
    expect(inertContentType('chat-media/s/a.ogg')).toBe('audio/ogg');
    expect(inertContentType('chat-media/s/a.mp4')).toBe('video/mp4');
    for (const ext of ['bin', 'pdf', 'html', 'svg', 'js', 'xml']) {
      expect(inertContentType(`chat-media/s/a.${ext}`)).toBe('application/octet-stream');
    }
  });

  it('normalises the key prefix like the engine does', () => {
    expect(normalizeKeyPrefix('media/')).toBe('media/');
    expect(normalizeKeyPrefix(' media// ')).toBe('media/');
    expect(normalizeKeyPrefix('')).toBe('media/');
  });
});
