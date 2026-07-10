import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from './open';
import { getEntity, putEntity, getAllEntities } from './stores';
import { createBibleEntry } from '../model/entities';

const NAME = 'TestDB_stores';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('store primitives', () => {
  it('round-trips an entity', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    await putEntity(db, 'bibleEntries', e);
    expect(await getEntity(db, 'bibleEntries', e.id)).toEqual(e);
    db.close();
  });

  it('getAll excludes tombstoned entities by default', async () => {
    const db = await openPlotBunniDB(NAME);
    const live = createBibleEntry({ type: 'item', name: 'Sword' });
    const dead = createBibleEntry({ type: 'item', name: 'Ghost', deleted: true });
    await putEntity(db, 'bibleEntries', live);
    await putEntity(db, 'bibleEntries', dead);
    expect((await getAllEntities(db, 'bibleEntries')).map(e => e.id)).toEqual([live.id]);
    expect((await getAllEntities(db, 'bibleEntries', { includeDeleted: true })).length).toBe(2);
    db.close();
  });
});
