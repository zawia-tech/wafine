import { describe, it, expect } from 'bun:test';
import { clientIpFor, clientIpConfigFromEnv, type HeaderReader } from './client-ip.js';

const cfg = (trustedProxyHops: number, trustCfConnectingIp = false): { trustedProxyHops: number; trustCfConnectingIp: boolean } => ({
  trustedProxyHops,
  trustCfConnectingIp,
});

const req = (headers: Record<string, string>): HeaderReader => ({
  req: { header: (name: string) => headers[name.toLowerCase()] },
});

describe('clientIpFor', () => {
  it('takes the rightmost x-forwarded-for entry at the trusted hop depth', () => {
    // browser -> vercel -> funnel: client, vercel edge, funnel-internal
    const c = req({ 'x-forwarded-for': '1.1.1.1 , 2.2.2.2 , 3.3.3.3' });
    expect(clientIpFor(c, cfg(1))).toBe('3.3.3.3');
    expect(clientIpFor(c, cfg(2))).toBe('2.2.2.2');
    expect(clientIpFor(c, cfg(3))).toBe('1.1.1.1');
  });

  it('ignores a spoofed leftmost entry', () => {
    // Attacker prepends a fake IP; hops=1 must not pick it.
    const c = req({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7' });
    expect(clientIpFor(c, cfg(1))).toBe('7.7.7.7');
  });

  it('falls back to the fingerprint bucket when there are not enough entries', () => {
    const c = req({ 'x-forwarded-for': '2.2.2.2' });
    expect(clientIpFor(c, cfg(2))).toMatch(/^fp:/);
  });

  it('gives the same fingerprint for the same stable headers and a different one otherwise', () => {
    const base = req({ 'user-agent': 'ua1', 'accept-language': 'en' });
    expect(clientIpFor(base, cfg(0))).toBe(clientIpFor(req({ 'user-agent': 'ua1', 'accept-language': 'en' }), cfg(0)));
    expect(clientIpFor(base, cfg(0))).not.toBe(clientIpFor(req({ 'user-agent': 'ua2', 'accept-language': 'en' }), cfg(0)));
    // The raw forwarded chain is part of the fingerprint, so spoofing it rotates the bucket.
    expect(clientIpFor(base, cfg(0))).not.toBe(
      clientIpFor(req({ 'user-agent': 'ua1', 'accept-language': 'en', 'x-forwarded-for': '9.9.9.9' }), cfg(0)),
    );
  });

  it('uses the shared unknown bucket only when no header is present at all', () => {
    expect(clientIpFor(req({}), cfg(0))).toBe('unknown');
    expect(clientIpFor(req({ 'user-agent': 'curl' }), cfg(0))).toMatch(/^fp:/);
  });

  it('ignores cf-connecting-ip unless the trust flag is on', () => {
    const c = req({ 'cf-connecting-ip': '4.4.4.4', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
    expect(clientIpFor(c, cfg(1, false))).toBe('2.2.2.2');
    expect(clientIpFor(c, cfg(1, true))).toBe('4.4.4.4');
  });

  it('prefers cf-connecting-ip over x-forwarded-for when trusted (forgeable left entries lose)', () => {
    const c = req({ 'cf-connecting-ip': '4.4.4.4', 'x-forwarded-for': '6.6.6.6' });
    expect(clientIpFor(c, cfg(1, true))).toBe('4.4.4.4');
  });

  it('whitespace-safe entries and empty segments', () => {
    const c = req({ 'x-forwarded-for': '  , 1.1.1.1,  2.2.2.2 ' });
    expect(clientIpFor(c, cfg(1))).toBe('2.2.2.2');
  });

  it('never returns undefined: falls back when all headers are missing', () => {
    expect(clientIpFor(req({}), cfg(1))).toBe('unknown');
  });
});

describe('clientIpConfigFromEnv', () => {
  it('defaults to hop 1 and no CF trust', () => {
    expect(clientIpConfigFromEnv(() => undefined)).toEqual({ trustedProxyHops: 1, trustCfConnectingIp: false });
  });

  it('parses TRUSTED_PROXY_HOPS and the TRUST_CF_CONNECTING_IP flag', () => {
    expect(clientIpConfigFromEnv((n) => ({ TRUSTED_PROXY_HOPS: '3' }[n]))).toEqual({
      trustedProxyHops: 3,
      trustCfConnectingIp: false,
    });
    expect(
      clientIpConfigFromEnv((n) => ({ TRUSTED_PROXY_HOPS: '2', TRUST_CF_CONNECTING_IP: '1' }[n])),
    ).toEqual({ trustedProxyHops: 2, trustCfConnectingIp: true });
  });

  it('falls back to defaults on invalid values', () => {
    expect(clientIpConfigFromEnv((n) => ({ TRUSTED_PROXY_HOPS: '-2' }[n]))).toEqual({
      trustedProxyHops: 1,
      trustCfConnectingIp: false,
    });
    expect(clientIpConfigFromEnv((n) => ({ TRUSTED_PROXY_HOPS: 'NaN' }[n]))).toEqual({
      trustedProxyHops: 1,
      trustCfConnectingIp: false,
    });
    // '0' is a valid choice: trust nothing, fingerprint everything.
    expect(clientIpConfigFromEnv((n) => ({ TRUSTED_PROXY_HOPS: '0' }[n]))).toEqual({
      trustedProxyHops: 0,
      trustCfConnectingIp: false,
    });
    // Never reach into client-controlled data when computing whether CF is trusted.
    expect(clientIpConfigFromEnv((n) => ({ TRUST_CF_CONNECTING_IP: 'true' }[n]))).toEqual({
      trustedProxyHops: 1,
      trustCfConnectingIp: false,
    });
  });
});
