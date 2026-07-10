# M0 Plan 8 (Refinements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Author-requested M0 refinements: (1) endpoint **Test** + **list-models** in Settings, (2) editable **novel name & synopsis**, (3) a **debug log** panel showing LLM requests/responses and errors.

**Architecture:** New tested logic — `testConnection`/`listModels` (endpoint helpers), `Book.synopsis` + `AppStore.updateBook`, a `debuglog` store + `loggingTransport` wrapper. UI edits (Settings, App) are typecheck+build gated and runtime-verified.

**Tech Stack:** TypeScript (strict), React, Vitest.

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit; Task 4 also runs `npm run build`.
- No schema-version bump needed: `Book.synopsis` is additive; existing books read it as `''` when absent.
- Conventional-commit messages exactly as specified.

---

### Task 1: Book synopsis + AppStore.updateBook

**Files:**
- Modify: `src/core/model/entities.ts` (add `synopsis` to `Book` + factory), `src/app/store.ts` (add `updateBook`)
- Create: `src/app/book.test.ts`

**Interfaces:**
- `Book` gains `synopsis: string`; `createBook` defaults it to `''`.
- `AppStore.updateBook(bookId: string, patch: { title?: string; synopsis?: string }): Promise<void>` — dispatches a `user` update op.

- [ ] **Step 1: Write the failing test**

`src/app/book.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import { createBook } from '../core/model/entities';

const NAME = 'TestDB_book';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('Book editing', () => {
  it('createBook has an empty synopsis by default', () => {
    expect(createBook({ title: 'X' }).synopsis).toBe('');
  });
  it('updateBook changes title and synopsis', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    await s.updateBook(book.id, { title: 'The Dockside Murder', synopsis: 'A noir mystery.' });
    const again = await s.ensureBook();
    expect(again.title).toBe('The Dockside Murder');
    expect(again.synopsis).toBe('A noir mystery.');
    s.db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/book`
Expected: FAIL (`updateBook` missing / `synopsis` not on Book).

- [ ] **Step 3: Implement**

In `src/core/model/entities.ts`, change the `Book` interface and `createBook`:

```ts
export interface Book extends BaseEntity { title: string; synopsis: string; chapterOrder: EntityId[]; }
```

```ts
export const createBook = (p: { title: string } & Partial<Book>): Book =>
  ({ ...base(), synopsis: '', chapterOrder: [], ...p });
```

In `src/app/store.ts`, add to the `AppStore` class (imports `getEntity`, `Book`, `dispatch`, `newTurnId` are already present from earlier plans):

```ts
  async updateBook(bookId: string, patch: { title?: string; synopsis?: string }): Promise<void> {
    const book = await getEntity<Book>(this.db, 'books', bookId);
    if (!book) throw new Error(`book ${bookId} not found`);
    const turnId = newTurnId();
    await dispatch(this.db, [{
      type: 'update', store: 'books', entityId: bookId,
      expectedVersion: book.version, actor: 'user', turnId, patch,
    }], { actor: 'user', turnId });
  }
```

