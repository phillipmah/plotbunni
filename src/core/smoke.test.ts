import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });
  it('has a global indexedDB from fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
  });
});
