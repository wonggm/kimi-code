import { describe, expect, it } from 'vitest';
import { splitTrailingCjk } from '../src/lib/linkifyCjkBoundary';

describe('splitTrailingCjk', () => {
  it('splits CJK swallowed after a bare URL path', () => {
    expect(splitTrailingCjk('https://example.com/path接着写')).toEqual({
      url: 'https://example.com/path',
      tail: '接着写',
    });
  });

  it('splits CJK swallowed into a hostname', () => {
    expect(splitTrailingCjk('http://example.com中文')).toEqual({
      url: 'http://example.com',
      tail: '中文',
    });
  });

  it('splits fullwidth punctuation too', () => {
    expect(splitTrailingCjk('https://example.com/path！')).toEqual({
      url: 'https://example.com/path',
      tail: '！',
    });
  });

  it('ignores plain URLs with no trailing CJK', () => {
    expect(splitTrailingCjk('https://example.com')).toBeNull();
    expect(splitTrailingCjk('https://example.com/path')).toBeNull();
  });

  it('ignores non-URL text', () => {
    expect(splitTrailingCjk('中文文本')).toBeNull();
    expect(splitTrailingCjk('example.com中文')).toBeNull();
  });

  it('keeps URL text that ends with ASCII', () => {
    expect(splitTrailingCjk('https://example.com/abc123')).toBeNull();
  });

  it('keeps explicit-link labels (no scheme)', () => {
    expect(splitTrailingCjk('中文链接')).toBeNull();
  });
});