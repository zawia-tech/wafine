import { describe, expect, test } from 'bun:test';
import Image from './opengraph-image';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('root opengraph-image route', () => {
  test('returns a 1200x630 PNG', async () => {
    const response = await Image();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    // PNG IHDR: width at byte 16, height at byte 20.
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });
});
