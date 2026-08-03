// apps/kimi-web/src/bench/sampler.ts
// In-page frame-time + longtask sampler. Runs a requestAnimationFrame loop that
// records inter-frame intervals and a PerformanceObserver('longtask') that
// counts main-thread stalls. Dev-only — imported solely from BenchView, which
// is behind the `import.meta.env.DEV` guard in main.ts.
//
// Contract with the CDP driver (bench/run.mjs):
//   window.__benchReady  — set when the scene is laid out and sampling starts
//   window.__benchPhase  — optional phase marker for driver-assisted scenarios
//   window.__benchStop   — set BY THE DRIVER to end a driver-assisted scenario
//   window.__benchDone   — set when the scenario finished and __bench is final
//   window.__bench       — the final BenchMetrics
//   window.__benchError  — set when a scenario threw (driver reports failure)

import { computeMetrics, type BenchMetrics } from './metrics';

declare global {
  interface Window {
    __bench?: BenchMetrics;
    __benchDone?: boolean;
    __benchReady?: boolean;
    __benchPhase?: string;
    __benchStop?: boolean;
    __benchError?: string;
  }
}

export class Sampler {
  private frameTimes: number[] = [];
  private longtaskCount = 0;
  private longtaskMs = 0;
  private rafId = 0;
  private lastTs = -1;
  private observer: PerformanceObserver | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frameTimes = [];
    this.longtaskCount = 0;
    this.longtaskMs = 0;
    this.lastTs = -1;
    window.__benchDone = false;
    window.__benchStop = false;
    window.__benchError = undefined;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longtaskCount += 1;
          this.longtaskMs += entry.duration;
        }
      });
      this.observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // `longtask` unsupported (or `buffered` rejected) — counts stay 0.
      this.observer = null;
    }
    const loop = (ts: number): void => {
      if (!this.running) return;
      if (this.lastTs >= 0) {
        const dt = ts - this.lastTs;
        // Drop absurd gaps (tab suspend, debugger pauses) — not real frames.
        if (dt > 0 && dt < 1000) this.frameTimes.push(dt);
      }
      this.lastTs = ts;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Stop sampling and publish the final metrics to `window.__bench`. */
  stop(): BenchMetrics {
    if (this.running) {
      this.running = false;
      cancelAnimationFrame(this.rafId);
      this.observer?.disconnect();
      this.observer = null;
    }
    const m = this.metrics();
    window.__bench = m;
    return m;
  }

  metrics(): BenchMetrics {
    return computeMetrics(this.frameTimes, this.longtaskCount, this.longtaskMs);
  }
}

export function signalReady(): void {
  window.__benchReady = true;
}

export function signalDone(): void {
  window.__benchDone = true;
}

export function setPhase(phase: string): void {
  window.__benchPhase = phase;
}

/** Resolve once the driver sets `window.__benchStop` (driver-assisted scenes). */
export function waitForStop(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (window.__benchStop) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}
