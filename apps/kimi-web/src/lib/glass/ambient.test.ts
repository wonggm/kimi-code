// apps/kimi-web/src/lib/glass/ambient.test.ts
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_MAX_ADJUST,
  PROBE_BUDGET_OPTIONS,
  FrameBudget,
  ProbeWatchdog,
  ambientCssAdjust,
  meanLuminance,
  relativeLuminance,
  tintAdjustFromLuma,
} from './ambient';

describe('backdrop luminance', () => {
  it('uses Rec. 709 weights on the gamma-encoded channels the shader uses', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1);
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126);
    expect(relativeLuminance(0, 255, 0)).toBeCloseTo(0.7152);
    expect(relativeLuminance(0, 0, 255)).toBeCloseTo(0.0722);
  });

  it('averages luminance over an RGBA buffer, ignoring alpha', () => {
    const blackWhite = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 40]);
    expect(meanLuminance(blackWhite)).toBeCloseTo(0.5);
    const grey = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]);
    expect(meanLuminance(grey)).toBeCloseTo(128 / 255);
  });

  it('returns NaN on an empty or short buffer so callers keep the neutral tint', () => {
    expect(meanLuminance(new Uint8ClampedArray([]))).toBeNaN();
    expect(meanLuminance(new Uint8ClampedArray([1, 2]))).toBeNaN();
  });
});

describe('ambient tint mapping', () => {
  it('is neutral when the region looks like the page', () => {
    expect(tintAdjustFromLuma(0.12, 0.12)).toBe(0);
    expect(tintAdjustFromLuma(0.94, 0.94)).toBe(0);
  });

  it('deepens below the page reference and lifts above it', () => {
    expect(tintAdjustFromLuma(0.4, 0.5)).toBeLessThan(0);
    expect(tintAdjustFromLuma(0.6, 0.5)).toBeGreaterThan(0);
  });

  it('saturates a quarter of the luminance range away from the reference', () => {
    // AMBIENT_FULL_ADJUST_SPAN = 0.25 → ±0.25 from the reference hits the clamp.
    expect(tintAdjustFromLuma(0.25, 0.5)).toBeCloseTo(-AMBIENT_MAX_ADJUST);
    expect(tintAdjustFromLuma(0.75, 0.5)).toBeCloseTo(AMBIENT_MAX_ADJUST);
    // and never past it, however extreme the region is
    expect(tintAdjustFromLuma(0, 1)).toBeCloseTo(-AMBIENT_MAX_ADJUST);
    expect(tintAdjustFromLuma(1, 0)).toBeCloseTo(AMBIENT_MAX_ADJUST);
  });

  it('is monotonic and sub-saturating for ordinary content variation', () => {
    const a = tintAdjustFromLuma(0.44, 0.5);
    const b = tintAdjustFromLuma(0.47, 0.5);
    expect(a).toBeLessThan(b);
    expect(Math.abs(b)).toBeLessThan(AMBIENT_MAX_ADJUST);
  });

  it('treats an unreadable sample or reference as neutral, not an extreme', () => {
    expect(tintAdjustFromLuma(Number.NaN, 0.5)).toBe(0);
    expect(tintAdjustFromLuma(Number.POSITIVE_INFINITY, 0.5)).toBe(0);
    expect(tintAdjustFromLuma(0.5, Number.NaN)).toBe(0);
  });
});

describe('ambient CSS delivery', () => {
  it('writes exactly one non-zero channel', () => {
    const deepened = ambientCssAdjust(-0.06);
    expect(deepened).toEqual({ deepen: '6.00%', lift: '0%' });
    const lifted = ambientCssAdjust(0.06);
    expect(lifted).toEqual({ deepen: '0%', lift: '6.00%' });
  });

  it('is a no-op at neutral', () => {
    expect(ambientCssAdjust(0)).toEqual({ deepen: '0%', lift: '0%' });
    expect(ambientCssAdjust(Number.NaN)).toEqual({ deepen: '0%', lift: '0%' });
  });
});

