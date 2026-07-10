import type { PlotBunniDB } from '../db/open';
import { removeEntity } from '../db/stores';
import { applyOp } from './apply';
import { appendOps } from './log';
import type { Actor, Op, OpRecord } from './types';
export { newTurnId } from './ids';

export async function dispatch(
  db: PlotBunniDB, ops: Op[], meta: { actor: Actor; turnId: string },
): Promise<OpRecord[]> {
  const applied: { op: Op; inverse: Op }[] = [];
  try {
    for (const op of ops) {
      const inverse = await applyOp(db, op);
      applied.push({ op, inverse });
    }
  } catch (err) {
    // roll back already-applied ops in reverse order; a create's rollback
    // hard-removes the row (it never should have existed) rather than
    // routing through applyOp's tombstoning delete inverse.
    for (let i = applied.length - 1; i >= 0; i--) {
      const { op, inverse } = applied[i]!;
      if (op.type === 'create') {
        await removeEntity(db, op.store, op.entityId);
      } else {
        await applyOp(db, inverse);
      }
    }
    throw err;
  }
  const ts = Date.now();
  return appendOps(db, applied.map(({ op, inverse }) => ({
    turnId: meta.turnId, actor: meta.actor, op, inverse, ts,
  })));
}
