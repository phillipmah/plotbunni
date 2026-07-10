# M0 Plan 7 (Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Production-harden M0: a resilient LLM transport (timeout + retry/backoff), a versioned whole-novel JSON export (the only backup story in a local-first app), and durable storage (`navigator.storage.persist()`), surfaced with an Export button.

**Architecture:** Extend the Plan 4 transport with retry/timeout (injectable). Add `src/app/export.ts` (serialize all stores to a versioned JSON) and `src/app/persist.ts` (request persistent storage + a browser download helper). Wire persistence on boot and an Export button in the agent panel.

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit.
- Export JSON carries `schemaVersion` (from `db/schema`) and never includes endpoint secrets (those live only in localStorage settings).
- UI additions are typecheck-gated. Task 3 runs `npm run build` and it must succeed.
- Conventional-commit messages exactly as specified.

---

### Task 1: Resilient transport (timeout + retry)

**Files:**
- Modify: `src/core/generate/transport.ts`
- Create: `src/core/generate/transport.retry.test.ts`

**Interfaces:**
- Extends `createTransport(profile, deps?)` with `deps.retries?: number` (default 2) and `deps.timeoutMs?: number` (default 60000). Retries on thrown network errors and on HTTP 429/5xx with exponential backoff; aborts a request after `timeoutMs`. A retry delay hook `deps.sleep?: (ms:number)=>Promise<void>` is injectable for tests (default real setTimeout).

- [ ] **Step 1: Write the failing test**

`src/core/generate/transport.retry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTransport, type EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};
const ok = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'done' } }] }) } as any;
const err500 = { ok: false, status: 500, json: async () => ({}) } as any;

describe('createTransport resilience', () => {
  it('retries on a 500 then succeeds', async () => {
    let calls = 0;
    const fakeFetch = (async () => (calls++ === 0 ? err500 : ok)) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    expect(await transport([{ role: 'user', content: 'hi' }])).toBe('done');
    expect(calls).toBe(2);
  });

  it('gives up after exhausting retries', async () => {
    let calls = 0;
    const fakeFetch = (async () => { calls++; return err500; }) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('500');
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('does not retry on a 400', async () => {
    let calls = 0;
    const err400 = { ok: false, status: 400, json: async () => ({}) } as any;
    const fakeFetch = (async () => { calls++; return err400; }) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch, retries: 2, sleep: async () => {} });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('400');
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transport.retry`
Expected: FAIL (retries/sleep options not honored; 500 not retried).

- [ ] **Step 3: Implement (replace `src/core/generate/transport.ts`)**

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatTransport = (messages: ChatMessage[]) => Promise<string>;

export interface EndpointProfile {
  baseUrl: string; apiKey: string; model: string; contextLength: number; maxOutput: number;
}

