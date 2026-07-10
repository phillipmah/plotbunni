import type { PlotBunniDB } from './open';
import type { StoreName, AnyEntity } from '../model/entities';

export function getEntity<T extends AnyEntity>(
  db: PlotBunniDB, store: StoreName, id: string,
): Promise<T | undefined> {
  return db.get(store, id) as Promise<T | undefined>;
}

export async function putEntity(db: PlotBunniDB, store: StoreName, entity: AnyEntity): Promise<void> {
  await db.put(store, entity);
}

export async function getAllEntities<T extends AnyEntity>(
  db: PlotBunniDB, store: StoreName, opts: { includeDeleted?: boolean } = {},
): Promise<T[]> {
  const all = (await db.getAll(store)) as T[];
  return opts.includeDeleted ? all : all.filter(e => !e.deleted);
}
