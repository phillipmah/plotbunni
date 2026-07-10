import type { DBSchema } from 'idb';
import type { StoreName, AnyEntity } from '../model/entities';
import type { OpRecord } from '../ops/types';
import type { SnapshotRecord } from '../ops/snapshot';

export const SCHEMA_VERSION = 1;
export const STORE_NAMES = [
  'bibleEntries', 'relationships', 'books', 'chapters', 'scenes', 'chatThreads',
] as const satisfies readonly StoreName[];

export const META_STORE = 'meta' as const;
export const OPLOG_STORE = 'oplog' as const;
export const SNAPSHOT_STORE = 'snapshots' as const;

export interface PlotBunniSchema extends DBSchema {
  bibleEntries: { key: string; value: AnyEntity };
  relationships: { key: string; value: AnyEntity };
  books: { key: string; value: AnyEntity };
  chapters: { key: string; value: AnyEntity };
  scenes: { key: string; value: AnyEntity };
  chatThreads: { key: string; value: AnyEntity };
  meta: { key: string; value: unknown };
  oplog: { key: number; value: OpRecord };
  snapshots: { key: number; value: SnapshotRecord };
}