describe('frame budget', () => {
  const budget = (over = {}) =>
    new FrameBudget({
      budgetMs: 20,
      windowMs: 2000,
      minSamples: 8,
      minSpanMs: 900,
      idleGapMs: 1200,
      ...over,
    });

  it('stays quiet below the budget', () => {
    const b = budget();
    let tripped = false;
    for (let i = 0; i < 200; i++) tripped = b.sample(8, i * 16) || tripped;
    expect(tripped).toBe(false);
    expect(b.demoted).toBe(false);
    expect(b.averageMs).toBeCloseTo(8);
  });

  it('needs both the sample count and an activity span before deciding', () => {
    const fewSamples = budget();
    for (let i = 0; i < 7; i++) expect(fewSamples.sample(120, i * 300)).toBe(false);
    expect(fewSamples.demoted).toBe(false);
    // 12 samples but all inside 100ms: not yet a sustained trend.
    const noSpan = budget();
    for (let i = 0; i < 12; i++) expect(noSpan.sample(120, i * 8)).toBe(false);
    expect(noSpan.demoted).toBe(false);
  });

  it('latches once the sustained average exceeds the budget', () => {
    const b = budget();
    let tripped = false;
    for (let i = 0; i < 200 && !tripped; i++) tripped = b.sample(40, i * 16);
    expect(tripped).toBe(true);
    expect(b.demoted).toBe(true);
  });

  it('trips at the default settings on a loop that costs 40ms per pass', () => {
    const b = new FrameBudget();
    let tripped = false;
    // 150ms apart: the real capture debounce cadence.
    for (let i = 0; i < 60 && !tripped; i++) tripped = b.sample(40, i * 150);
    expect(tripped).toBe(true);
  });

  it('is one-way: a fast frame afterwards does not undemote it', () => {
    const b = budget();
    for (let i = 0; i < 200; i++) b.sample(40, i * 16);
    expect(b.demoted).toBe(true);
    expect(b.sample(1, 99999)).toBe(false);
    expect(b.demoted).toBe(true);
  });

  it('keeps reporting the average that tripped it (debug read)', () => {
    const b = budget();
    for (let i = 0; i < 200; i++) b.sample(40, i * 16);
    expect(b.demoted).toBe(true);
    expect(b.averageMs).toBeCloseTo(40);
  });

  it('drops an isolated spike once it leaves the window', () => {
    const b = budget();
    for (let i = 0; i < 40; i++) b.sample(4, i * 16);
    b.sample(400, 640);
    let tripped = false;
    for (let i = 41; i < 400; i++) tripped = b.sample(4, i * 16) || tripped;
    expect(tripped).toBe(false);
  });

  it('only applies the majority guard when asked, and then blocks an outlier verdict', () => {
    const guarded = new FrameBudget({ budgetMs: 20, windowMs: 2000, minSamples: 4, minSpanMs: 1000, minOverBudgetSamples: 3 });
    // One enormous pass among cheap ones: the mean clears 20ms, but only one
    // sample is individually over budget, so no verdict.
    const costs = [8, 8, 200, 8, 8, 8];
    let tripped = false;
    costs.forEach((c, i) => {
      tripped = guarded.sample(c, i * 400) || tripped;
    });
    expect(tripped).toBe(false);
    expect(guarded.demoted).toBe(false);

    // Same window with the guard off (the GL budget's semantics): the spike
    // does drag the mean over and the watchdog latches.
    const plain = new FrameBudget({ budgetMs: 20, windowMs: 2000, minSamples: 4, minSpanMs: 1000 });
    let plainTripped = false;
    costs.forEach((c, i) => {
      plainTripped = plain.sample(c, i * 400) || plainTripped;
    });
    expect(plainTripped).toBe(true);
  });

  it('ignores junk samples and resets on demand', () => {
    const b = budget();
    expect(b.sample(Number.NaN, 0)).toBe(false);
    expect(b.sample(-5, 16)).toBe(false);
    expect(b.sample(10, Number.NaN)).toBe(false);
    expect(b.sampleCount).toBe(0);
    b.sample(40, 0);
    b.reset();
    expect(b.demoted).toBe(false);
    expect(b.averageMs).toBe(0);
  });
});

