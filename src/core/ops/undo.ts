import type { PlotBunniDB } from '../db/open';
import { META_STORE } from '../db/schema';
import { readLog } from './log';
import { applyOp } from './apply';
import type { OpRecord } from './types';

const DEPTH_KEY = 'undo:depth';

async function depth(db: PlotBunniDB): Promise<number> {
  return ((await db.get(META_STORE, DEPTH_KEY)) as number | undefined) ?? 0;
}
async function setDepth(db: PlotBunniDB, d: number): Promise<void> {
  await db.put(META_STORE, d, DEPTH_KEY);
}

// distinct turnIds in log order, oldest -> newest
function turnsInOrder(log: OpRecord[]): string[] {
  const seen = new Set<string>();
  const turns: string[] = [];
  for (const r of log) if (!seen.has(r.turnId)) { seen.add(r.turnId); turns.push(r.turnId); }
  return turns;
}

export async function undo(db: PlotBunniDB): Promise<boolean> {
  const log = await readLog(db);
  const turns = turnsInOrder(log);
  const d = await depth(db);
  if (d >= turns.length) return false;
  const target = turns[turns.length - 1 - d]!;
  const recs = log.filter(r => r.turnId === target).sort((a, b) => b.seq - a.seq);
  for (const r of recs) await applyOp(db, r.inverse);
  await setDepth(db, d + 1);
  return true;
}

export async function redo(db: PlotBunniDB): Promise<boolean> {
  const log = await readLog(db);
  const turns = turnsInOrder(log);
  const d = await depth(db);
  if (d <= 0) return false;
  const target = turns[turns.length - d]!;
  const recs = log.filter(r => r.turnId === target).sort((a, b) => a.seq - b.seq);
  for (const r of recs) await applyOp(db, r.op);
  await setDepth(db, d - 1);
  return true;
}
