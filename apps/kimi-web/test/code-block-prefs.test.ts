import { beforeEach, describe, expect, it } from 'vitest';
import { loadCodeLineNumbers, loadCodeWrap } from '../src/lib/storage';

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
