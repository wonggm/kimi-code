import { describe, expect, it } from 'vitest';
import {
  mentionKindForDest,
  mentionToText,
  tokenizeMentions,
} from '../src/lib/mentionTokens';

describe('tokenizeMentions — plain text', () => {
  it('returns a single text segment for text without mentions', () => {
    expect(tokenizeMentions('hello world')).toEqual([{ kind: 'text', value: 'hello world' }]);
  });

  it('keeps ordinary web links as text', () => {
    const text = 'see [docs](https://example.com/x)';
    expect(tokenizeMentions(text)).toEqual([{ kind: 'text', value: text }]);
  });

  it('keeps fragments, queries and protocol-relative destinations as text', () => {
    for (const dest of ['#anchor', '?q=1', '//cdn.example/x', 'ftp://host/f']) {
      expect(tokenizeMentions(`[x](${dest})`)).toEqual([{ kind: 'text', value: `[x](${dest})` }]);
    }
  });

  it('ignores a link with an empty label or destination', () => {
    expect(tokenizeMentions('[ ](src/a.ts)')).toEqual([
      { kind: 'file', name: ' ', path: 'src/a.ts' },
    ]);
    expect(tokenizeMentions('[a.ts]()')).toEqual([{ kind: 'text', value: '[a.ts]()' }]);
  });
});

