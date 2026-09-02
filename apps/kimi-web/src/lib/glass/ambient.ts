// apps/kimi-web/src/lib/glass/ambient.ts
// Direction C ("two-regime ambient"): the content-aware tint mapping and the
// frame-budget tracker that decides when the refractive regime demotes itself
// to the designed opaque state.
//
// The pure part (luminance math, the tint mapping, the budget) has no DOM
// access and is unit-tested in ambient.test.ts. The DOM part at the bottom
// delivers a measurement to a surface — a CSS variable per panel — and does the
// two cheap luminance reads: a coarse hit-test grid for the page as a whole,
// and the same grid inside one panel's rect.
//
// The reference is always the page's OWN current luminance, never a theme
// constant: a panel is compared against what is on screen behind everything
// else, so ordinary scroll variation leaves the tint alone and only a genuinely
// darker or brighter region behind the surface moves it.

/** Maximum luminance adjustment in either direction (±12%). */
export const AMBIENT_MAX_ADJUST = 0.12;

/** How far (in luminance) a region must sit from the page average to saturate
 *  the adjustment. A quarter of the luminance range: text-vs-code-block scale,
 *  not a hair-trigger. */
export const AMBIENT_FULL_ADJUST_SPAN = 0.25;

/** Relative luminance weights (Rec. 709 on gamma-encoded sRGB), matching the
 *  `luma` the refraction shader computes — sample and shader must agree or the
 *  GL and CSS regimes drift apart on the same panel. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Mean relative luminance (0…1) over an RGBA byte buffer, optionally strided. */
export function meanLuminance(rgba: ArrayLike<number>, stride = 4, step = stride): number {
  if (rgba.length < stride) return Number.NaN;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + stride <= rgba.length; i += step) {
    sum += relativeLuminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    n++;
  }
  return n > 0 ? sum / n : Number.NaN;
}

/**
 * Map a measured region luminance to a signed tint adjustment, against a
 * reference — the luminance of the page behind everything else, measured from
 * the same sample source in the same pass.
 *
 * A region `AMBIENT_FULL_ADJUST_SPAN` darker than the reference saturates the
 * deepening; the same distance brighter saturates the lift; nothing moves at
 * all when the region simply looks like the page. Using the live reference
 * (instead of a per-theme constant) is what makes one mapping correct in both
 * themes and across custom accent/surface tokens.
 */
export function tintAdjustFromLuma(
  luma: number,
  reference: number,
  max: number = AMBIENT_MAX_ADJUST,
): number {
  if (!Number.isFinite(luma) || !Number.isFinite(reference)) return 0;
  const bound = Math.abs(max);
  const raw = ((luma - reference) / AMBIENT_FULL_ADJUST_SPAN) * bound;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(bound, Math.max(-bound, raw));
}

/**
 * The CSS delivery of a signed adjustment: two percentages, exactly one of
 * which is non-zero, so the tint composition can mix toward black or white
 * without sign arithmetic in CSS. Consumed by `--lg-face` in style.css.
 */
export function ambientCssAdjust(adjust: number): { deepen: string; lift: string } {
  const clamped = Number.isFinite(adjust) ? Math.min(1, Math.max(-1, adjust)) : 0;
  const pct = (v: number): string => (v === 0 ? '0%' : `${(v * 100).toFixed(2)}%`);
  return clamped < 0
    ? { deepen: pct(Math.abs(clamped)), lift: pct(0) }
    : { deepen: pct(0), lift: pct(clamped) };
}

export interface FrameBudgetOptions {
  /** Rolling-mean frame cost that triggers demotion. */
  budgetMs?: number;
  /** Length of the rolling window. */
  windowMs?: number;
  /** Samples required before the first verdict (skips the warm-up frames). */
  minSamples?: number;
  /** Activity span required before the first verdict (see the class note). */
  minSpanMs?: number;
  /**
   * How many individual samples inside the window must themselves exceed
   * `budgetMs` before a verdict is allowed. Guards short windows against a
   * single outlier dragging the mean over the line; 0/1 (the default) keeps the
   * plain mean semantics.
   */
  minOverBudgetSamples?: number;
  /** Gap that resets the window (the loop went idle: nothing to judge). */
  idleGapMs?: number;
}

/**
 * Rolling-window watchdog for the glass render loop. Feed it the cost of every
 * capture and every draw pass; it latches `true` once the mean pass cost over
 * the window exceeds the budget.
 *
 * The verdict needs both a sample count and a window span, because the loop is
 * demand-driven, not a free-running rAF: captures are debounced (~150ms) and a
 * static frame paints nothing, so a 2s window holds a couple of dozen samples
 * at most. Requiring `minSamples` inside `minSpanMs` of activity means an
 * isolated slow capture cannot demote the app, while a loop that costs over
 * budget on every pass it makes trips within about a second.
 * One-way by design (the Mica lesson: the opaque regime is a resting state, so
 * there is nothing to recover to and no flap-prevention machinery is needed).
 */
