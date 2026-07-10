import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { appendOps, readLog, lastTurn } from './log';
import type { CreateOp } from './types';

const NAME = 'TestDB_log';
afterEach(() => indexedDB.deleteDatabase(NAME));

const mkCreate = (turnId: string, id: string): CreateOp => ({
  type: 'create', store: 'bibleEntries', entityId: id, expectedVersion: null, actor: 'user', turnId,
  entity: { id, version: 1, deleted: false, createdAt: 0, updatedAt: 0 } as any,
});

describe('op log', () => {
  it('assigns increasing seq and reads back in order', async () => {
    const db = await openPlotBunniDB(NAME);
    const recs = await appendOps(db, [
      { turnId: 't1', actor: 'user', op: mkCreate('t1', 'a'), inverse: mkCreate('t1', 'a'), ts: 1 },
      { turnId: 't1', actor: 'user', op: mkCreate('t1', 'b'), inverse: mkCreate('t1', 'b'), ts: 1 },
    ]);
    expect(recs.map(r => r.seq)).toEqual([1, 2]);
    const more = await appendOps(db, [
      { turnId: 't2', actor: 'gen', op: mkCreate('t2', 'c'), inverse: mkCreate('t2', 'c'), ts: 2 },
    ]);
    expect(more[0]!.seq).toBe(3);
    expect((await readLog(db)).map(r => r.seq)).toEqual([1, 2, 3]);
    const turn = await lastTurn(db);
    expect(turn!.map(r => r.op.entityId)).toEqual(['c']);
    db.close();
  });
});