interface TransportDeps {
  fetch?: typeof fetch;
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createTransport(profile: EndpointProfile, deps: TransportDeps = {}): ChatTransport {
  const doFetch = deps.fetch ?? fetch;
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 60000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));

  return async (messages) => {
    let lastErr: Error = new Error('no attempt');
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(200 * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${profile.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
          body: JSON.stringify({
            model: profile.model, messages, max_tokens: profile.maxOutput,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = new Error(`endpoint returned ${res.status}`);
          if (isRetryable(res.status) && attempt < retries) { lastErr = err; continue; }
          throw err;
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return data.choices?.[0]?.message?.content ?? '';
      } catch (e) {
        lastErr = e as Error;
        const status = Number((lastErr.message.match(/returned (\d+)/) ?? [])[1]);
        if (status && !isRetryable(status)) throw lastErr; // non-retryable HTTP → stop
        if (attempt >= retries) throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS (Plan 4's `generate/transport` test still passes), clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/transport.ts src/core/generate/transport.retry.test.ts
git commit -m "feat(generate): resilient transport with timeout and retry"
```

---

### Task 2: Versioned whole-novel export

**Files:**
- Create: `src/app/export.ts`, `src/app/export.test.ts`

**Interfaces:**
- Consumes: `getAllEntities`, `STORE_NAMES`, `SCHEMA_VERSION`, `PlotBunniDB`.
- Produces:
  - `interface NovelExport { schemaVersion: number; exportedAt: number; stores: Record<string, unknown[]> }`
  - `exportNovel(db: PlotBunniDB, now?: number): Promise<NovelExport>` — every entity store (including tombstoned), tagged with `schemaVersion`.

- [ ] **Step 1: Write the failing test**

`src/app/export.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../core/db/open';
import { putEntity } from '../core/db/stores';
import { createBibleEntry } from '../core/model/entities';
import { SCHEMA_VERSION } from '../core/db/schema';
import { exportNovel } from './export';

const NAME = 'TestDB_export';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('exportNovel', () => {
  it('serializes all stores with the schema version', async () => {
    const db = await openPlotBunniDB(NAME);
    await putEntity(db, 'bibleEntries', createBibleEntry({ type: 'character', name: 'Bob' }));
    const out = await exportNovel(db, 123);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.exportedAt).toBe(123);
    expect((out.stores.bibleEntries as any[]).length).toBe(1);
    expect(Object.keys(out.stores)).toContain('scenes');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/export`
Expected: FAIL ("Cannot find module './export'").

- [ ] **Step 3: Implement**

`src/app/export.ts`:

```ts
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
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- app/export && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/export.ts src/app/export.test.ts
git commit -m "feat(app): versioned whole-novel JSON export"
```

---

### Task 3: Storage persistence + export button

**Files:**
- Create: `src/app/persist.ts`, `src/app/persist.test.ts`
- Modify: `src/main.tsx`, `src/ui/App.tsx`

**Interfaces:**
- Produces:
  - `requestPersistence(nav?: { storage?: { persist?: () => Promise<boolean> } }): Promise<boolean>` — calls `navigator.storage.persist()` if available; resolves `false` when unavailable.
  - `downloadJson(filename: string, data: unknown): void` — triggers a browser download (guarded for non-DOM env).

- [ ] **Step 1: Write the failing test**

`src/app/persist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { requestPersistence } from './persist';

describe('requestPersistence', () => {
  it('returns the result of navigator.storage.persist()', async () => {
    expect(await requestPersistence({ storage: { persist: async () => true } })).toBe(true);
  });
  it('returns false when unavailable', async () => {
    expect(await requestPersistence({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/persist`
Expected: FAIL ("Cannot find module './persist'").

- [ ] **Step 3: Implement persist helpers**

`src/app/persist.ts`:

```ts
export async function requestPersistence(
  nav: { storage?: { persist?: () => Promise<boolean> } } =
    (typeof navigator !== 'undefined' ? navigator : {}) as Navigator,
): Promise<boolean> {
  try {
    if (nav.storage?.persist) return await nav.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Wire persistence on boot + an Export button**

In `src/main.tsx`, request persistence before rendering (add after imports, before `createRoot`):

```tsx
import { requestPersistence } from './app/persist';
void requestPersistence();
```

In `src/ui/App.tsx`, add these imports:

```tsx
import { exportNovel } from '../app/export';
import { downloadJson } from '../app/persist';
```

And add an Export button next to the Undo button in the agent panel (inside the same `.row` that holds Undo):

```tsx
          <button className="ghost" disabled={!!busy} onClick={() => guard('Exporting…', async () => {
            const data = await exportNovel(store.db);
            downloadJson(`${book.title.replace(/\s+/g, '-').toLowerCase()}.json`, data);
            say('Exported novel JSON.');
          })}>Export</button>
```

- [ ] **Step 5: Build gate + commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: ALL PASS, clean, build succeeds.

```bash
git add src/app/persist.ts src/app/persist.test.ts src/main.tsx src/ui/App.tsx
git commit -m "feat(app): storage persistence on boot and novel export button"
```

---

## Self-Review

- **Spec coverage (§6 failure policy, §4.3 durability/export):** transport retry + timeout with backoff, non-retryable 4xx pass-through ✓ (T1); versioned whole-novel export (backup story) ✓ (T2); `navigator.storage.persist()` on boot + export download ✓ (T3). **Deferred (documented):** import/restore from JSON (export is the M0 backup; import is a fast-follow), context-length-exceeded auto-repack (needs live-endpoint signal), tokenizer code-split to shrink the bundle (build warning only, not blocking).
- **Placeholder scan:** none.
- **Type consistency:** `createTransport` keeps its Plan 4 signature (additive `deps`); `NovelExport`/`exportNovel`, `requestPersistence`/`downloadJson` are self-contained; UI edits reuse existing `guard`/`say`/`store`/`book`.
