import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { readLog } from './log';
import { snapshot, latestSnapshot } from './snapshot';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp } from './types';

const NAME = 'TestDB_snapshot';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, t: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: t, entity: e });

describe('snapshot + compaction', () => {
  it('captures current state and truncates the log', async () => {
    const db = await openPlotBunniDB(NAME);
    const t = newTurnId();
    await dispatch(db, [create(createBibleEntry({ type: 'character', name: 'A' }), t)], { actor: 'user', turnId: t });
    expect((await readLog(db)).length).toBe(1);

    const snap = await snapshot(db);
    expect(snap.entities.bibleEntries.length).toBe(1);
    expect((await readLog(db)).length).toBe(0); // compacted
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(1); // live state intact
    expect((await latestSnapshot(db))!.seq).toBe(snap.seq);
    db.close();
  });
});
