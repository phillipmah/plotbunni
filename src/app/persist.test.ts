import { describe, it, expect } from 'vitest';
import { requestPersistence } from './persist';

describe('requestPersistence', () => {
  it('returns the result of navigator.storage.persist()', async () => {
    expect(await requestPersistence({ storage: { persist: async () => true } })).toBe(true);
  });
  it('returns false when unavailable', async () => {
    expect(await requestPersistence({})).toBe(false);
  });
});
