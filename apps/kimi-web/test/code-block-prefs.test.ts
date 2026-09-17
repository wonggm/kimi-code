import { beforeEach, describe, expect, it } from 'vitest';
import { loadCodeLineNumbers, loadCodeWrap } from '../src/lib/storage';
import { scrollEdges, scrollThumb } from '../src/lib/codeScrollDecor';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key: string) { return data.has(key) ? (data.get(key) as string) : null; },
    key() { return null; },
    removeItem(key: string) { data.delete(key); },
    setItem(key: string, value: string) { data.set(key, String(value)); },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

// The prefs module initializes its refs at import time from storage, so it is
// imported dynamically after the stub is installed.
describe('codeBlockPrefs', () => {
  it('toggles wrap and line numbers and persists the values', async () => {
    const { useCodeBlockPrefs } = await import('../src/lib/codeBlockPrefs');
    const { codeWrap, codeLineNumbers, toggleWrap, toggleLineNumbers } = useCodeBlockPrefs();
    const wrapBefore = codeWrap.value;
    const linesBefore = codeLineNumbers.value;

    toggleWrap();
    toggleLineNumbers();
    expect(codeWrap.value).toBe(!wrapBefore);
    expect(codeLineNumbers.value).toBe(!linesBefore);
    expect(loadCodeWrap()).toBe(codeWrap.value);
    expect(loadCodeLineNumbers()).toBe(codeLineNumbers.value);

    // Restore the previous persisted values so other tests / sessions are unaffected.
    toggleWrap();
    toggleLineNumbers();
    expect(codeWrap.value).toBe(wrapBefore);
    expect(codeLineNumbers.value).toBe(linesBefore);
  });
});

// The scroll decor's geometry: the floating thumb's length and position on its
// track, and which of a scroller's four edges still have room.
describe('codeScrollDecor', () => {
  it('reports no thumb when the content fits', async () => {
    expect(scrollThumb(0, 200, 200)).toBeNull();
    expect(scrollThumb(0, 199, 200)).toBeNull();
  });

  it('sizes the thumb by the visible fraction and keeps a minimum', async () => {
    // Half the content visible → half the track.
    expect(scrollThumb(0, 200, 100, 0, 24)).toEqual({ start: 0, size: 50 });
    // A sliver of a long document still gets the minimum.
    expect(scrollThumb(0, 10000, 100, 0, 24)).toEqual({ start: 0, size: 24 });
    // The minimum never exceeds the track.
    expect(scrollThumb(0, 10000, 20, 0, 24)).toEqual({ start: 0, size: 20 });
  });

  it('walks the thumb along the track and pins it at the ends', async () => {
    expect(scrollThumb(50, 200, 100, 0, 24)).toEqual({ start: 25, size: 50 });
    expect(scrollThumb(100, 200, 100, 0, 24)).toEqual({ start: 50, size: 50 });
    expect(scrollThumb(999, 200, 100, 0, 24)).toEqual({ start: 50, size: 50 });
    expect(scrollThumb(-5, 200, 100, 0, 24)).toEqual({ start: 0, size: 50 });
  });

  it('insets the thumb inside the track', async () => {
    expect(scrollThumb(0, 200, 100, 4, 24)).toEqual({ start: 4, size: 46 });
  });

  it('flags the edges that still have room to scroll', async () => {
    expect(scrollEdges({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(scrollEdges({ top: 12, bottom: 0, left: 3, right: 0 })).toEqual({
      top: 1,
      bottom: 0,
      left: 1,
      right: 0,
    });
    expect(scrollEdges({ top: 1, bottom: 1, left: 1, right: 1 })).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });
});
