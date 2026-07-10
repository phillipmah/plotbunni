import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../core/db/open';
import { putEntity } from '../core/db/stores';
import { createBibleEntry } from '../core/model/entities';
import { SCHEMA_VERSION } from '../core/db/schema';
import { exportNovel } from './export';

const NAME = 'TestDB_export';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('exportNovel', () => {
  it('serializes all stores with the schema version', async () => {
    const db = await openPlotBunniDB(NAME);
    await putEntity(db, 'bibleEntries', createBibleEntry({ type: 'character', name: 'Bob' }));
    const out = await exportNovel(db, 123);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.exportedAt).toBe(123);
    expect((out.stores.bibleEntries as any[]).length).toBe(1);
    expect(Object.keys(out.stores)).toContain('scenes');
    db.close();
  });
});