describe('probe watchdog (non-WebGL ambient budget)', () => {
  // The probe's real minimum cadence, measured in useGlassRefraction: 300ms
  // trailing debounce + 600ms minimum gap between passes.
  const CADENCE_MS = 600;
  const run = (w: ProbeWatchdog, costs: number[], stepMs = CADENCE_MS) => {
    let tripped = false;
    const trips: number[] = [];
    costs.forEach((cost, i) => {
      if (w.sample(cost, i * stepMs)) {
        tripped = true;
        trips.push(i);
      }
    });
    return { tripped, trips };
  };

  it('is sized above the measured normal pass and below the pathological one', () => {
    // Measured on the real shell: ~1.8ms mean, 2.6ms p95; 4.9ms p95 / 10.2ms
    // worst single pass with a 400-row deep stack over the sampled region.
    expect(PROBE_BUDGET_OPTIONS.budgetMs).toBeGreaterThan(4.9);
    expect(PROBE_BUDGET_OPTIONS.budgetMs).toBeLessThan(20);
    expect(PROBE_BUDGET_OPTIONS.windowMs).toBeGreaterThanOrEqual(4000);
  });

  it('never trips on the measured cost profile, however long the stream runs', () => {
    const w = new ProbeWatchdog();
    const costs = Array.from({ length: 120 }, (_, i) => (i % 17 === 0 ? 4.9 : 1.8));
    expect(run(w, costs).tripped).toBe(false);
    expect(w.demoted).toBe(false);
    expect(w.passCount).toBe(120);
  });

  it('trips on sustained over-budget passes, and reports it exactly once', () => {
    const w = new ProbeWatchdog();
    const { tripped, trips } = run(w, Array.from({ length: 40 }, () => 14));
    expect(tripped).toBe(true);
    expect(trips).toHaveLength(1);
    // 8 samples of 600ms cadence, so the trip needs ~4s of sustained cost.
    expect(trips[0]).toBeGreaterThanOrEqual((PROBE_BUDGET_OPTIONS.minSamples ?? 8) - 1);
  });

  it('is one-way: cheap passes afterwards do not bring the read back', () => {
    const w = new ProbeWatchdog();
    run(w, Array.from({ length: 40 }, () => 14));
    expect(w.demoted).toBe(true);
    expect(run(w, Array.from({ length: 30 }, () => 0.1)).tripped).toBe(false);
    expect(w.demoted).toBe(true);
  });

  it('ignores an isolated spike', () => {
    const w = new ProbeWatchdog();
    const costs = Array.from({ length: 60 }, (_, i) => (i === 30 ? 120 : 2));
    expect(run(w, costs).tripped).toBe(false);
  });

  it('drops history across an idle gap, so bursts cannot accumulate', () => {
    const w = new ProbeWatchdog();
    // Seven expensive passes (just under minSamples), a 5s silence, then seven
    // more: the gap resets the window, so neither burst can complete a verdict.
    for (let i = 0; i < 7; i++) expect(w.sample(40, i * CADENCE_MS)).toBe(false);
    for (let i = 7; i < 14; i++) expect(w.sample(40, i * CADENCE_MS + 5000)).toBe(false);
    expect(w.demoted).toBe(false);
  });

  it('ignores junk samples without counting a verdict', () => {
    const w = new ProbeWatchdog();
    expect(w.sample(Number.NaN, 0)).toBe(false);
    expect(w.sample(-3, 600)).toBe(false);
    expect(w.sample(40, Number.NaN)).toBe(false);
    expect(w.demoted).toBe(false);
    expect(w.averageMs).toBe(0);
  });
});
