import { describe, expect, test } from 'bun:test';
import {
  hexToOklchComponents,
  oklchLightness,
  parseHexColor,
  readableContentComponents,
} from './color';

/** Compare "L% C H" against an expected triple. */
function expectComponents(actual: string | null, expected: [number, number, number]) {
  expect(actual).not.toBeNull();
  const parts = (actual as string).split(' ');
  const lightness = Number.parseFloat(parts[0] ?? 'NaN');
  const chroma = Number.parseFloat(parts[1] ?? 'NaN');
  const hue = Number.parseFloat(parts[2] ?? 'NaN');

  // Anchors below come from the CSS Color 4 spec samples, which round to 2-3 decimals.
  expect(lightness).toBeCloseTo(expected[0], 0);
  expect(chroma).toBeCloseTo(expected[1], 2);
  expect(hue).toBeCloseTo(expected[2], 0);
}

describe('parseHexColor', () => {
  test('accepts 3, 6 and 8 digit hex, with or without #', () => {
    expect(parseHexColor('#ffffff')).toEqual([255, 255, 255]);
    expect(parseHexColor('1a73e8')).toEqual([26, 115, 232]);
    expect(parseHexColor('#1A73E8')).toEqual([26, 115, 232]);
    expect(parseHexColor('#1a73e8ff')).toEqual([26, 115, 232]);
  });

  test('expands shorthand', () => {
    expect(parseHexColor('#f00')).toEqual([255, 0, 0]);
    expect(parseHexColor('#abc')).toEqual([170, 187, 204]);
  });

  test('rejects non-hex input', () => {
    for (const bad of ['', 'red', 'rgb(1,2,3)', '#12345', '#gggggg', '#12', '#1234567']) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });
});

describe('hexToOklchComponents', () => {
  test('white and black are neutral', () => {
    expect(hexToOklchComponents('#ffffff')).toBe('100% 0 0');
    expect(hexToOklchComponents('#000000')).toBe('0% 0 0');
  });

  test('matches the CSS Color 4 samples', () => {
    expectComponents(hexToOklchComponents('#ff0000'), [62.8, 0.2577, 29.23]);
    expectComponents(hexToOklchComponents('#00ff00'), [86.64, 0.2948, 142.5]);
    expectComponents(hexToOklchComponents('#0000ff'), [45.2, 0.3132, 264.05]);
  });

  test('shorthand equals long form', () => {
    expect(hexToOklchComponents('#f00')).toBe(hexToOklchComponents('#ff0000'));
  });

  test('returns null for unparseable input', () => {
    expect(hexToOklchComponents('tomato')).toBeNull();
  });
});

describe('oklchLightness', () => {
  test('increases with perceived lightness', () => {
    const black = oklchLightness('#000000') as number;
    const blue = oklchLightness('#1a73e8') as number;
    const white = oklchLightness('#ffffff') as number;
    expect(black).toBeCloseTo(0, 3);
    expect(white).toBeCloseTo(1, 3);
    expect(blue).toBeGreaterThan(black);
    expect(blue).toBeLessThan(white);
  });

  test('null for bad input', () => {
    expect(oklchLightness('nope')).toBeNull();
  });
});

describe('readableContentComponents', () => {
  test('white text on a dark brand color', () => {
    expect(readableContentComponents('#1a73e8')).toBe('100% 0 0');
    expect(readableContentComponents('#000000')).toBe('100% 0 0');
  });

  test('dark text on a light background', () => {
    expect(readableContentComponents('#ffd400')).not.toBe('100% 0 0');
    expect(readableContentComponents('#ffffff')).not.toBe('100% 0 0');
  });
});