export class FrameBudget {
  private readonly budgetMs: number;
  private readonly windowMs: number;
  private readonly minSamples: number;
  private readonly minSpanMs: number;
  private readonly minOverBudgetSamples: number;
  private readonly idleGapMs: number;
  private samples: { t: number; cost: number }[] = [];
  private lastT = Number.NaN;
  private latched = false;
  // Kept past the latch (the sample window is dropped when it trips) so a debug
  // read can still show what the loop was costing.
  private lastAverageMs = 0;

  constructor(options: FrameBudgetOptions = {}) {
    this.budgetMs = options.budgetMs ?? DEFAULT_FRAME_BUDGET_MS;
    this.windowMs = options.windowMs ?? DEFAULT_BUDGET_WINDOW_MS;
    this.minSamples = options.minSamples ?? DEFAULT_BUDGET_MIN_SAMPLES;
    this.minSpanMs = options.minSpanMs ?? DEFAULT_BUDGET_MIN_SPAN_MS;
    this.minOverBudgetSamples = options.minOverBudgetSamples ?? 0;
    this.idleGapMs = options.idleGapMs ?? DEFAULT_BUDGET_IDLE_GAP_MS;
  }

  /** Record one cost sample; returns true on the sample that trips the latch. */
  sample(costMs: number, nowMs: number): boolean {
    if (this.latched) return false;
    if (!Number.isFinite(costMs) || costMs < 0 || !Number.isFinite(nowMs)) return false;
    if (Number.isFinite(this.lastT) && nowMs - this.lastT > this.idleGapMs) {
      this.samples = [];
    }
    this.lastT = nowMs;
    this.samples.push({ t: nowMs, cost: costMs });
    const cutoff = nowMs - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.t < cutoff) this.samples.shift();
    if (this.samples.length < this.minSamples) return false;
    if (nowMs - this.samples[0]!.t < this.minSpanMs) return false;
    let sum = 0;
    let over = 0;
    for (const s of this.samples) {
      sum += s.cost;
      if (s.cost > this.budgetMs) over++;
    }
    if (over < this.minOverBudgetSamples) return false;
    const average = sum / this.samples.length;
    this.lastAverageMs = average;
    if (average <= this.budgetMs) return false;
    this.latched = true;
    this.samples = [];
    return true;
  }

  get demoted(): boolean {
    return this.latched;
  }

  /**
   * Rolling mean cost of the retained window (0 before any sample). Once the
   * watchdog has latched this reports the average that tripped it, since the
   * window itself is dropped.
   */
  get averageMs(): number {
    if (this.samples.length === 0) return this.lastAverageMs;
    let sum = 0;
    for (const s of this.samples) sum += s.cost;
    return sum / this.samples.length;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Clear the window, the latch and the recorded average. */
  reset(): void {
    this.samples = [];
    this.lastT = Number.NaN;
    this.lastAverageMs = 0;
    this.latched = false;
  }
}

/**
 * FrameBudget preset for the DOM ambient probe (the non-WebGL path).
 *
 * Different scale from the GL loop, so different numbers — measured in headless
 * Chromium on the real app shell (one page sample + three surfaces, dpr 1):
 * mean 1.8ms, p95 2.6ms; with a 400-row deep element stack over the sampled
 * region, mean 2.3ms, p95 4.9ms, worst single pass 10.2ms. So a normal pass is
 * a couple of milliseconds and ten is the pathological end of ONE pass.
 *
 * budgetMs 8 is therefore ~4x the typical pass: high enough that ordinary
 * deep-DOM spikes never trip it, low enough that a page where every pass costs
 * more than a tenth of a frame does. minSamples 8 over a 6s window with a 3s
 * span requirement means roughly three consecutive seconds of sustained
 * over-budget passes at the probe's 600ms minimum cadence; idleGapMs 3000 drops
 * the window when the probe goes quiet, so a burst of slow passes before an
 * idle period cannot accumulate into a demotion.
 */
export const PROBE_BUDGET_OPTIONS: FrameBudgetOptions = {
  budgetMs: 8,
  windowMs: 6000,
  minSamples: 8,
  minSpanMs: 3000,
  idleGapMs: 3000,
  // The window only holds ~10 passes, so one outlier could otherwise drag the
  // mean past the line on its own: require most of the retained passes to be
  // individually over budget before a verdict. The GL budget leaves this unset,
  // so its behavior is unchanged.
  minOverBudgetSamples: 5,
};

/**
 * The probe's watchdog: one FrameBudget configured for probe-scale costs, plus
 * the pass count for the live-audit hook. Same one-way semantics as the GL
 * budget — once it trips, the ambient read stops for the session.
 */
export class ProbeWatchdog {
  private readonly budget = new FrameBudget(PROBE_BUDGET_OPTIONS);
  private passes = 0;

  /** Record one probe-pass cost; true only on the pass that trips the latch. */
  sample(costMs: number, nowMs: number): boolean {
    this.passes += 1;
    return this.budget.sample(costMs, nowMs);
  }

  get demoted(): boolean {
    return this.budget.demoted;
  }

