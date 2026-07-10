import type { StoreName, AnyEntity } from '../model/entities';

export type Actor = 'user' | 'gen';

interface OpCommon {
  store: StoreName;
  entityId: string;
  expectedVersion: number | null; // null = create (entity must not already exist)
  actor: Actor;
  turnId: string;
}
export interface CreateOp extends OpCommon { type: 'create'; entity: AnyEntity; }
export interface UpdateOp extends OpCommon { type: 'update'; patch: Record<string, unknown>; }
export interface DeleteOp extends OpCommon { type: 'delete'; }
export type Op = CreateOp | UpdateOp | DeleteOp;

export interface OpRecord {
  seq: number;
  turnId: string;
  actor: Actor;
  op: Op;
  inverse: Op;
  ts: number;
}
