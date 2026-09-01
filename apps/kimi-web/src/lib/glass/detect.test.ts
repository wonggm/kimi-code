// apps/kimi-web/src/lib/glass/detect.test.ts
import { describe, expect, it } from 'vitest';
import {
  blurToDownsampleFactor,
  glassPixelRatio,
  needsWebglRefraction,
  parseNumberToken,
  parsePercentToken,
  parsePxToken,
  type GlassEngineEnv,
} from './detect';

const blink = { supportsUrlBackdrop: true, isBlink: true };
const env = (over: Partial<GlassEngineEnv>): GlassEngineEnv => ({
  supportsUrlBackdrop: true,
  isBlink: true,
  liquidGlassOn: true,
  reducedTransparency: false,
  ...over,
});

describe('needsWebglRefraction', () => {
  it('stays off on Chromium where CSS renders the url() refraction', () => {
    expect(needsWebglRefraction(env(blink))).toBe(false);
  });

  it('activates on Firefox/Safari, which parse but do not render url()', () => {
    expect(needsWebglRefraction(env({ ...blink, isBlink: false }))).toBe(true);
  });

  it('activates when the probe itself fails (no @supports chain applied)', () => {
    expect(needsWebglRefraction(env({ supportsUrlBackdrop: false }))).toBe(true);
  });

  it('respects the liquid-glass toggle and reduced transparency', () => {
    expect(needsWebglRefraction(env({ ...blink, isBlink: false, liquidGlassOn: false }))).toBe(false);
    expect(
      needsWebglRefraction(env({ ...blink, isBlink: false, reducedTransparency: true })),
    ).toBe(false);
  });
});

describe('token parsers', () => {
  it('parses px lengths only in plain forms', () => {
    expect(parsePxToken('8px')).toBe(8);
    expect(parsePxToken(' 20.5px ')).toBe(20.5);
    expect(parsePxToken('0')).toBe(0);
    expect(parsePxToken('calc(8px + 2px)')).toBeNull();
    expect(parsePxToken('')).toBeNull();
    expect(parsePxToken(null)).toBeNull();
  });

  it('parses saturate percentages and unitless numbers', () => {
    expect(parsePercentToken('190%')).toBeCloseTo(1.9);
    expect(parsePercentToken('1.9')).toBeNull();
    expect(parseNumberToken('1.04')).toBeCloseTo(1.04);
    expect(parseNumberToken('1.04 ')).toBeCloseTo(1.04);
    expect(parseNumberToken('abc')).toBeNull();
  });
});

describe('snapshot/texture sizing', () => {
  it('maps blur px to a bounded downsample factor', () => {
    expect(blurToDownsampleFactor(0)).toBe(1);
    expect(blurToDownsampleFactor(8)).toBeCloseTo(0.275);
    expect(blurToDownsampleFactor(34)).toBeGreaterThan(0.055);
    expect(blurToDownsampleFactor(200)).toBe(0.055);
  });

  it('caps the device pixel ratio at 1.5', () => {
    expect(glassPixelRatio(1)).toBe(1);
    expect(glassPixelRatio(2)).toBe(1.5);
    expect(glassPixelRatio(3)).toBe(1.5);
    expect(glassPixelRatio(0)).toBe(1);
  });
});
