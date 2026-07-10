import type { PlotBunniDB } from '../core/db/open';
import { STORE_NAMES, SCHEMA_VERSION } from '../core/db/schema';
import { getAllEntities } from '../core/db/stores';

export interface NovelExport {
  schemaVersion: number;
  exportedAt: number;
  stores: Record<string, unknown[]>;
}

export async function exportNovel(db: PlotBunniDB, now = Date.now()): Promise<NovelExport> {
  const stores: Record<string, unknown[]> = {};
  for (const name of STORE_NAMES) {
    stores[name] = await getAllEntities(db, name, { includeDeleted: true });
  }
  return { schemaVersion: SCHEMA_VERSION, exportedAt: now, stores };
}
