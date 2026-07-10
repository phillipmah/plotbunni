import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';

const NAME = 'TestDB_store';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('AppStore bootstrap', () => {
  it('creates exactly one default book and lists it stably', async () => {
    const s = await AppStore.open(NAME);
    const b1 = await s.ensureBook();
    const b2 = await s.ensureBook();
    expect(b1.id).toBe(b2.id); // idempotent
    expect(await s.chapters(b1.id)).toEqual([]);
    s.db.close();
  });
});
