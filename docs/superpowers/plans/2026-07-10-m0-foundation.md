# M0 Foundation (Persistence + Op-Dispatcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first persistence layer and the single serialized op-dispatcher that every user and AI mutation flows through — the spine all later M0 work depends on.

**Architecture:** Normalized IndexedDB object stores (one per entity type) accessed via `idb`, with a `schemaVersion` + migration runner. All mutations go through one dispatcher that enforces per-entity `version` preconditions (no silent clobber), groups ops by `turnId`, appends each to an op-log with a stored inverse, and supports turn-grouped **linear** undo/redo, snapshot+compaction, and Web-Locks single-writer. Pure and headless — no UI, no network; fully unit-tested with `fake-indexeddb`.

**Tech Stack:** TypeScript (strict), Vite + React 18 (retained from v1), Vitest, fake-indexeddb, idb.

## Global Constraints

- **Language:** TypeScript, `strict: true`. No `any` in committed code except explicitly-justified boundaries.
- **Package name:** `plotbunni` (rename from v1 placeholder `claudetemplate`).
- **Persistence:** IndexedDB only, DB name `PlotBunniDB`, one object store per entity type, `SCHEMA_VERSION` constant + migration runner in `upgrade`. Never serialize a whole-novel blob (v1's anti-pattern).
- **Mutation rule:** ALL state changes (user *and* AI) go through `dispatch()`. No module writes an object store directly except `stores.ts` primitives called by the dispatcher/migrations.
- **Concurrency:** every entity carries a monotonic `version`; an op with a mismatched `expectedVersion` is rejected (`StaleWriteError`) with no partial application. Naive last-write-wins is forbidden.
- **Undo:** linear stack only, at **turn** granularity. No selective/out-of-order revert in M0.
- **Test runner:** `npm test` = `vitest run`. Every task ends green.
- **Commits:** conventional-commit messages; commit at the end of each task's cycle.
- **Deferred within Foundation (do NOT build here):** diff-based text inverses (store previous values instead — correctness first; diff-compaction is Plan 7/Hardening); any React/UI; any network/LLM code.

**Note on app runnability:** during Foundation the Vite app does not serve the new UI (that arrives in Plan 5). v1 is preserved in `legacy/` and at git tag `v1-reference`. The gate for every task here is **Vitest green**, not the running app.

---

### Task 1: Bootstrap TypeScript + Vitest, archive v1

**Files:**
- Create: `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `vitest.setup.ts`, `src/core/README.md`
- Modify: `package.json` (name, deps, scripts)
- Move: `src/` → `legacy/` (git)

**Interfaces:**
- Produces: a green `npm test`; `src/core/` as the home for foundation modules.

- [ ] **Step 1: Tag and archive v1 as reference**

```bash
cd /home/ptm/plotbunni
git tag v1-reference
git mv src legacy
mkdir -p src/core
```

- [ ] **Step 2: Install toolchain**

```bash
npm install -D typescript vitest fake-indexeddb @types/node
npm install idb
```

- [ ] **Step 3: Rename package + add scripts**

In `package.json`, set `"name": "plotbunni"` and ensure scripts include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  }
}
```

- [ ] **Step 4: Add TS + Vitest config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`vitest.setup.ts` (installs a fresh in-memory IndexedDB per test file):

```ts
import 'fake-indexeddb/auto';
```

- [ ] **Step 5: Add a smoke test**

`src/core/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });
  it('has a global indexedDB from fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
  });
});
```

- [ ] **Step 6: Run tests (expect PASS)**

Run: `npm test`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: bootstrap TypeScript + Vitest, archive v1 to legacy/ and tag v1-reference"
```

---

### Task 2: Entity model + factories + id

**Files:**
- Create: `src/core/model/ids.ts`, `src/core/model/entities.ts`, `src/core/model/entities.test.ts`

**Interfaces:**
- Produces:
  - `newId(): EntityId` (`crypto.randomUUID()`)
  - `type EntityId = string`
  - `interface BaseEntity { id: EntityId; version: number; deleted: boolean; createdAt: number; updatedAt: number }`
  - Entity interfaces: `BibleEntry`, `Facet`, `Relationship`, `Book`, `Chapter`, `Scene`, `ChatThread`
  - `type StoreName = 'bibleEntries' | 'relationships' | 'books' | 'chapters' | 'scenes' | 'chatThreads'`
  - Factories: `createBibleEntry`, `createRelationship`, `createBook`, `createChapter`, `createScene`, `createChatThread` — each returns the entity with `version: 1, deleted: false` and timestamps.

- [ ] **Step 1: Write the failing test**

`src/core/model/entities.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createBibleEntry, createScene } from './entities';

