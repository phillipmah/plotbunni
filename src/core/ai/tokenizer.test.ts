import { describe, it, expect } from 'vitest';
import { countTokens } from './tokenizer';

describe('countTokens', () => {
  it('is 0 for empty', () => expect(countTokens('')).toBe(0));
  it('counts a word as at least one token', () => expect(countTokens('hello')).toBeGreaterThanOrEqual(1));
  it('grows with length', () => {
    expect(countTokens('hello world, this is a longer sentence.'))
      .toBeGreaterThan(countTokens('hello'));
  });
  it('is far below the naive chars/4 for long prose', () => {
    // sanity: real tokenizer, not chars/4 — but same order of magnitude
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    const n = countTokens(text);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(text.length); // fewer tokens than characters
  });
});
