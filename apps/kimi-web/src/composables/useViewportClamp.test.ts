// apps/kimi-web/src/composables/useViewportClamp.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clampMenuPlacement } from './useViewportClamp';

// The helper reads window.innerWidth / innerHeight, which do not exist in the
// node test environment — stub a fixed viewport for the duration of this suite.
const VIEWPORT = { innerWidth: 1000, innerHeight: 800 } as typeof window;
const OLD_WINDOW = globalThis.window;

beforeAll(() => {
  globalThis.window = VIEWPORT;
});
afterAll(() => {
  globalThis.window = OLD_WINDOW;
});

// DOMRect does not exist in the node environment — a minimal stand-in with the
// read-only geometry members the helper touches.
class FakeDomRect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}
  get left(): number {
    return this.x;
  }
  get top(): number {
    return this.y;
  }
  get right(): number {
    return this.x + this.width;
  }
  get bottom(): number {
    return this.y + this.height;
  }
}

const rect = (top: number, left: number, width = 100, height = 40): DOMRect =>
  new FakeDomRect(left, top, width, height) as unknown as DOMRect;

describe('clampMenuPlacement', () => {
  it('places above the anchor when there is room, aligned left', () => {
    const anchor = rect(600, 200); // bottom of the viewport — room above
    const result = clampMenuPlacement(anchor, 200, 120, 'above');
    expect(result.placement).toBe('above');
    expect(result.top).toBe(600 - 4 - 120);
    expect(result.left).toBe(200);
  });

  it('flips below when the preferred side lacks room', () => {
    const anchor = rect(20, 200); // top of the viewport — none above
    const result = clampMenuPlacement(anchor, 200, 120, 'above');
    expect(result.placement).toBe('below');
    expect(result.top).toBe(20 + 40 + 4);
    expect(result.left).toBe(200);
  });

  it('honours a preferred below placement when the space exists', () => {
    const anchor = rect(100, 300);
    const result = clampMenuPlacement(anchor, 200, 120, 'below');
    expect(result.placement).toBe('below');
    expect(result.top).toBe(100 + 40 + 4);
  });

  it('clamps the left edge into the viewport', () => {
    const anchor = rect(600, -50);
    const result = clampMenuPlacement(anchor, 200, 120, 'above');
    expect(result.left).toBe(8);
  });

  it('clamps the right edge into the viewport', () => {
    const anchor = rect(600, 950);
    const result = clampMenuPlacement(anchor, 200, 120, 'above');
    expect(result.left).toBe(1000 - 8 - 200);
  });

  it('keeps the menu inside the viewport when it is taller than the space', () => {
    // Neither side fits (menu 700px tall in an 800px viewport): picks the side
    // with more room and clamps the top inside the viewport.
    const anchor = rect(200, 300);
    const result = clampMenuPlacement(anchor, 200, 700, 'above');
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + 700).toBeLessThanOrEqual(800 - 8);
  });

  it('respects custom gap and margin', () => {
    const anchor = rect(600, 200);
    const result = clampMenuPlacement(anchor, 200, 120, 'above', { gap: 12, margin: 16 });
    expect(result.top).toBe(600 - 12 - 120);
    expect(result.left).toBe(200);
  });
});