(If `Book` is not yet imported in `store.ts`, add it to the existing `import ... from '../core/model/entities'` line.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- app/book && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/model/entities.ts src/app/store.ts src/app/book.test.ts
git commit -m "feat(app): editable novel title and synopsis"
```

---

### Task 2: Endpoint test + list-models

**Files:**
- Create: `src/core/generate/endpoint.ts`, `src/core/generate/endpoint.test.ts`

**Interfaces:**
- Consumes: `EndpointProfile`, `createTransport`.
- Produces:
  - `testConnection(profile: EndpointProfile, deps?: { fetch?: typeof fetch }): Promise<{ ok: boolean; error?: string }>`
  - `listModels(profile: EndpointProfile, deps?: { fetch?: typeof fetch }): Promise<string[]>` (GET `${baseUrl}/models`)

- [ ] **Step 1: Write the failing test**

`src/core/generate/endpoint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { testConnection, listModels } from './endpoint';
import type { EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};

describe('endpoint tools', () => {
  it('testConnection reports ok on a good response', async () => {
    const fakeFetch = (async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) } as any)) as unknown as typeof fetch;
    expect(await testConnection(profile, { fetch: fakeFetch })).toEqual({ ok: true });
  });
  it('testConnection reports the error on failure', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 401, json: async () => ({}) } as any)) as unknown as typeof fetch;
    const r = await testConnection(profile, { fetch: fakeFetch });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });
  it('listModels returns model ids from /models', async () => {
    let url = '';
    const fakeFetch = (async (u: any) => { url = u; return { ok: true, json: async () => ({ data: [{ id: 'glm-4.6' }, { id: 'glm-4-air' }] }) } as any; }) as unknown as typeof fetch;
    expect(await listModels(profile, { fetch: fakeFetch })).toEqual(['glm-4.6', 'glm-4-air']);
    expect(url).toBe('https://api.example.com/v1/models');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/endpoint`
Expected: FAIL ("Cannot find module './endpoint'").

- [ ] **Step 3: Implement**

`src/core/generate/endpoint.ts`:

```ts
import { createTransport, type EndpointProfile } from './transport';

export async function testConnection(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: boolean; error?: string }> {
  const transport = createTransport(profile, { fetch: deps.fetch, retries: 0 });
  try {
    await transport([{ role: 'user', content: 'Reply with an empty JSON object {}.' }]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listModels(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): Promise<string[]> {
  const doFetch = deps.fetch ?? fetch;
  const res = await doFetch(`${profile.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${profile.apiKey}` },
  });
  if (!res.ok) throw new Error(`models request returned ${res.status}`);
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? []).map(m => m.id).filter((id): id is string => !!id);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- generate/endpoint && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/endpoint.ts src/core/generate/endpoint.test.ts
git commit -m "feat(generate): endpoint test-connection and list-models"
```

---

### Task 3: Debug log store + logging transport

**Files:**
- Create: `src/app/debuglog.ts`, `src/app/debuglog.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `ChatMessage`.
- Produces:
  - `interface LogEntry { ts: number; kind: string; message: string }`
  - `pushLog(kind: string, message: string): void`, `getLogs(): LogEntry[]`, `clearLogs(): void`, `subscribeLogs(cb: () => void): () => void`
  - `loggingTransport(inner: ChatTransport): ChatTransport` — logs a `req`/`res`/`error` entry around each call.

- [ ] **Step 1: Write the failing test**

`src/app/debuglog.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { pushLog, getLogs, clearLogs, subscribeLogs, loggingTransport } from './debuglog';

beforeEach(() => clearLogs());

describe('debuglog', () => {
  it('records and clears entries, notifying subscribers', () => {
    let fires = 0;
    const unsub = subscribeLogs(() => { fires++; });
    pushLog('info', 'hello');
    expect(getLogs().at(-1)!.message).toBe('hello');
    expect(fires).toBe(1);
    clearLogs();
    expect(getLogs()).toEqual([]);
    unsub();
  });
  it('loggingTransport records req and res', async () => {
    const inner = async () => 'the response';
    const wrapped = loggingTransport(inner);
    expect(await wrapped([{ role: 'user', content: 'hi' }])).toBe('the response');
    const kinds = getLogs().map(l => l.kind);
    expect(kinds).toContain('req');
    expect(kinds).toContain('res');
  });
  it('loggingTransport records and rethrows errors', async () => {
    const inner = async () => { throw new Error('boom'); };
    await expect(loggingTransport(inner)([{ role: 'user', content: 'hi' }])).rejects.toThrow('boom');
    expect(getLogs().some(l => l.kind === 'error' && l.message.includes('boom'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/debuglog`
Expected: FAIL ("Cannot find module './debuglog'").

- [ ] **Step 3: Implement**

`src/app/debuglog.ts`:

```ts
import type { ChatTransport, ChatMessage } from '../core/generate/transport';

export interface LogEntry { ts: number; kind: string; message: string }

const buffer: LogEntry[] = [];
const subscribers = new Set<() => void>();
const MAX = 500;

export function pushLog(kind: string, message: string): void {
  buffer.push({ ts: Date.now(), kind, message });
  if (buffer.length > MAX) buffer.shift();
  subscribers.forEach(cb => cb());
}
export function getLogs(): LogEntry[] { return [...buffer]; }
export function clearLogs(): void { buffer.length = 0; subscribers.forEach(cb => cb()); }
export function subscribeLogs(cb: () => void): () => void {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

export function loggingTransport(inner: ChatTransport): ChatTransport {
  return async (messages: ChatMessage[]) => {
    const last = messages[messages.length - 1]?.content ?? '';
    pushLog('req', `→ ${messages.length} msg(s); last: ${last.slice(0, 100)}`);
    try {
      const out = await inner(messages);
      pushLog('res', `← ${out.length} chars`);
      return out;
    } catch (e) {
      pushLog('error', (e as Error).message);
      throw e;
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- app/debuglog && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/debuglog.ts src/app/debuglog.test.ts
git commit -m "feat(app): debug log store and logging transport"
```

---

### Task 4: UI wiring (Settings test/models, editable book, debug panel)

**Files:**
- Overwrite: `src/ui/Settings.tsx`, `src/ui/App.tsx`
- Modify: `src/index.css` (append)

**Interfaces:** Wires Tasks 1–3 into the UI. Typecheck + build gated; runtime-verified by the reviewer.

- [ ] **Step 1: Append styles**

Append to `src/index.css`:

```css
.field { margin: 8px 0; }
.field label { display: block; font-size: 12px; opacity: .6; margin-bottom: 4px; }
.status.ok { color: #58d68d; } .status.err { color: #ec7063; }
.debug { position: fixed; right: 0; bottom: 0; width: 420px; max-height: 45vh; overflow: auto; background: #0d0d10; border: 1px solid #2c2c32; border-radius: 8px 0 0 0; padding: 8px; font: 12px/1.4 ui-monospace, monospace; z-index: 50; }
.debug .e { padding: 2px 0; border-bottom: 1px solid #1e1e24; }
.debug .k { display: inline-block; width: 44px; opacity: .6; }
select { width: 100%; background: #0f0f12; color: inherit; border: 1px solid #2c2c32; border-radius: 8px; padding: 8px; font: inherit; }
```

- [ ] **Step 2: Overwrite `src/ui/Settings.tsx`**

```tsx
import { useState } from 'react';
import { loadProfile, saveProfile, DEFAULT_PROFILE } from '../app/settings';
import { testConnection, listModels } from '../core/generate/endpoint';
import type { EndpointProfile } from '../core/generate/transport';

export function Settings({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<EndpointProfile>(loadProfile() ?? DEFAULT_PROFILE);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const set = (k: keyof EndpointProfile) => (e: { target: { value: string } }) =>
    setP({ ...p, [k]: k === 'contextLength' || k === 'maxOutput' ? Number(e.target.value) : e.target.value });

  const test = async () => {
    setBusy('test'); setStatus(null);
    const r = await testConnection(p);
    setStatus(r.ok ? { ok: true, text: 'Connection OK' } : { ok: false, text: r.error ?? 'failed' });
    setBusy('');
  };
  const load = async () => {
    setBusy('list'); setStatus(null);
    try { setModels(await listModels(p)); } catch (e) { setStatus({ ok: false, text: (e as Error).message }); }
    setBusy('');
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h2>Endpoint</h2>
      <div className="field"><label>Base URL (…/v1)</label><input value={p.baseUrl} onChange={set('baseUrl')} /></div>
      <div className="field"><label>API key</label><input type="password" value={p.apiKey} onChange={set('apiKey')} /></div>
      <div className="field">
        <label>Model</label>
        {models.length > 0
          ? <select value={p.model} onChange={set('model')}>{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
          : <input placeholder="e.g. glm-4.6" value={p.model} onChange={set('model')} />}
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label>Context length</label><input value={p.contextLength} onChange={set('contextLength')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Max output</label><input value={p.maxOutput} onChange={set('maxOutput')} /></div>
      </div>
      <div className="row">
        <button onClick={() => { saveProfile(p); onClose(); }}>Save</button>
        <button className="ghost" disabled={!!busy} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
        <button className="ghost" disabled={!!busy} onClick={load}>{busy === 'list' ? 'Loading…' : 'List models'}</button>
      </div>
      {status && <p className={`status ${status.ok ? 'ok' : 'err'}`}>{status.text}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Overwrite `src/ui/App.tsx`**

```tsx
import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { AppStore } from '../app/store';
import { loadProfile } from '../app/settings';
import { createTransport } from '../core/generate/transport';
import { composeSystemPrompt } from '../core/ai/composer';
import { BUILTIN_MODULES } from '../core/ai/promptModules';
import { loggingTransport, getLogs, subscribeLogs, clearLogs } from '../app/debuglog';
import { exportNovel } from '../app/export';
import { downloadJson } from '../app/persist';
import type { ProseSuggestion } from '../core/generate/prose';
import type { Book, Chapter, Scene, BibleEntry } from '../core/model/entities';
import { Settings } from './Settings';

const SYSTEM = composeSystemPrompt(BUILTIN_MODULES);

function DebugPanel({ onClose }: { onClose: () => void }) {
  const logs = useSyncExternalStore(subscribeLogs, getLogs);
  return (
    <div className="debug">
      <div className="row" style={{ margin: 0 }}>
        <strong style={{ flex: 1 }}>Debug log</strong>
        <button className="ghost" onClick={() => clearLogs()}>Clear</button>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      {logs.slice(-200).map((l, i) => (
        <div key={i} className="e"><span className="k">{l.kind}</span>{l.message}</div>
      ))}
    </div>
  );
}

export function App() {
  const [store, setStore] = useState<AppStore | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [entries, setEntries] = useState<BibleEntry[]>([]);
  const [scenesByCh, setScenesByCh] = useState<Record<string, Scene[]>>({});
  const [sel, setSel] = useState<{ kind: 'book' | 'chapter' | 'scene'; id: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [monologue, setMonologue] = useState('');
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<ProseSuggestion | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSynopsis, setDraftSynopsis] = useState('');

  const say = (m: string) => setLog(l => [...l, m]);

  const refresh = useCallback(async (s: AppStore) => {
    const b = await s.ensureBook();
    setBook(b); setDraftTitle(b.title); setDraftSynopsis(b.synopsis ?? '');
    const chs = await s.chapters(b.id);
    setChapters(chs);
    const map: Record<string, Scene[]> = {};
    for (const c of chs) map[c.id] = await s.scenes(c.id);
    setScenesByCh(map);
    setEntries(await s.entries());
  }, []);

  useEffect(() => {
    (async () => { const s = await AppStore.open(); await refresh(s); setStore(s); })();
  }, [refresh]);

  const transport = () => {
    const p = loadProfile();
    if (!p || !p.baseUrl || !p.model) { setShowSettings(true); throw new Error('configure endpoint first'); }
    return loggingTransport(createTransport(p));
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { say(`⚠ ${(e as Error).message}`); } finally { setBusy(''); }
  };

  if (showSettings) return <Settings onClose={() => setShowSettings(false)} />;
  if (!store || !book) return <div style={{ padding: 24 }}>Loading…</div>;

  const selChapter = sel?.kind === 'chapter' ? chapters.find(c => c.id === sel.id) : undefined;
  const selScene = sel?.kind === 'scene' ? Object.values(scenesByCh).flat().find(s => s.id === sel.id) : undefined;

  return (
    <div className="app">
      <div className="pane">
        <div className="row"><button className="ghost" onClick={() => setShowSettings(true)}>⚙ Endpoint</button></div>
        <div className={`tree-item ${sel?.kind === 'book' ? 'sel' : ''}`} onClick={() => setSel({ kind: 'book', id: book.id })}><strong>📖 {book.title}</strong></div>
        <h3>Chapters</h3>
        {chapters.map(c => (
          <div key={c.id}>
            <div className={`tree-item ${sel?.id === c.id ? 'sel' : ''}`} onClick={() => setSel({ kind: 'chapter', id: c.id })}>▸ {c.title}</div>
            {(scenesByCh[c.id] ?? []).map(s => (
              <div key={s.id} className={`tree-item scene ${sel?.id === s.id ? 'sel' : ''}`} onClick={() => setSel({ kind: 'scene', id: s.id })}>{s.title}</div>
            ))}
          </div>
        ))}
        <h3>Story Bible</h3>
        {entries.map(e => <div key={e.id} className="tree-item">{e.name} — {e.type}</div>)}
      </div>

      <div className="pane">
        {sel?.kind === 'book' && (
          <div>
            <h2>Novel</h2>
            <div className="field"><label>Title</label><input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} /></div>
            <div className="field"><label>Synopsis</label><textarea rows={6} value={draftSynopsis} onChange={e => setDraftSynopsis(e.target.value)} /></div>
            <button disabled={!!busy} onClick={() => guard('Saving…', async () => {
              await store.updateBook(book.id, { title: draftTitle, synopsis: draftSynopsis });
              await refresh(store); say('Saved novel details.');
            })}>Save</button>
          </div>
        )}
        {!sel && <p style={{ opacity: .6 }}>Select the novel to name it, brain-dump your premise in the agent panel, then elaborate chapters → scenes → prose.</p>}
        {selChapter && (
          <div>
            <h2>{selChapter.title}</h2>
            <p className="prose">{selChapter.synopsis}</p>
            <button disabled={!!busy} onClick={() => guard('Elaborating…', async () => {
              await store.elaborate(transport(), SYSTEM, selChapter.id, selChapter.synopsis);
              await refresh(store); say(`Elaborated scenes for “${selChapter.title}”.`);
            })}>{busy || 'Elaborate scenes'}</button>
          </div>
        )}
        {selScene && (
          <div>
            <h2>{selScene.title}</h2>
            <p className="prose" style={{ opacity: .7 }}>{selScene.synopsis}</p>
            <div className="prose">{selScene.content || <em style={{ opacity: .5 }}>No prose yet.</em>}</div>
            <div className="row">
              <button disabled={!!busy} onClick={() => guard('Drafting…', async () => {
                const sug = await store.draft(transport(), SYSTEM, selScene.id);
                setSuggestion(sug); say('Drafted prose — review below.');
              })}>{busy || 'Draft prose'}</button>
            </div>
            {suggestion && suggestion.sceneId === selScene.id && (
              <div className="suggestion">
                <div className="prose">{suggestion.text}</div>
                <div className="row">
                  <button onClick={() => guard('Applying…', async () => {
                    await store.accept(suggestion); setSuggestion(null); await refresh(store); say('Prose accepted.');
                  })}>Accept</button>
                  <button className="ghost" onClick={() => setSuggestion(null)}>Reject</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pane agent">
        <div className="row" style={{ margin: 0 }}>
          <h3 style={{ flex: 1, margin: 0 }}>Agent</h3>
          <button className="ghost" onClick={() => setShowDebug(v => !v)}>Debug</button>
        </div>
        <textarea rows={5} placeholder="Brain-dump your story premise…" value={monologue} onChange={e => setMonologue(e.target.value)} />
        <div className="row">
          <button disabled={!!busy} onClick={() => guard('Ingesting…', async () => {
            const r = await store.ingest(transport(), SYSTEM, book.id, monologue);
            setMonologue(''); await refresh(store); say(`Created ${r.entities} entities, ${r.chapters} chapters.`);
          })}>{busy || 'Ingest brain-dump'}</button>
          <button className="ghost" disabled={!!busy} onClick={() => guard('Undoing…', async () => {
            await store.undoLast(); await refresh(store); say('Undid last change.');
          })}>Undo</button>
          <button className="ghost" disabled={!!busy} onClick={() => guard('Exporting…', async () => {
            downloadJson(`${book.title.replace(/\s+/g, '-').toLowerCase()}.json`, await exportNovel(store.db));
            say('Exported novel JSON.');
          })}>Export</button>
        </div>
        {log.map((m, i) => <div key={i} className="msg">{m}</div>)}
      </div>

      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Build gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: ALL PASS, clean, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Settings.tsx src/ui/App.tsx src/index.css
git commit -m "feat(ui): endpoint test/list-models, editable novel details, debug panel"
```

---

## Self-Review

- **Coverage:** endpoint Test + list-models with model dropdown ✓ (T2/T4); editable novel title + synopsis ✓ (T1/T4); debug panel showing req/res/error logs ✓ (T3/T4). `Book.synopsis` additive (no migration). Logging wraps the transport so every LLM call is visible.
- **Placeholder scan:** none.
- **Type consistency:** `updateBook`, `testConnection`/`listModels`, `loggingTransport`/`getLogs`/`subscribeLogs`/`clearLogs`, `Book.synopsis` used consistently; `useSyncExternalStore(subscribeLogs, getLogs)` binds the debug view.
