import { describe, it, expect } from 'vitest';
import { acquireWriter } from './lock';

// Minimal fake LockManager: grants exclusive, ifAvailable-aware.
function fakeLocks(): LockManager {
  const held = new Set<string>();
  return {
    async request(name: string, options: any, cb: any) {
      const ifAvailable = options?.ifAvailable;
      if (held.has(name)) return ifAvailable ? cb(null) : new Promise(() => {});
      held.add(name);
      try { return await cb({ name } as Lock); } finally { /* held until release */ }
    },
    async query() { return { held: [], pending: [] }; },
  } as unknown as LockManager;
}

describe('acquireWriter', () => {
  it('grants the first writer and refuses the second', async () => {
    const locks = fakeLocks();
    const first = await acquireWriter('novel-1', { locks });
    expect(first).not.toBeNull();
    const second = await acquireWriter('novel-1', { locks });
    expect(second).toBeNull();
  });
});