  get averageMs(): number {
    return this.budget.averageMs;
  }

  get passCount(): number {
    return this.passes;
  }
}

/** Sustained mean cost per glass loop pass that trips the demotion. */
export const DEFAULT_FRAME_BUDGET_MS = 20;
export const DEFAULT_BUDGET_WINDOW_MS = 2000;
/** Captures are debounced ~150ms, so a 2s window holds a couple dozen samples
 *  at most; 8 is enough to see a trend without demanding a free-running loop. */
export const DEFAULT_BUDGET_MIN_SAMPLES = 8;
export const DEFAULT_BUDGET_MIN_SPAN_MS = 900;
export const DEFAULT_BUDGET_IDLE_GAP_MS = 1200;

// ---------------------------------------------------------------------------
// DOM side: delivering an adjustment to a surface.
//
// Two channels, one per regime, so an ambient read is never applied twice to
// the same panel:
// - a WebGL-painted pane gets the adjustment as a shader uniform (the refracted
//   backdrop deepens/lifts) and its CSS variables are cleared;
// - every other glass surface (the SVG-lens path on Chromium, a pane the
//   renderer capped out, a demoted surface) gets it as `--lg-amb-deepen` /
//   `--lg-amb-lift`, which style.css mixes into the face tint.
// ---------------------------------------------------------------------------

const DEEPEN_VAR = '--lg-amb-deepen';
const LIFT_VAR = '--lg-amb-lift';

/** Write (or clear, for adjust 0) the per-surface ambient CSS variables. */
export function setSurfaceAmbient(el: HTMLElement, adjust: number): void {
  const { deepen, lift } = ambientCssAdjust(adjust);
  if (deepen === '0%' && lift === '0%') {
    el.style.removeProperty(DEEPEN_VAR);
    el.style.removeProperty(LIFT_VAR);
    return;
  }
  el.style.setProperty(DEEPEN_VAR, deepen);
  el.style.setProperty(LIFT_VAR, lift);
}

/** Drop any ambient the renderer owned (unregister / engine teardown). */
export function clearSurfaceAmbient(el: HTMLElement): void {
  el.style.removeProperty(DEEPEN_VAR);
  el.style.removeProperty(LIFT_VAR);
}

/** Sample points per axis inside a surface rect (or across the viewport),
 *  biased to the middle where a translucent panel actually reads its backdrop. */
const PROBE_FRACTIONS = [0.28, 0.5, 0.72];

function isGlassLayer(node: Element): boolean {
  return (
    node.classList.contains('lg-glass') ||
    node.classList.contains('lg-frost') ||
    node.classList.contains('lg-band') ||
    node.classList.contains('lg-gl-pane') ||
    node.classList.contains('glass-defs')
  );
}

function opaqueLumaAt(node: Element): number | null {
  const raw = getComputedStyle(node).backgroundColor;
  if (!raw || raw === 'transparent') return null;
  const nums = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const alpha = nums.length >= 4 ? Number(nums[3]) : 1;
  if (!Number.isFinite(alpha) || alpha < 0.9) return null;
  return relativeLuminance(Number(nums[0]), Number(nums[1]), Number(nums[2]));
}

/**
 * Mean luminance of a rect, read off the live DOM: nine points, each walking
 * down the hit-test stack to the first opaque background that is not a glass
 * surface. `exclude` skips the panel whose backdrop is being measured (pass
 * null to measure the page between the panels). Rasterization-free, which is
 * why the engines that never build a page snapshot can still afford this.
 */
function probeRectLuminance(rect: DOMRect | ClientRect, exclude: Element | null): number | null {
  if (rect.width < 8 || rect.height < 8) return null;
  let sum = 0;
  let n = 0;
  for (const fy of PROBE_FRACTIONS) {
    for (const fx of PROBE_FRACTIONS) {
      const x = rect.left + rect.width * fx;
      const y = rect.top + rect.height * fy;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      for (const node of document.elementsFromPoint(x, y)) {
        if (node === exclude || (exclude !== null && exclude.contains(node))) continue;
        if (isGlassLayer(node)) continue;
        const luma = opaqueLumaAt(node);
        if (luma !== null) {
          sum += luma;
          n++;
          break;
        }
      }
    }
  }
  return n >= 3 ? sum / n : null;
}

/**
 * Cheap ambient read for engines that never build a page snapshot (Chromium,
 * where CSS renders the refraction): the mean luminance of the content behind a
 * glass panel. Returns null when nothing readable was found — the caller keeps
 * the surface at its designed tint.
 */
export function probeSurfaceLuminance(el: HTMLElement): number | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return null;
  }
  return probeRectLuminance(el.getBoundingClientRect(), el);
}

/**
 * The tint reference for a DOM-probe pass: the page's own mean luminance
 * outside the glass surfaces. Viewport-wide, sampled once per pass.
 */
export function probePageLuminance(): number | null {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return null;
  }
  const box = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  } as DOMRect;
  return probeRectLuminance(box, null);
}

