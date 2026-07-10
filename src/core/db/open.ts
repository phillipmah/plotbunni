import { openDB, type IDBPDatabase } from 'idb';
import {
  SCHEMA_VERSION, STORE_NAMES, META_STORE, OPLOG_STORE, SNAPSHOT_STORE,
  type PlotBunniSchema,
} from './schema';

export type PlotBunniDB = IDBPDatabase<PlotBunniSchema>;

export function openPlotBunniDB(dbName = 'PlotBunniDB'): Promise<PlotBunniDB> {
  return openDB<PlotBunniSchema>(dbName, SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      // v0 -> v1: initial schema. Future migrations branch on oldVersion.
      if (oldVersion < 1) {
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(OPLOG_STORE)) {
          db.createObjectStore(OPLOG_STORE, { keyPath: 'seq' });
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'seq' });
        }
      }
    },
  });
}
