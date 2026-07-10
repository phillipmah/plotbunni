import type { PlotBunniDB } from '../db/open';
import { STORE_NAMES, SNAPSHOT_STORE, OPLOG_STORE, META_STORE } from '../db/schema';
import { getAllEntities } from '../db/stores';
import type { StoreName, AnyEntity } from '../model/entities';

export interface SnapshotRecord {
  seq: number;
  ts: number;
  entities: Record<StoreName, AnyEntity[]>;
}

export async function snapshot(db: PlotBunniDB): Promise<SnapshotRecord> {
  const lastSeq = ((await db.get(META_STORE, 'oplog:lastSeq')) as number | undefined) ?? 0;
  const entities = {} as Record<StoreName, AnyEntity[]>;
  for (const s of STORE_NAMES) entities[s] = await getAllEntities(db, s, { includeDeleted: true });

  const rec: SnapshotRecord = { seq: lastSeq, ts: Date.now(), entities };
  const tx = db.transaction([SNAPSHOT_STORE, OPLOG_STORE, META_STORE], 'readwrite');
  await tx.objectStore(SNAPSHOT_STORE).put(rec);
  let cursor = await tx.objectStore(OPLOG_STORE).openCursor();
  while (cursor) {
    if (cursor.value.seq <= lastSeq) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore(META_STORE).put(0, 'undo:depth');
  await tx.done;
  return rec;
}

export async function latestSnapshot(db: PlotBunniDB): Promise<SnapshotRecord | null> {
  const all = await db.getAll(SNAPSHOT_STORE);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.seq - a.seq)[0]!;
}
