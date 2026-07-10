import { describe, it, expect, beforeEach } from 'vitest';
import { loadProfile, saveProfile, DEFAULT_PROFILE } from './settings';

// jsdom is not enabled in node env; provide a minimal localStorage shim.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('settings', () => {
  it('returns null when nothing saved', () => {
    expect(loadProfile()).toBeNull();
  });
  it('round-trips a profile', () => {
    const p = { ...DEFAULT_PROFILE, baseUrl: 'https://api.z.ai/v1', apiKey: 'k', model: 'glm-4.6' };
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });
});
