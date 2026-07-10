import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getEntity, putEntity } from '../db/stores';
import { applyOp, StaleWriteError } from './apply';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp, UpdateOp, DeleteOp } from './types';

const NAME = 'TestDB_apply';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('applyOp', () => {
  it('creates, returns a delete inverse, entity at version 1', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    const op: CreateOp = { type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: 't', entity: e };
    const inv = await applyOp(db, op);
    expect(inv.type).toBe('delete');
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!.version).toBe(1);
    db.close();
  });

  it('updates with version bump and an inverse that restores prior values', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob', summary: 'old' });
    await putEntity(db, 'bibleEntries', e);
    const op: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: e.id, expectedVersion: 1, actor: 'user', turnId: 't', patch: { summary: 'new' } };
    const inv = await applyOp(db, op) as UpdateOp;
    const after = (await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!;
    expect(after.summary).toBe('new');
    expect(after.version).toBe(2);
    expect(inv.type).toBe('update');
    expect(inv.patch).toEqual({ summary: 'old' });
    expect(inv.expectedVersion).toBe(2);
    db.close();
  });

  it('rejects a stale expectedVersion', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' }); // version 1
    await putEntity(db, 'bibleEntries', e);
    const op: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: e.id, expectedVersion: 99, actor: 'user', turnId: 't', patch: { name: 'X' } };
    await expect(applyOp(db, op)).rejects.toBeInstanceOf(StaleWriteError);
    db.close();
  });

  it('deletes via tombstone with a create inverse', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'item', name: 'Key' });
    await putEntity(db, 'bibleEntries', e);
    const op: DeleteOp = { type: 'delete', store: 'bibleEntries', entityId: e.id, expectedVersion: 1, actor: 'user', turnId: 't' };
    const inv = await applyOp(db, op) as CreateOp;
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!.deleted).toBe(true);
    expect(inv.type).toBe('create');
    db.close();
  });
});
