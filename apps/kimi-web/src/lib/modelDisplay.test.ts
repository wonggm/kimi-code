import { describe, expect, it } from 'vitest';
import { modelDisplay } from './modelDisplay';

describe('modelDisplay', () => {
  it('drops the provider prefix', () => {
    expect(modelDisplay('opencode-go/deepseek-v4-flash')).toBe('deepseek-v4-flash');
  });

  it('keeps an alias with no provider prefix whole', () => {
    expect(modelDisplay('kimi-k2')).toBe('kimi-k2');
  });

  it('keeps the alias when it ends in a separator', () => {
    expect(modelDisplay('openrouter/')).toBe('openrouter/');
  });

  it('has no label for an absent or empty alias', () => {
    expect(modelDisplay(undefined)).toBeUndefined();
    expect(modelDisplay('')).toBeUndefined();
  });
});
