import { describe, expect, it } from 'vitest';

import { createLiveTpsWindow } from '#/tui/utils/live-tps';

describe('createLiveTpsWindow', () => {
  it('publishes nothing until the evidence gates pass', () => {
    const window = createLiveTpsWindow();
    expect(window.push(1000, 8)).toBeUndefined();
    expect(window.push(1050, 8)).toBeUndefined();
    expect(window.push(1100, 8)).toBeUndefined();
  });

  it('tracks a steady stream near its true rate', () => {
    const window = createLiveTpsWindow();
    // 8 characters per 50ms push is 40 tok/s with the chars/4 estimate.
    let rate: number | undefined;
    for (let i = 0; i < 60; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) rate = value;
    }
    expect(rate).toBeGreaterThan(30);
    expect(rate).toBeLessThan(50);
  });

  it('does not round each one-character delta up to a token', () => {
    // 1 character per 50ms is 20 characters/s, or 5 tok/s with the chars/4 estimate.
    const window = createLiveTpsWindow();
    let rate: number | undefined;
    for (let i = 0; i < 60; i++) {
      const value = window.push(1000 + i * 50, 1);
      if (value !== undefined) rate = value;
    }
    expect(rate).toBeGreaterThan(4);
    expect(rate).toBeLessThan(6);
  });

  it('publishes at most once per patch interval', () => {
    const window = createLiveTpsWindow();
    let published: number | undefined;
    for (let i = 0; i < 40; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) {
        published = value;
        expect(window.push(1000 + i * 50 + 20, 8)).toBeUndefined();
        break;
      }
    }
    expect(published).toBeGreaterThan(0);
  });

  it('holds the reading through a long pause instead of diluting it', () => {
    const window = createLiveTpsWindow();
    let before: number | undefined;
    for (let i = 0; i < 40; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) before = value;
    }
    expect(before).toBeDefined();
    const after = window.push(1000 + 40 * 50 + 30_000, 8);
    expect(after).toBeDefined();
    expect(after!).toBeGreaterThan(before! * 0.4);
  });

  it('starts over after a reset', () => {
    const window = createLiveTpsWindow();
    for (let i = 0; i < 30; i++) window.push(1000 + i * 50, 8);
    window.reset();
    expect(window.push(60_000, 8)).toBeUndefined();
    expect(window.push(60_050, 8)).toBeUndefined();
  });
});
