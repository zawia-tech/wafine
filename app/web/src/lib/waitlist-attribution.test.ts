import { describe, expect, it } from 'bun:test';
import { waitlistAttribution } from './waitlist-attribution';

describe('waitlistAttribution', () => {
  it('passes supported tags and drops invalid or oversized values', () => {
    expect(waitlistAttribution('?ref=Zawia_1&utm_source=Facebook&utm_campaign=Launch-2026&bad=x'))
      .toEqual({ ref: 'zawia_1', utm_source: 'facebook', utm_campaign: 'launch-2026' });
    expect(waitlistAttribution(`?ref=bad%20tag&utm_source=${'a'.repeat(65)}&utm_campaign=bad%20tag`)).toEqual({});
  });
});