describe('tokenizeMentions — file and folder mentions', () => {
  it('tokenizes a single file mention surrounded by text', () => {
    expect(tokenizeMentions('see [a.ts](src/a.ts) now')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'file', name: 'a.ts', path: 'src/a.ts' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('tokenizes multiple mentions with text between them', () => {
    expect(tokenizeMentions('[a](x/a.ts) and [b](y/b.ts)')).toEqual([
      { kind: 'file', name: 'a', path: 'x/a.ts' },
      { kind: 'text', value: ' and ' },
      { kind: 'file', name: 'b', path: 'y/b.ts' },
    ]);
  });

  it('tokenizes a mention at the very start of the text', () => {
    expect(tokenizeMentions('[a.ts](a.ts) then')).toEqual([
      { kind: 'file', name: 'a.ts', path: 'a.ts' },
      { kind: 'text', value: ' then' },
    ]);
  });

  it('tokenizes a mention at the very end of the text', () => {
    expect(tokenizeMentions('then [a.ts](b/c.ts)')).toEqual([
      { kind: 'text', value: 'then ' },
      { kind: 'file', name: 'a.ts', path: 'b/c.ts' },
    ]);
  });

  it('detects a folder from a trailing slash', () => {
    expect(tokenizeMentions('[src](src/)')).toEqual([
      { kind: 'folder', name: 'src', path: 'src/' },
    ]);
  });

  it('handles Windows backslash paths and drive letters', () => {
    expect(tokenizeMentions('[a](C:\\dir\\file.ts)')).toEqual([
      { kind: 'file', name: 'a', path: 'C:\\dir\\file.ts' },
    ]);
    expect(tokenizeMentions('[d](C:\\dir\\)')).toEqual([
      { kind: 'folder', name: 'd', path: 'C:\\dir\\' },
    ]);
    expect(tokenizeMentions('[rel](a\\b\\c.ts)')).toEqual([
      { kind: 'file', name: 'rel', path: 'a\\b\\c.ts' },
    ]);
  });

  it('detects a folder from a trailing percent-encoded backslash', () => {
    expect(mentionKindForDest('C:%5Cdir%5C')).toBe('folder');
  });

  it('decodes percent-escaped destinations and markdown-escaped labels', () => {
    expect(tokenizeMentions('[my file](my%20file.ts)')).toEqual([
      { kind: 'file', name: 'my file', path: 'my file.ts' },
    ]);
  });

  it('accepts an angle-wrapped destination', () => {
    expect(tokenizeMentions('[a b](<src/a b.ts>)')).toEqual([
      { kind: 'file', name: 'a b', path: 'src/a b.ts' },
    ]);
  });
});

describe('tokenizeMentions — skills', () => {
  it('tokenizes a skill mention with an empty path', () => {
    expect(tokenizeMentions('[deploy](kimi-code://skill/deploy)')).toEqual([
      { kind: 'skill', name: 'deploy', path: '' },
    ]);
  });

  it('keeps a bare kimi-code:// URL without a name as text', () => {
    expect(tokenizeMentions('[x](kimi-code://skill)')).toEqual([
      { kind: 'text', value: '[x](kimi-code://skill)' },
    ]);
  });
});

describe('mentionKindForDest', () => {
  it('rejects empty, schemes (non-Windows), fragments and query dests', () => {
    expect(mentionKindForDest('')).toBeNull();
    expect(mentionKindForDest('https://x/y')).toBeNull();
    expect(mentionKindForDest('ftp://x')).toBeNull();
    expect(mentionKindForDest('#frag')).toBeNull();
    expect(mentionKindForDest('?query')).toBeNull();
    expect(mentionKindForDest('//proto')).toBeNull();
  });

  it('keeps Windows drive letters and relative paths as file/folder', () => {
    expect(mentionKindForDest('C:\\a\\b.ts')).toBe('file');
    expect(mentionKindForDest('C:/a/b.ts')).toBe('file');
    expect(mentionKindForDest('a/b/c.ts')).toBe('file');
    expect(mentionKindForDest('a\\b\\')).toBe('folder');
  });
});

describe('mentionToText', () => {
  it('serializes a file mention and round-trips through the tokenizer', () => {
    const mention = { kind: 'file' as const, name: 'a.ts', path: 'src/a.ts' };
    const text = mentionToText(mention);
    expect(text).toBe('[a.ts](src/a.ts)');
    expect(tokenizeMentions(text)).toEqual([
      { kind: 'file', name: 'a.ts', path: 'src/a.ts' },
    ]);
  });

  it('ensures a trailing slash for folder mentions', () => {
    expect(mentionToText({ kind: 'folder', name: 'src', path: 'src' })).toBe('[src](src/)');
    expect(mentionToText({ kind: 'folder', name: 'src', path: 'src/' })).toBe('[src](src/)');
  });

  it('serializes a skill mention', () => {
    expect(mentionToText({ kind: 'skill', name: 'deploy', path: '' })).toBe(
      '[deploy](kimi-code://skill/deploy)',
    );
  });

  it('escapes labels so they survive a parse', () => {
    const text = mentionToText({ kind: 'file', name: 'a & b', path: 'src/a.ts' });
    expect(tokenizeMentions(text)).toEqual([{ kind: 'file', name: 'a & b', path: 'src/a.ts' }]);
  });

  it('percent-encodes destinations with spaces', () => {
    const text = mentionToText({ kind: 'file', name: 'x', path: 'my dir/x.ts' });
    expect(text).toBe('[x](my%20dir/x.ts)');
    expect(tokenizeMentions(text)).toEqual([{ kind: 'file', name: 'x', path: 'my dir/x.ts' }]);
  });

  it('supports Windows folder paths', () => {
    const text = mentionToText({ kind: 'folder', name: 'dir', path: 'C:\\dir' });
    expect(tokenizeMentions(text)).toEqual([{ kind: 'folder', name: 'dir', path: 'C:\\dir/' }]);
  });

  it('round-trips an attachment mention', () => {
    const text = mentionToText({ kind: 'attachment', name: 'Image 1', id: 'att_1' });
    expect(text).toBe('[Image 1](kimi-code-composer://attachments/att_1)');
    expect(tokenizeMentions(`use ${text} here`)).toEqual([
      { kind: 'text', value: 'use ' },
      { kind: 'attachment', name: 'Image 1', path: 'kimi-code-composer://attachments/att_1' },
      { kind: 'text', value: ' here' },
    ]);
  });
});