describe('entity factories', () => {
  it('creates a bible entry at version 1, not deleted', () => {
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    expect(e.version).toBe(1);
    expect(e.deleted).toBe(false);
    expect(e.type).toBe('character');
    expect(e.facets).toEqual([]);
    expect(e.createdAt).toBe(e.updatedAt);
  });

  it('creates a scene with empty prose and links', () => {
    const s = createScene({ chapterId: 'c1', title: 'Arrival' });
    expect(s.content).toBe('');
    expect(s.synopsis).toBe('');
    expect(s.linkedEntryIds).toEqual([]);
    expect(s.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entities`
Expected: FAIL ("Cannot find module './entities'").

- [ ] **Step 3: Implement ids + entities**

`src/core/model/ids.ts`:

```ts
export type EntityId = string;
export const newId = (): EntityId => crypto.randomUUID();
```

`src/core/model/entities.ts`:

```ts
import { newId, type EntityId } from './ids';

export type StoreName =
  | 'bibleEntries' | 'relationships' | 'books' | 'chapters' | 'scenes' | 'chatThreads';

export interface BaseEntity {
  id: EntityId;
  version: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

const base = (): BaseEntity => {
  const now = Date.now();
  return { id: newId(), version: 1, deleted: false, createdAt: now, updatedAt: now };
};

export type BibleEntryType =
  | 'character' | 'location' | 'item' | 'lore' | 'arc' | 'theme' | 'faction' | 'event';

export interface Facet {
  key: string;
  content: string;
  priority: number;
  revealedAtSceneId?: EntityId; // reserved for M1 spoiler scoping
}

export interface BibleEntry extends BaseEntity {
  type: BibleEntryType | string;
  name: string;
  aliases: string[];
  keys: string[];
  summary: string;             // derived from facets; may be flagged stale by callers
  facets: Facet[];             // canonical prose
  fields: Record<string, string | number>; // typed scalar attributes only
  tags: string[];
  priority: number;
  image?: EntityId;            // Blob ref (M1)
}

export interface Relationship extends BaseEntity {
  from: EntityId;
  to: EntityId;
  type: string;
  label?: string;
  directed: boolean;
}

export interface Book extends BaseEntity { title: string; chapterOrder: EntityId[]; }
export interface Chapter extends BaseEntity {
  bookId: EntityId; title: string; synopsis: string; sceneOrder: EntityId[];
}

export interface SceneLink { entryId: EntityId; source: 'auto' | 'user'; state: 'active' | 'blocked'; }
export interface Scene extends BaseEntity {
  chapterId: EntityId;
  title: string;
  content: string;            // markdown prose
  synopsis: string;           // backward-facing summary
  synopsisForward?: string;   // reserved; injection default off
  linkedEntryIds: SceneLink[];
  pov?: string;
  tags: string[];
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string; turnId?: string; ts: number; }
export interface ChatThread extends BaseEntity { title: string; messages: ChatMessage[]; }

export const createBibleEntry = (
  p: { type: BibleEntry['type']; name: string } & Partial<BibleEntry>,
): BibleEntry => ({
  ...base(), aliases: [], keys: [], summary: '', facets: [], fields: {}, tags: [], priority: 0,
  ...p,
});

export const createRelationship = (
  p: { from: EntityId; to: EntityId; type: string } & Partial<Relationship>,
): Relationship => ({ ...base(), directed: false, ...p });

export const createBook = (p: { title: string } & Partial<Book>): Book =>
  ({ ...base(), chapterOrder: [], ...p });

export const createChapter = (
  p: { bookId: EntityId; title: string } & Partial<Chapter>,
): Chapter => ({ ...base(), synopsis: '', sceneOrder: [], ...p });

export const createScene = (
  p: { chapterId: EntityId; title: string } & Partial<Scene>,
): Scene => ({ ...base(), content: '', synopsis: '', linkedEntryIds: [], tags: [], ...p });

export const createChatThread = (p: Partial<ChatThread> = {}): ChatThread =>
  ({ ...base(), title: 'Untitled', messages: [], ...p });

export type AnyEntity = BibleEntry | Relationship | Book | Chapter | Scene | ChatThread;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entities`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/model
git commit -m "feat(core): entity model, factories, and id generation"
```

---

### Task 3: DB open + schema + migration runner

**Files:**
- Create: `src/core/db/schema.ts`, `src/core/db/open.ts`, `src/core/db/open.test.ts`

**Interfaces:**
- Consumes: `StoreName` from `model/entities`.
- Produces:
  - `SCHEMA_VERSION: number`, `STORE_NAMES: readonly StoreName[]`, `META_STORE = 'meta'`, `OPLOG_STORE = 'oplog'`, `SNAPSHOT_STORE = 'snapshots'`
  - `openPlotBunniDB(dbName?: string): Promise<IDBPDatabase<PlotBunniSchema>>`
  - `type PlotBunniSchema` (idb DBSchema)

- [ ] **Step 1: Write the failing test**

`src/core/db/open.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from './open';
import { STORE_NAMES, OPLOG_STORE, META_STORE, SNAPSHOT_STORE, SCHEMA_VERSION } from './schema';

const NAME = 'TestDB_open';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('openPlotBunniDB', () => {
  it('creates every entity store plus meta/oplog/snapshots', async () => {
    const db = await openPlotBunniDB(NAME);
    for (const s of STORE_NAMES) expect(db.objectStoreNames.contains(s)).toBe(true);
    expect(db.objectStoreNames.contains(OPLOG_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(META_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(SNAPSHOT_STORE)).toBe(true);
    expect(db.version).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('is idempotent across reopen', async () => {
    (await openPlotBunniDB(NAME)).close();
    const db = await openPlotBunniDB(NAME);
    expect(db.objectStoreNames.contains('scenes')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- open`
Expected: FAIL ("Cannot find module './open'").

- [ ] **Step 3: Implement schema + open**

`src/core/db/schema.ts`:

```ts
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
```

`src/core/db/open.ts`:

```ts
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
```

*Note:* `schema.ts` imports `OpRecord`/`SnapshotRecord` (defined in Tasks 5 & 9). Add minimal stub types now so this compiles, and let Tasks 5/9 replace them:

`src/core/ops/types.ts` (stub — completed in Task 5):

```ts
export interface OpRecord { seq: number }
```

`src/core/ops/snapshot.ts` (stub — completed in Task 9):

```ts
export interface SnapshotRecord { seq: number }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- open`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/db src/core/ops/types.ts src/core/ops/snapshot.ts
git commit -m "feat(core): IndexedDB schema, stores, and migration runner"
```

---

### Task 4: Store CRUD primitives + version helper

**Files:**
- Create: `src/core/db/stores.ts`, `src/core/db/stores.test.ts`

**Interfaces:**
- Consumes: `PlotBunniDB`, `StoreName`, `AnyEntity`.
- Produces:
  - `getEntity<T extends AnyEntity>(db, store, id): Promise<T | undefined>`
  - `putEntity(db, store, entity): Promise<void>`
  - `getAllEntities<T extends AnyEntity>(db, store, opts?: { includeDeleted?: boolean }): Promise<T[]>`
  (Deletion is done via the dispatcher setting `deleted: true` — no hard-delete primitive.)

- [ ] **Step 1: Write the failing test**

`src/core/db/stores.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from './open';
import { getEntity, putEntity, getAllEntities } from './stores';
import { createBibleEntry } from '../model/entities';

const NAME = 'TestDB_stores';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('store primitives', () => {
  it('round-trips an entity', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    await putEntity(db, 'bibleEntries', e);
    expect(await getEntity(db, 'bibleEntries', e.id)).toEqual(e);
    db.close();
  });

  it('getAll excludes tombstoned entities by default', async () => {
    const db = await openPlotBunniDB(NAME);
    const live = createBibleEntry({ type: 'item', name: 'Sword' });
    const dead = createBibleEntry({ type: 'item', name: 'Ghost', deleted: true });
    await putEntity(db, 'bibleEntries', live);
    await putEntity(db, 'bibleEntries', dead);
    expect((await getAllEntities(db, 'bibleEntries')).map(e => e.id)).toEqual([live.id]);
    expect((await getAllEntities(db, 'bibleEntries', { includeDeleted: true })).length).toBe(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stores`
Expected: FAIL ("Cannot find module './stores'").

- [ ] **Step 3: Implement primitives**

`src/core/db/stores.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- stores`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/db/stores.ts src/core/db/stores.test.ts
git commit -m "feat(core): normalized store CRUD primitives with tombstone filtering"
```

---

### Task 5: Op types + op-log append/read

**Files:**
- Modify: `src/core/ops/types.ts` (replace stub)
- Create: `src/core/ops/log.ts`, `src/core/ops/log.test.ts`

**Interfaces:**
- Consumes: `StoreName`, `AnyEntity`, `PlotBunniDB`.
- Produces:
  - Op union: `Op = CreateOp | UpdateOp | DeleteOp`, each with `{ store, entityId, expectedVersion, actor, turnId }`
  - `interface OpRecord { seq: number; turnId: string; actor: Actor; op: Op; inverse: Op; ts: number }`
  - `appendOps(db, records: Omit<OpRecord,'seq'>[]): Promise<OpRecord[]>` (assigns monotonic seq)
  - `readLog(db): Promise<OpRecord[]>` (ordered by seq)
  - `lastTurn(db): Promise<OpRecord[] | null>` (the highest-seq turn's records)

- [ ] **Step 1: Write the failing test**

`src/core/ops/log.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { appendOps, readLog, lastTurn } from './log';
import type { CreateOp } from './types';

const NAME = 'TestDB_log';
afterEach(() => indexedDB.deleteDatabase(NAME));

const mkCreate = (turnId: string, id: string): CreateOp => ({
  type: 'create', store: 'bibleEntries', entityId: id, expectedVersion: null, actor: 'user', turnId,
  entity: { id, version: 1, deleted: false, createdAt: 0, updatedAt: 0 } as any,
});

describe('op log', () => {
  it('assigns increasing seq and reads back in order', async () => {
    const db = await openPlotBunniDB(NAME);
    const recs = await appendOps(db, [
      { turnId: 't1', actor: 'user', op: mkCreate('t1', 'a'), inverse: mkCreate('t1', 'a'), ts: 1 },
      { turnId: 't1', actor: 'user', op: mkCreate('t1', 'b'), inverse: mkCreate('t1', 'b'), ts: 1 },
    ]);
    expect(recs.map(r => r.seq)).toEqual([1, 2]);
    const more = await appendOps(db, [
      { turnId: 't2', actor: 'gen', op: mkCreate('t2', 'c'), inverse: mkCreate('t2', 'c'), ts: 2 },
    ]);
    expect(more[0]!.seq).toBe(3);
    expect((await readLog(db)).map(r => r.seq)).toEqual([1, 2, 3]);
    const turn = await lastTurn(db);
    expect(turn!.map(r => r.op.entityId)).toEqual(['c']);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ops/log`
Expected: FAIL ("Cannot find module './log'").

- [ ] **Step 3: Implement op types + log**

`src/core/ops/types.ts` (replace the stub):

```ts
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
```

`src/core/ops/log.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ops/log`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/types.ts src/core/ops/log.ts src/core/ops/log.test.ts
git commit -m "feat(core): op types and monotonic append-only op-log"
```

---

### Task 6: applyOp + inverse computation

**Files:**
- Create: `src/core/ops/apply.ts`, `src/core/ops/apply.test.ts`

**Interfaces:**
- Consumes: `Op`, store primitives, `AnyEntity`.
- Produces:
  - `class StaleWriteError extends Error` (`{ entityId, expected, actual }`)
  - `applyOp(db, op): Promise<Op>` — validates `expectedVersion` against the current entity, applies the mutation (bumping `version` and `updatedAt`), and returns the **inverse** op. Throws `StaleWriteError` on version mismatch. Used only by the dispatcher (Task 7).

- [ ] **Step 1: Write the failing test**

`src/core/ops/apply.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getEntity, putEntity } from '../db/stores';
import { applyOp, StaleWriteError } from './apply';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp, UpdateOp, DeleteOp } from './types';

const NAME = 'TestDB_apply';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('applyOp', () => {
  it('creates, returns a delete inverse, entity at version 1', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' });
    const op: CreateOp = { type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: 't', entity: e };
    const inv = await applyOp(db, op);
    expect(inv.type).toBe('delete');
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!.version).toBe(1);
    db.close();
  });

  it('updates with version bump and an inverse that restores prior values', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob', summary: 'old' });
    await putEntity(db, 'bibleEntries', e);
    const op: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: e.id, expectedVersion: 1, actor: 'user', turnId: 't', patch: { summary: 'new' } };
    const inv = await applyOp(db, op) as UpdateOp;
    const after = (await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!;
    expect(after.summary).toBe('new');
    expect(after.version).toBe(2);
    expect(inv.type).toBe('update');
    expect(inv.patch).toEqual({ summary: 'old' });
    expect(inv.expectedVersion).toBe(2);
    db.close();
  });

  it('rejects a stale expectedVersion', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'character', name: 'Bob' }); // version 1
    await putEntity(db, 'bibleEntries', e);
    const op: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: e.id, expectedVersion: 99, actor: 'user', turnId: 't', patch: { name: 'X' } };
    await expect(applyOp(db, op)).rejects.toBeInstanceOf(StaleWriteError);
    db.close();
  });

  it('deletes via tombstone with a create inverse', async () => {
    const db = await openPlotBunniDB(NAME);
    const e = createBibleEntry({ type: 'item', name: 'Key' });
    await putEntity(db, 'bibleEntries', e);
    const op: DeleteOp = { type: 'delete', store: 'bibleEntries', entityId: e.id, expectedVersion: 1, actor: 'user', turnId: 't' };
    const inv = await applyOp(db, op) as CreateOp;
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', e.id))!.deleted).toBe(true);
    expect(inv.type).toBe('create');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ops/apply`
Expected: FAIL ("Cannot find module './apply'").

- [ ] **Step 3: Implement applyOp**

`src/core/ops/apply.ts`:

```ts
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
    for (const k of Object.keys(op.patch)) prev[k] = (entity as Record<string, unknown>)[k];
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
```

*Note on delete/create inverses:* undoing a delete re-creates the pre-delete entity (with its old version) via a create op whose `expectedVersion: null` requires the slot to be tombstoned/absent — which it is. This keeps linear undo sound.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ops/apply`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/apply.ts src/core/ops/apply.test.ts
git commit -m "feat(core): applyOp with version preconditions and inverse computation"
```

---

### Task 7: Dispatcher (transactional turn, precondition, logging)

**Files:**
- Create: `src/core/ops/dispatcher.ts`, `src/core/ops/dispatcher.test.ts`
- Create: `src/core/ops/ids.ts` (`newTurnId`)

**Interfaces:**
- Consumes: `applyOp`, `StaleWriteError`, `appendOps`, `Op`, `OpRecord`.
- Produces:
  - `newTurnId(): string`
  - `dispatch(db, ops: Op[], meta: { actor: Actor; turnId?: string }): Promise<OpRecord[]>` — applies all ops **in order**; if any throws `StaleWriteError`, rolls back already-applied ops in the turn (via their inverses) and rethrows, leaving the store untouched; on success appends all `{op, inverse}` to the log under one `turnId`.

- [ ] **Step 1: Write the failing test**

`src/core/ops/dispatcher.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities, getEntity } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { readLog } from './log';
import { StaleWriteError } from './apply';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp, UpdateOp } from './types';

const NAME = 'TestDB_dispatch';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, turnId: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId, entity: e });

describe('dispatch', () => {
  it('applies a multi-op turn and logs it under one turnId', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const b = createBibleEntry({ type: 'character', name: 'B' });
    const t = newTurnId();
    const recs = await dispatch(db, [create(a, t), create(b, t)], { actor: 'user', turnId: t });
    expect(recs.length).toBe(2);
    expect(new Set(recs.map(r => r.turnId)).size).toBe(1);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);
    db.close();
  });

  it('rolls back the whole turn if a later op is stale, leaving no trace', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const t = newTurnId();
    const goodCreate = create(a, t);
    const staleUpdate: UpdateOp = { type: 'update', store: 'bibleEntries', entityId: 'missing', expectedVersion: 5, actor: 'user', turnId: t, patch: { name: 'X' } };
    await expect(dispatch(db, [goodCreate, staleUpdate], { actor: 'user', turnId: t }))
      .rejects.toBeInstanceOf(StaleWriteError);
    // rollback: entity A must NOT persist, and the log must be empty
    expect(await getEntity(db, 'bibleEntries', a.id)).toBeUndefined();
    expect((await readLog(db)).length).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dispatcher`
Expected: FAIL ("Cannot find module './dispatcher'").

- [ ] **Step 3: Implement turn-id + dispatcher**

`src/core/ops/ids.ts`:

```ts
export const newTurnId = (): string => crypto.randomUUID();
```

`src/core/ops/dispatcher.ts`:

```ts
import type { PlotBunniDB } from '../db/open';
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
    // roll back already-applied ops in reverse order
    for (let i = applied.length - 1; i >= 0; i--) {
      await applyOp(db, applied[i]!.inverse);
    }
    throw err;
  }
  const ts = Date.now();
  return appendOps(db, applied.map(({ op, inverse }) => ({
    turnId: meta.turnId, actor: meta.actor, op, inverse, ts,
  })));
}
```

*Note:* rollback replays inverses through `applyOp`, which recomputes-and-checks versions, so a partially-applied turn is fully reversed before the log is ever touched — the store and log stay consistent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dispatcher`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/dispatcher.ts src/core/ops/ids.ts src/core/ops/dispatcher.test.ts
git commit -m "feat(core): transactional op-dispatcher with turn rollback"
```

---

### Task 8: Undo / redo (turn-grouped linear stack)

**Files:**
- Create: `src/core/ops/undo.ts`, `src/core/ops/undo.test.ts`

**Interfaces:**
- Consumes: `readLog`, `applyOp`, `appendOps`, `OpRecord`.
- Produces:
  - `undo(db): Promise<boolean>` — reverts the most recent *turn* not already undone (applies its inverses in reverse seq, records a compensating turn tagged `undoOf`), returns `false` if nothing to undo.
  - `redo(db): Promise<boolean>` — re-applies the most recently undone turn.

  Implementation uses a `meta` cursor `undo:depth` counting how many turns from the tail are currently undone, so redo is unambiguous. Undo/redo do **not** append fresh forward ops to the visible log tail; they move the cursor and mutate the stores via inverses.

- [ ] **Step 1: Write the failing test**

`src/core/ops/undo.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getEntity, getAllEntities } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { undo, redo } from './undo';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp } from './types';

