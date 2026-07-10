import type { PlotBunniDB } from '../db/open';
import { getEntity, putEntity } from '../db/stores';
import type { AnyEntity } from '../model/entities';
import type { Op, CreateOp, UpdateOp, DeleteOp } from './types';

export class StaleWriteError extends Error {
  constructor(readonly entityId: string, readonly expected: number | null, readonly actual: number | null) {
    super(`stale write on ${entityId}: expected v${expected}, found v${actual}`);
    this.name = 'StaleWriteError';
  }
}

async function requireVersion(db: PlotBunniDB, op: Op): Promise<AnyEntity | undefined> {
  const current = await getEntity(db, op.store, op.entityId);
  const actual = current && !current.deleted ? current.version : null;
  if (op.expectedVersion !== actual) throw new StaleWriteError(op.entityId, op.expectedVersion, actual);
  return current;
}

export async function applyOp(db: PlotBunniDB, op: Op): Promise<Op> {
  const current = await requireVersion(db, op);

  if (op.type === 'create') {
    await putEntity(db, op.store, op.entity);
    const inverse: DeleteOp = {
      type: 'delete', store: op.store, entityId: op.entityId,
      expectedVersion: op.entity.version, actor: op.actor, turnId: op.turnId,
    };
    return inverse;
  }

  if (op.type === 'update') {
    const entity = current!;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(op.patch)) prev[k] = (entity as unknown as Record<string, unknown>)[k];
    const next = { ...entity, ...op.patch, version: entity.version + 1, updatedAt: Date.now() } as AnyEntity;
    await putEntity(db, op.store, next);
    const inverse: UpdateOp = {
      type: 'update', store: op.store, entityId: op.entityId,
      expectedVersion: next.version, actor: op.actor, turnId: op.turnId, patch: prev,
    };
    return inverse;
  }

  // delete (tombstone)
  const entity = current!;
  const next = { ...entity, deleted: true, version: entity.version + 1, updatedAt: Date.now() } as AnyEntity;
  await putEntity(db, op.store, next);
  const inverse: CreateOp = {
    type: 'create', store: op.store, entityId: op.entityId,
    expectedVersion: null, actor: op.actor, turnId: op.turnId, entity,
  };
  return inverse;
}
