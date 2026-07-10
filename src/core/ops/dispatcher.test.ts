import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities, getEntity } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { readLog } from './log';
import { StaleWriteError } from './apply';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp, UpdateOp } from './types';

const NAME = 'TestDB_dispatch';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, turnId: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId, entity: e });

describe('dispatch', () => {
  it('applies a multi-op turn and logs it under one turnId', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const b = createBibleEntry({ type: 'character', name: 'B' });
    const t = newTurnId();
    const recs = await dispatch(db, [create(a, t), create(b, t)], { actor: 'user', turnId: t });
    expect(recs.length).toBe(2);
    expect(new Set(recs.map(r => r.turnId)).size).toBe(1);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);
    db.close();
  });

  it('rolls back the whole turn if a later op is stale, leaving no trace', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const t = newTurnId();
    const goodCreate = create(a, t);
    const staleUpdate: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: 'missing', expectedVersion: 5, actor: 'user', turnId: t, patch: { name: 'X' } };
    await expect(dispatch(db, [goodCreate, staleUpdate], { actor: 'user', turnId: t }))
      .rejects.toBeInstanceOf(StaleWriteError);
    // rollback: entity A must NOT persist, and the log must be empty
    expect(await getEntity(db, 'bibleEntries', a.id)).toBeUndefined();
    expect((await readLog(db)).length).toBe(0);
    db.close();
  });
});
