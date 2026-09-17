import { describe, expect, it } from 'vitest';
import { BROWSER_REFERENCE_DEST_PREFIX, browserReferenceIdFromDest } from './browserReference';

describe('browserReferenceIdFromDest', () => {
  it('strips the destination prefix', () => {
    expect(browserReferenceIdFromDest(`${BROWSER_REFERENCE_DEST_PREFIX}br_mock_1`)).toBe('br_mock_1');
  });

  it('returns empty for a destination of another kind', () => {
    expect(browserReferenceIdFromDest('/tmp/notes.md')).toBe('');
    expect(browserReferenceIdFromDest('kimi-code-composer://browser-references')).toBe('');
    expect(browserReferenceIdFromDest('')).toBe('');
  });
});
