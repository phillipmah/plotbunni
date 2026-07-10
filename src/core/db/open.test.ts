import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from './open';
import { STORE_NAMES, OPLOG_STORE, META_STORE, SNAPSHOT_STORE, SCHEMA_VERSION } from './schema';

const NAME = 'TestDB_open';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('openPlotBunniDB', () => {
  it('creates every entity store plus meta/oplog/snapshots', async () => {
    const db = await openPlotBunniDB(NAME);
    for (const s of STORE_NAMES) expect(db.objectStoreNames.contains(s)).toBe(true);
    expect(db.objectStoreNames.contains(OPLOG_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(META_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(SNAPSHOT_STORE)).toBe(true);
    expect(db.version).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('is idempotent across reopen', async () => {
    (await openPlotBunniDB(NAME)).close();
    const db = await openPlotBunniDB(NAME);
    expect(db.objectStoreNames.contains('scenes')).toBe(true);
    db.close();
  });
});
