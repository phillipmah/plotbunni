import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getEntity, getAllEntities } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { undo, redo } from './undo';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp } from './types';

const NAME = 'TestDB_undo';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, t: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: t, entity: e });

describe('undo/redo', () => {
  it('undoes a whole turn atomically and redoes it', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const b = createBibleEntry({ type: 'character', name: 'B' });
    const t = newTurnId();
    await dispatch(db, [create(a, t), create(b, t)], { actor: 'user', turnId: t });
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);

    expect(await undo(db)).toBe(true);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(0);

    expect(await redo(db)).toBe(true);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', a.id))!.name).toBe('A');
    db.close();
  });

  it('returns false when there is nothing to undo', async () => {
    const db = await openPlotBunniDB(NAME);
    expect(await undo(db)).toBe(false);
    db.close();
  });
});
