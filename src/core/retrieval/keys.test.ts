import { describe, it, expect } from 'vitest';
import { matchKeys } from './keys';

describe('matchKeys', () => {
  it('matches on a word boundary, case-insensitive by default', () => {
    expect(matchKeys('Bob ran home', ['Bob'])).toBe(true);
    expect(matchKeys('bob ran home', ['Bob'])).toBe(true);
  });
  it('does NOT match a substring inside another word (v1 bug)', () => {
    expect(matchKeys('the water arose', ['Rose'])).toBe(false);
  });
  it('matches multi-word keys', () => {
    expect(matchKeys('down at the docks tonight', ['the docks'])).toBe(true);
  });
  it('honors case sensitivity when asked', () => {
    expect(matchKeys('bob', ['Bob'], { caseSensitive: true })).toBe(false);
  });
  it('is false for empty text or no keys', () => {
    expect(matchKeys('', ['Bob'])).toBe(false);
    expect(matchKeys('Bob', [])).toBe(false);
  });
});