const NAME = 'TestDB_undo';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, t: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: t, entity: e });

describe('undo/redo', () => {
  it('undoes a whole turn atomically and redoes it', async () => {
    const db = await openPlotBunniDB(NAME);
    const a = createBibleEntry({ type: 'character', name: 'A' });
    const b = createBibleEntry({ type: 'character', name: 'B' });
    const t = newTurnId();
    await dispatch(db, [create(a, t), create(b, t)], { actor: 'user', turnId: t });
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);

    expect(await undo(db)).toBe(true);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(0);

    expect(await redo(db)).toBe(true);
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(2);
    expect((await getEntity<BibleEntry>(db, 'bibleEntries', a.id))!.name).toBe('A');
    db.close();
  });

  it('returns false when there is nothing to undo', async () => {
    const db = await openPlotBunniDB(NAME);
    expect(await undo(db)).toBe(false);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ops/undo`
Expected: FAIL ("Cannot find module './undo'").

- [ ] **Step 3: Implement undo/redo**

`src/core/ops/undo.ts`:

```ts
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
```

*Note:* a fresh `dispatch()` while `depth > 0` should reset `depth` to 0 (new work invalidates the redo tail). Add that in the UI-integration plan (Plan 5) where dispatch is wrapped in the app store; the core primitive stays pure. Document it here so it isn't lost.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ops/undo`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/undo.ts src/core/ops/undo.test.ts
git commit -m "feat(core): turn-grouped linear undo/redo"
```

---

### Task 9: Snapshot + compaction

**Files:**
- Modify: `src/core/ops/snapshot.ts` (replace stub)
- Create: `src/core/ops/snapshot.test.ts`

**Interfaces:**
- Consumes: `getAllEntities`, `readLog`, store primitives, `STORE_NAMES`.
- Produces:
  - `interface SnapshotRecord { seq: number; ts: number; entities: Record<StoreName, AnyEntity[]> }`
  - `snapshot(db): Promise<SnapshotRecord>` — writes a full-state snapshot at the current tail seq and deletes op-log records with `seq <= that seq` (compaction). Resets `undo:depth` to 0 (history before a snapshot is not undoable).
  - `latestSnapshot(db): Promise<SnapshotRecord | null>`

- [ ] **Step 1: Write the failing test**

`src/core/ops/snapshot.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { dispatch, newTurnId } from './dispatcher';
import { readLog } from './log';
import { snapshot, latestSnapshot } from './snapshot';
import { createBibleEntry, type BibleEntry } from '../model/entities';
import type { CreateOp } from './types';

const NAME = 'TestDB_snapshot';
afterEach(() => indexedDB.deleteDatabase(NAME));

const create = (e: BibleEntry, t: string): CreateOp =>
  ({ type: 'create', store: 'bibleEntries', entityId: e.id, expectedVersion: null, actor: 'user', turnId: t, entity: e });

describe('snapshot + compaction', () => {
  it('captures current state and truncates the log', async () => {
    const db = await openPlotBunniDB(NAME);
    const t = newTurnId();
    await dispatch(db, [create(createBibleEntry({ type: 'character', name: 'A' }), t)], { actor: 'user', turnId: t });
    expect((await readLog(db)).length).toBe(1);

    const snap = await snapshot(db);
    expect(snap.entities.bibleEntries.length).toBe(1);
    expect((await readLog(db)).length).toBe(0); // compacted
    expect((await getAllEntities(db, 'bibleEntries')).length).toBe(1); // live state intact
    expect((await latestSnapshot(db))!.seq).toBe(snap.seq);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- snapshot`
Expected: FAIL (stub `SnapshotRecord` has no `entities`).

- [ ] **Step 3: Implement snapshot (replace stub)**

`src/core/ops/snapshot.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- snapshot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ops/snapshot.ts src/core/ops/snapshot.test.ts
git commit -m "feat(core): full-state snapshot with op-log compaction"
```

---

### Task 10: Web Locks single-writer

**Files:**
- Create: `src/core/db/lock.ts`, `src/core/db/lock.test.ts`

**Interfaces:**
- Produces:
  - `acquireWriter(novelId, opts?: { locks?: LockManager }): Promise<{ release(): void } | null>` — resolves with a handle if this context won the exclusive writer lock, or `null` immediately if another context already holds it (second tab → read-only). Injectable `locks` for testing.

- [ ] **Step 1: Write the failing test**

`src/core/db/lock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { acquireWriter } from './lock';

// Minimal fake LockManager: grants exclusive, ifAvailable-aware.
function fakeLocks(): LockManager {
  const held = new Set<string>();
  return {
    async request(name: string, options: any, cb: any) {
      const ifAvailable = options?.ifAvailable;
      if (held.has(name)) return ifAvailable ? cb(null) : new Promise(() => {});
      held.add(name);
      try { return await cb({ name } as Lock); } finally { /* held until release */ }
    },
    async query() { return { held: [], pending: [] }; },
  } as unknown as LockManager;
}

describe('acquireWriter', () => {
  it('grants the first writer and refuses the second', async () => {
    const locks = fakeLocks();
    const first = await acquireWriter('novel-1', { locks });
    expect(first).not.toBeNull();
    const second = await acquireWriter('novel-1', { locks });
    expect(second).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lock`
Expected: FAIL ("Cannot find module './lock'").

- [ ] **Step 3: Implement the lock**

`src/core/db/lock.ts`:

```ts
export interface WriterHandle { release(): void }

export function acquireWriter(
  novelId: string, opts: { locks?: LockManager } = {},
): Promise<WriterHandle | null> {
  const locks = opts.locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined);
  const name = `plotbunni:writer:${novelId}`;
  if (!locks) return Promise.resolve({ release() {} }); // no Web Locks → assume single context

  return new Promise<WriterHandle | null>((resolve) => {
    locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return; }               // someone else holds it
      return new Promise<void>((release) => {
        resolve({ release });                              // hold the lock until release() is called
      });
    }).catch(() => resolve(null));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lock`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
npm test && npm run typecheck
git add src/core/db/lock.ts src/core/db/lock.test.ts
git commit -m "feat(core): Web Locks single-writer guard"
```

Expected: all tests pass, `tsc` clean.

---

## Self-Review

- **Spec coverage (§4.3, §5 of the design):** normalized stores ✓ (T3/T4), schemaVersion + migration runner ✓ (T3), tombstones ✓ (T4/T6), op-dispatcher single path ✓ (T7), entityVersion preconditions ✓ (T6/T7), turnId grouping ✓ (T5/T7), linear turn-grouped undo ✓ (T8), snapshot+compaction ✓ (T9), Web Locks single-writer ✓ (T10). ChatThread entity present for later chat persistence ✓ (T2). **Deferred (documented, not gaps):** diff-based text inverses (→ Plan 7), chat-thread *usage* / provenance (→ Plans 4–5), `navigator.storage.persist()` + export (→ Plan 7), the dispatch-resets-redo-depth wrapper (→ Plan 5).
- **Placeholder scan:** the `OpRecord`/`SnapshotRecord` stubs in T3 are explicitly replaced in T5/T9 (real code shown in both), not placeholders. No TODO/TBD requirements remain.
- **Type consistency:** `StoreName`, `Op`/`OpRecord`, `dispatch(db, ops, {actor, turnId})`, `applyOp` returning the inverse `Op`, `SnapshotRecord.entities: Record<StoreName, AnyEntity[]>` are consistent across T2–T10.
