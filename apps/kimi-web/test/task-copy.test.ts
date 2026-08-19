import { describe, expect, it } from 'vitest';
import { composeTaskCopyPayload } from '../src/lib/taskCopy';

describe('composeTaskCopyPayload', () => {
  it('keeps command and output verbatim', () => {
    const payload = composeTaskCopyPayload('$ ls -la', ['a.txt', 'b.txt']);
    expect(payload.command).toBe('$ ls -la');
    expect(payload.output).toBe('a.txt\nb.txt');
  });

  it('joins command and output with a blank line for "all"', () => {
    expect(composeTaskCopyPayload('$ ls', ['a.txt']).all).toBe('$ ls\n\na.txt');
  });

  it('drops the absent part from "all"', () => {
    expect(composeTaskCopyPayload(undefined, ['only output']).all).toBe('only output');
    expect(composeTaskCopyPayload('$ ls', undefined).all).toBe('$ ls');
  });

  it('yields empty strings when nothing is present', () => {
    expect(composeTaskCopyPayload(undefined, undefined)).toEqual({
      command: '',
      output: '',
      all: '',
    });
    expect(composeTaskCopyPayload('', []).all).toBe('');
  });
});