import { describe, expect, it } from 'vitest';

import { computeStepTps, formatTps } from '#/utils/usage/step-tps';

describe('computeStepTps', () => {
  it('returns null when the step has nothing measurable to divide', () => {
    expect(computeStepTps(undefined, 5000)).toBeNull();
    expect(computeStepTps(0, 5000)).toBeNull();
    expect(computeStepTps(200, undefined)).toBeNull();
  });

  it('returns null for a step whose whole reply landed in one chunk', () => {
    // 286 tokens delivered inside 56 ms is a delivery artefact, not a decode
    // rate: the engine timed from the first chunk to the last, and there was
    // only one chunk.
    expect(computeStepTps(286, 56)).toBeNull();
    expect(computeStepTps(90, 50)).toBeNull();
    expect(computeStepTps(200, 249)).toBeNull();
  });

  it('divides output tokens by the streamed window in seconds', () => {
    expect(computeStepTps(200, 5000)).toBe(40);
    expect(computeStepTps(100, 250)).toBe(400);
  });
});

describe('formatTps', () => {
  it('always renders one decimal', () => {
    expect(formatTps(40)).toBe('40.0');
    expect(formatTps(5)).toBe('5.0');
    expect(formatTps(18.54)).toBe('18.5');
  });

  it('rounds to one decimal', () => {
    expect(formatTps(39.96)).toBe('40.0');
  });
});
