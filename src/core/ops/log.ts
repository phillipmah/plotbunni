import type { PlotBunniDB } from '../db/open';
import { OPLOG_STORE, META_STORE } from '../db/schema';
import type { OpRecord } from './types';

const SEQ_KEY = 'oplog:lastSeq';

export async function appendOps(
  db: PlotBunniDB, records: Omit<OpRecord, 'seq'>[],
): Promise<OpRecord[]> {
  const tx = db.transaction([OPLOG_STORE, META_STORE], 'readwrite');
  let seq = ((await tx.objectStore(META_STORE).get(SEQ_KEY)) as number | undefined) ?? 0;
  const out: OpRecord[] = [];
  for (const r of records) {
    seq += 1;
    const full: OpRecord = { ...r, seq };
    await tx.objectStore(OPLOG_STORE).put(full);
    out.push(full);
  }
  await tx.objectStore(META_STORE).put(seq, SEQ_KEY);
  await tx.done;
  return out;
}

export async function readLog(db: PlotBunniDB): Promise<OpRecord[]> {
  const all = await db.getAll(OPLOG_STORE);
  return all.sort((a, b) => a.seq - b.seq);
}

export async function lastTurn(db: PlotBunniDB): Promise<OpRecord[] | null> {
  const log = await readLog(db);
  if (log.length === 0) return null;
  const turnId = log[log.length - 1]!.turnId;
  return log.filter(r => r.turnId === turnId);
}
