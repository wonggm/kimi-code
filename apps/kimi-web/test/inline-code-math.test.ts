import { describe, expect, it } from 'vitest';
import { DOLLAR_SENTINEL, protectInlineCodeDollars } from '../src/lib/inlineCodeMath';

describe('protectInlineCodeDollars', () => {
  it('protects a lone dollar inside an inline code span', () => {
    expect(protectInlineCodeDollars('use `$5` here')).toBe(`use \`${DOLLAR_SENTINEL}5\` here`);
  });

  it('protects a dollar pair inside a code span', () => {
    expect(protectInlineCodeDollars('`$x$`')).toBe(`\`${DOLLAR_SENTINEL}x${DOLLAR_SENTINEL}\``);
  });

  it('works for multi-backtick spans', () => {
    expect(protectInlineCodeDollars('``a $b`` end')).toBe(`\`\`a ${DOLLAR_SENTINEL}b\`\` end`);
  });

  it('leaves dollars outside code spans untouched', () => {
    const src = 'price $x = 1$ and $5';
    expect(protectInlineCodeDollars(src)).toBe(src);
  });

  it('leaves fenced code blocks untouched', () => {
    const src = '```bash\necho $HOME\n```';
    expect(protectInlineCodeDollars(src)).toBe(src);
  });

  it('leaves unbalanced backticks untouched', () => {
    const src = 'see `$5 and later $6';
    expect(protectInlineCodeDollars(src)).toBe(src);
  });

  it('handles a code span followed by a later math pair', () => {
    const src = 'use `$x$` math and $y=1$ end';
    const out = protectInlineCodeDollars(src);
    expect(out).toBe(`use \`${DOLLAR_SENTINEL}x${DOLLAR_SENTINEL}\` math and $y=1$ end`);
  });

  it('does not emit sentinels when there is nothing to protect', () => {
    expect(protectInlineCodeDollars('plain text')).toBe('plain text');
    expect(protectInlineCodeDollars('')).toBe('');
  });

  it('protects backtick runs of equal length only (does not cross longer runs)', () => {
    const src = '`a` ``b $c`` `d`';
    const out = protectInlineCodeDollars(src);
    expect(out).toContain(`\`\`b ${DOLLAR_SENTINEL}c\`\``);
    expect(out.indexOf('$c')).toBe(-1);
  });
});