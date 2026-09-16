// apps/kimi-web/src/lib/frontmatter.test.ts
import { describe, expect, it } from 'vitest';
import { extractFrontmatter, parseFrontmatterEntries } from './frontmatter';

describe('extractFrontmatter', () => {
  it('splits a leading block off the body', () => {
    expect(extractFrontmatter('---\nname: x\n---\nbody\n')).toEqual({
      frontmatter: 'name: x\n',
      body: 'body\n',
    });
  });

  it('leaves a message without a leading block untouched', () => {
    expect(extractFrontmatter('text\n---\nname: x\n---\n')).toEqual({
      frontmatter: null,
      body: 'text\n---\nname: x\n---\n',
    });
  });

  it('ignores an unclosed block', () => {
    expect(extractFrontmatter('---\nname: x\n')).toEqual({
      frontmatter: null,
      body: '---\nname: x\n',
    });
  });
});

describe('parseFrontmatterEntries — scalar values', () => {
  it('keeps every entry in order', () => {
    expect(parseFrontmatterEntries('name: write-tui\ndescription: Write the TUI\n')).toEqual([
      { key: 'name', value: 'write-tui', tags: null },
      { key: 'description', value: 'Write the TUI', tags: null },
    ]);
  });

  it('shows a value as written and unquotes a quoted one', () => {
    expect(parseFrontmatterEntries("version: 1.0\nquote: 'key: value'\n")).toEqual([
      { key: 'version', value: '1.0', tags: null },
      { key: 'quote', value: 'key: value', tags: null },
    ]);
  });

  it('renders an empty or null value as an em dash', () => {
    expect(parseFrontmatterEntries('empty:\nnulled: null\ntilde: ~\n')).toEqual([
      { key: 'empty', value: '—', tags: null },
      { key: 'nulled', value: '—', tags: null },
      { key: 'tilde', value: '—', tags: null },
    ]);
  });

  it('skips blank lines and whole-line comments', () => {
    expect(parseFrontmatterEntries('# a comment\n\nname: x\n')).toEqual([
      { key: 'name', value: 'x', tags: null },
    ]);
  });

  it('keeps the last value of a repeated key at its first position', () => {
    expect(parseFrontmatterEntries('a: 1\nb: 2\na: 3\n')).toEqual([
      { key: 'a', value: '3', tags: null },
      { key: 'b', value: '2', tags: null },
    ]);
  });
});

describe('parseFrontmatterEntries — array values', () => {
  it('turns an inline sequence into tags', () => {
    expect(parseFrontmatterEntries('tools: [Read, Write]\n')).toEqual([
      { key: 'tools', value: 'Read, Write', tags: ['Read', 'Write'] },
    ]);
  });

  it('turns a block sequence into tags', () => {
    expect(parseFrontmatterEntries('tools:\n  - Read\n  - Write\n')).toEqual([
      { key: 'tools', value: 'Read, Write', tags: ['Read', 'Write'] },
    ]);
  });

  it('does not split a quoted item on its comma', () => {
    expect(parseFrontmatterEntries("tools: ['a, b', c]\n")).toEqual([
      { key: 'tools', value: "a, b, c", tags: ['a, b', 'c'] },
    ]);
  });

  it('shows an empty sequence as written', () => {
    expect(parseFrontmatterEntries('tools: []\n')).toEqual([
      { key: 'tools', value: '[]', tags: null },
    ]);
  });
});

describe('parseFrontmatterEntries — blocks outside the subset', () => {
  it('rejects a block longer than 64 KiB', () => {
    const long = `name: ${'x'.repeat(65536)}\n`;
    expect(long.length).toBeGreaterThan(65536);
    expect(parseFrontmatterEntries(long)).toBeNull();
  });

  it('rejects a nested map', () => {
    expect(parseFrontmatterEntries('meta:\n  name: x\n')).toBeNull();
  });

  it('rejects a block scalar', () => {
    expect(parseFrontmatterEntries('description: |\n  two\n  lines\n')).toBeNull();
  });

  it('rejects an anchor, a flow map and a quoted key', () => {
    expect(parseFrontmatterEntries('base: &default\n')).toBeNull();
    expect(parseFrontmatterEntries('meta: {a: 1}\n')).toBeNull();
    expect(parseFrontmatterEntries('"a key": 1\n')).toBeNull();
  });

  it('rejects a plain scalar that is not a `key: value` line', () => {
    expect(parseFrontmatterEntries('key:value\n')).toBeNull();
  });

  it('rejects a sequence item that is itself a map', () => {
    expect(parseFrontmatterEntries('tools:\n  - name: Read\n')).toBeNull();
  });

  it('returns null for a block with no entry', () => {
    expect(parseFrontmatterEntries('# only a comment\n')).toBeNull();
    expect(parseFrontmatterEntries('')).toBeNull();
  });
});
