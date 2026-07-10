# M0 Plan 4 (Ladder Generation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire AI generation into the story graph: an OpenAI-compatible client with structured-output + repair loop, and the three core ladder steps — ingest a brain-dump, elaborate a chapter's scenes, and draft scene prose — each single-shot, schema-validated, and applied through the op-dispatcher (prose staged for accept; scaffolding auto-applied).

**Architecture:** `src/core/generate/`. The LLM is reached through an injectable **`ChatTransport`** (so every generation function is testable with a fake transport — no network in tests). Structured steps validate with **Zod** and repair once on invalid JSON. Prose is free text (not JSON) and returns a **staged suggestion** the caller accepts. Generation functions map results to `create`/`update` ops and call `dispatch(...)` (Plan 1) with `actor: 'gen'`. Consumes entity factories (Plan 1), `dispatch`/`newTurnId` (Plan 1).

**Tech Stack:** TypeScript (strict), Vitest, Zod.

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit.
- No real network in tests — inject a fake `ChatTransport`; the DB is `fake-indexeddb` via the existing setup.
- All mutations go through `dispatch(...)` with `actor: 'gen'`. Structured steps auto-apply; **prose is returned as a suggestion and only applied by `acceptProse`.**
- Reference model is GLM 4+ (capable structured output); the client uses `response_format: { type: 'json_object' }`.
- Retry/timeout on the HTTP transport is deferred to Plan 7 (Hardening) — keep the transport minimal here.
- Conventional-commit messages exactly as specified.

---

### Task 1: Endpoint profile + HTTP transport

**Files:**
- Create: `src/core/generate/transport.ts`, `src/core/generate/transport.test.ts`
- Modify: `package.json` (add `zod`)

**Interfaces:**
- Produces:
  - `interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }`
  - `type ChatTransport = (messages: ChatMessage[]) => Promise<string>` (returns assistant message content)
  - `interface EndpointProfile { baseUrl: string; apiKey: string; model: string; contextLength: number; maxOutput: number }`
  - `createTransport(profile: EndpointProfile, deps?: { fetch?: typeof fetch }): ChatTransport`

- [ ] **Step 1: Install zod**

Run: `npm install zod`

- [ ] **Step 2: Write the failing test**

`src/core/generate/transport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTransport, type EndpointProfile } from './transport';

const profile: EndpointProfile = {
  baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'glm-4', contextLength: 32000, maxOutput: 2000,
};

describe('createTransport', () => {
  it('POSTs to /chat/completions with auth and returns the message content', async () => {
    let seen: { url: string; body: any; auth: string } | null = null;
    const fakeFetch = (async (url: any, init: any) => {
      seen = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) } as any;
    }) as unknown as typeof fetch;

    const transport = createTransport(profile, { fetch: fakeFetch });
    const out = await transport([{ role: 'user', content: 'hi' }]);

    expect(out).toBe('{"ok":true}');
    expect(seen!.url).toBe('https://api.example.com/v1/chat/completions');
    expect(seen!.auth).toBe('Bearer sk-test');
    expect(seen!.body.model).toBe('glm-4');
    expect(seen!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) } as any)) as unknown as typeof fetch;
    const transport = createTransport(profile, { fetch: fakeFetch });
    await expect(transport([{ role: 'user', content: 'hi' }])).rejects.toThrow('500');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- generate/transport`
Expected: FAIL ("Cannot find module './transport'").

- [ ] **Step 4: Implement**

`src/core/generate/transport.ts`:

```ts
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatTransport = (messages: ChatMessage[]) => Promise<string>;

export interface EndpointProfile {
  baseUrl: string; apiKey: string; model: string; contextLength: number; maxOutput: number;
}

export function createTransport(
  profile: EndpointProfile, deps: { fetch?: typeof fetch } = {},
): ChatTransport {
  const doFetch = deps.fetch ?? fetch;
  return async (messages) => {
    const res = await doFetch(`${profile.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${profile.apiKey}` },
      body: JSON.stringify({
        model: profile.model,
        messages,
        max_tokens: profile.maxOutput,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`endpoint returned ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- generate/transport && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/generate/transport.ts src/core/generate/transport.test.ts
git commit -m "feat(generate): endpoint profile and OpenAI-compatible transport"
```

---

### Task 2: generateStructured (validate + repair)

**Files:**
- Create: `src/core/generate/structured.ts`, `src/core/generate/structured.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `ChatMessage`; `zod`.
- Produces: `generateStructured<T>(input: { transport: ChatTransport; system: string; user: string; schema: ZodType<T>; maxRepairs?: number }): Promise<T>` — extracts the first JSON object from the reply, validates with the Zod schema, and on failure re-prompts once (default `maxRepairs: 1`) before throwing.

- [ ] **Step 1: Write the failing test**

`src/core/generate/structured.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateStructured } from './structured';
import type { ChatMessage } from './transport';

const schema = z.object({ name: z.string() });

describe('generateStructured', () => {
  it('parses valid JSON on the first try', async () => {
    const transport = async (_m: ChatMessage[]) => '{"name":"Bob"}';
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Bob' });
  });

  it('extracts JSON embedded in prose', async () => {
    const transport = async () => 'Sure! Here you go: {"name":"Vivian"} — hope that helps';
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Vivian' });
  });

  it('repairs once after an invalid reply', async () => {
    let call = 0;
    const transport = async (_m: ChatMessage[]) => (call++ === 0 ? 'not json at all' : '{"name":"Bob"}');
    expect(await generateStructured({ transport, system: 's', user: 'u', schema })).toEqual({ name: 'Bob' });
    expect(call).toBe(2);
  });

  it('throws after exhausting repairs', async () => {
    const transport = async () => 'never valid';
    await expect(generateStructured({ transport, system: 's', user: 'u', schema, maxRepairs: 1 }))
      .rejects.toThrow(/failed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/structured`
Expected: FAIL ("Cannot find module './structured'").

- [ ] **Step 3: Implement**

`src/core/generate/structured.ts`:

```ts
import type { ZodType } from 'zod';
import type { ChatTransport, ChatMessage } from './transport';

function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  try { return JSON.parse(slice); } catch { return null; }
}

export async function generateStructured<T>(input: {
  transport: ChatTransport;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxRepairs?: number;
}): Promise<T> {
  const maxRepairs = input.maxRepairs ?? 1;
  const base: ChatMessage[] = [
    { role: 'system', content: input.system },
    { role: 'user', content: input.user },
  ];
  let lastErr = 'no response';
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const messages = attempt === 0
      ? base
      : [...base, { role: 'user' as const, content:
          `Your previous reply was not valid JSON for the required schema (${lastErr}). Reply with ONLY the JSON object.` }];
    const raw = await input.transport(messages);
    const parsed = input.schema.safeParse(extractJson(raw));
    if (parsed.success) return parsed.data;
    lastErr = parsed.error.message.slice(0, 200);
  }
  throw new Error(`generateStructured failed after ${maxRepairs} repair(s): ${lastErr}`);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- generate/structured && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/structured.ts src/core/generate/structured.test.ts
git commit -m "feat(generate): structured output with repair loop"
```

---

### Task 3: Ingest brain-dump → entities + chapters

**Files:**
- Create: `src/core/generate/ingest.ts`, `src/core/generate/ingest.test.ts`

**Interfaces:**
- Consumes: `generateStructured`, `ChatTransport`, `createBibleEntry`, `createChapter`, `dispatch`, `newTurnId`, `Op`, `PlotBunniDB`; `zod`.
- Produces:
  - `ingestSchema` (Zod)
  - `ingestBrainDump(db: PlotBunniDB, opts: { transport: ChatTransport; system: string; bookId: string; monologue: string }): Promise<{ entities: number; chapters: number }>` — one structured call → create ops for entities + chapters (chapters carry `bookId`) → dispatched as one `gen` turn.

- [ ] **Step 1: Write the failing test**

`src/core/generate/ingest.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { ingestBrainDump } from './ingest';
import type { BibleEntry, Chapter } from '../model/entities';

const NAME = 'TestDB_ingest';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('ingestBrainDump', () => {
  it('creates entities and chapters from one structured reply', async () => {
    const db = await openPlotBunniDB(NAME);
    const transport = async () => JSON.stringify({
      entities: [{ type: 'character', name: 'Bob', summary: 'A detective.' }],
      chapters: [{ title: 'The Body', synopsis: 'Bob finds a corpse.' }],
    });
    const res = await ingestBrainDump(db, { transport, system: 's', bookId: 'book-1', monologue: 'noir story' });
    expect(res).toEqual({ entities: 1, chapters: 1 });

    const entries = await getAllEntities<BibleEntry>(db, 'bibleEntries');
    const chapters = await getAllEntities<Chapter>(db, 'chapters');
    expect(entries.map(e => e.name)).toEqual(['Bob']);
    expect(chapters[0]!.bookId).toBe('book-1');
    expect(chapters[0]!.title).toBe('The Body');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/ingest`
Expected: FAIL ("Cannot find module './ingest'").

- [ ] **Step 3: Implement**

`src/core/generate/ingest.ts`:

```ts
import { z } from 'zod';
import type { PlotBunniDB } from '../db/open';
import { createBibleEntry, createChapter } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { Op } from '../ops/types';
import { generateStructured } from './structured';
import type { ChatTransport } from './transport';

export const ingestSchema = z.object({
  entities: z.array(z.object({
    type: z.string(), name: z.string(), summary: z.string().default(''),
  })),
  chapters: z.array(z.object({
    title: z.string(), synopsis: z.string().default(''),
  })),
});

export async function ingestBrainDump(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; bookId: string; monologue: string },
): Promise<{ entities: number; chapters: number }> {
  const result = await generateStructured({
    transport: opts.transport,
    system: opts.system,
    user: `Extract the story entities (characters, locations, items, arcs) and a chapter outline from this brain-dump. Reply as JSON {entities:[{type,name,summary}], chapters:[{title,synopsis}]}.\n\n${opts.monologue}`,
    schema: ingestSchema,
  });

  const turnId = newTurnId();
  const ops: Op[] = [];
  for (const e of result.entities) {
    const be = createBibleEntry({ type: e.type, name: e.name, summary: e.summary });
    ops.push({ type: 'create', store: 'bibleEntries', entityId: be.id, expectedVersion: null, actor: 'gen', turnId, entity: be });
  }
  for (const c of result.chapters) {
    const ch = createChapter({ bookId: opts.bookId, title: c.title, synopsis: c.synopsis });
    ops.push({ type: 'create', store: 'chapters', entityId: ch.id, expectedVersion: null, actor: 'gen', turnId, entity: ch });
  }
  await dispatch(db, ops, { actor: 'gen', turnId });
  return { entities: result.entities.length, chapters: result.chapters.length };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- generate/ingest && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/ingest.ts src/core/generate/ingest.test.ts
git commit -m "feat(generate): brain-dump ingestion to entities and chapters"
```

---

### Task 4: Elaborate scenes for a chapter

**Files:**
- Create: `src/core/generate/scenes.ts`, `src/core/generate/scenes.test.ts`

**Interfaces:**
- Consumes: `generateStructured`, `ChatTransport`, `createScene`, `dispatch`, `newTurnId`, `Op`, `PlotBunniDB`; `zod`.
- Produces:
  - `scenesSchema` (Zod)
  - `elaborateScenes(db: PlotBunniDB, opts: { transport: ChatTransport; system: string; chapterId: string; chapterSynopsis: string }): Promise<number>` — one structured call → create Scene ops under `chapterId` → dispatched as one `gen` turn; returns the scene count.

- [ ] **Step 1: Write the failing test**

`src/core/generate/scenes.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { getAllEntities } from '../db/stores';
import { elaborateScenes } from './scenes';
import type { Scene } from '../model/entities';

const NAME = 'TestDB_scenes';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('elaborateScenes', () => {
  it('creates scenes under the chapter from one structured reply', async () => {
    const db = await openPlotBunniDB(NAME);
    const transport = async () => JSON.stringify({
      scenes: [
        { title: 'Arrival', synopsis: 'Bob arrives in the rain.' },
        { title: 'The parlor', synopsis: 'Vivian deflects.' },
      ],
    });
    const n = await elaborateScenes(db, { transport, system: 's', chapterId: 'ch-1', chapterSynopsis: 'Bob visits the widow.' });
    expect(n).toBe(2);
    const scenes = await getAllEntities<Scene>(db, 'scenes');
    expect(scenes.map(s => s.title)).toEqual(['Arrival', 'The parlor']);
    expect(scenes.every(s => s.chapterId === 'ch-1')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/scenes`
Expected: FAIL ("Cannot find module './scenes'").

- [ ] **Step 3: Implement**

`src/core/generate/scenes.ts`:

```ts
import { z } from 'zod';
import type { PlotBunniDB } from '../db/open';
import { createScene } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { Op } from '../ops/types';
import { generateStructured } from './structured';
import type { ChatTransport } from './transport';

export const scenesSchema = z.object({
  scenes: z.array(z.object({ title: z.string(), synopsis: z.string().default('') })),
});

export async function elaborateScenes(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; chapterId: string; chapterSynopsis: string },
): Promise<number> {
  const result = await generateStructured({
    transport: opts.transport,
    system: opts.system,
    user: `Break this chapter into an ordered list of scenes. Reply as JSON {scenes:[{title,synopsis}]}.\n\nChapter: ${opts.chapterSynopsis}`,
    schema: scenesSchema,
  });

  const turnId = newTurnId();
  const ops: Op[] = result.scenes.map(s => {
    const sc = createScene({ chapterId: opts.chapterId, title: s.title, synopsis: s.synopsis });
    return { type: 'create', store: 'scenes', entityId: sc.id, expectedVersion: null, actor: 'gen', turnId, entity: sc };
  });
  await dispatch(db, ops, { actor: 'gen', turnId });
  return result.scenes.length;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- generate/scenes && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/scenes.ts src/core/generate/scenes.test.ts
git commit -m "feat(generate): scene elaboration for a chapter"
```

---

### Task 5: Draft prose (staged) + accept

**Files:**
- Create: `src/core/generate/prose.ts`, `src/core/generate/prose.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `dispatch`, `newTurnId`, `PlotBunniDB`, `getEntity`.
- Produces:
  - `interface ProseSuggestion { sceneId: string; expectedVersion: number; text: string }`
  - `draftProse(opts: { transport: ChatTransport; system: string; sceneId: string; sceneVersion: number; sceneSynopsis: string; context: string }): Promise<ProseSuggestion>` — free-text (NOT JSON); returns a suggestion and mutates nothing.
  - `acceptProse(db: PlotBunniDB, s: ProseSuggestion): Promise<void>` — dispatches an `update` op setting `scene.content = s.text` (respecting `expectedVersion`).

- [ ] **Step 1: Write the failing test**

`src/core/generate/prose.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { putEntity, getEntity } from '../db/stores';
import { createScene, type Scene } from '../model/entities';
import { draftProse, acceptProse } from './prose';

const NAME = 'TestDB_prose';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('draftProse / acceptProse', () => {
  it('drafts free text without mutating, then applies on accept', async () => {
    const db = await openPlotBunniDB(NAME);
    const scene = createScene({ chapterId: 'ch-1', title: 'Arrival' }); // version 1
    await putEntity(db, 'scenes', scene);

    const transport = async () => 'Bob stepped into the rain.';
    const suggestion = await draftProse({
      transport, system: 's', sceneId: scene.id, sceneVersion: scene.version,
      sceneSynopsis: 'Bob arrives', context: 'noir',
    });
    expect(suggestion.text).toBe('Bob stepped into the rain.');
    // not applied yet
    expect((await getEntity<Scene>(db, 'scenes', scene.id))!.content).toBe('');

    await acceptProse(db, suggestion);
    const after = (await getEntity<Scene>(db, 'scenes', scene.id))!;
    expect(after.content).toBe('Bob stepped into the rain.');
    expect(after.version).toBe(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/prose`
Expected: FAIL ("Cannot find module './prose'").

- [ ] **Step 3: Implement**

`src/core/generate/prose.ts`:

```ts
import type { PlotBunniDB } from '../db/open';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { ChatTransport } from './transport';

export interface ProseSuggestion { sceneId: string; expectedVersion: number; text: string }

export async function draftProse(opts: {
  transport: ChatTransport;
  system: string;
  sceneId: string;
  sceneVersion: number;
  sceneSynopsis: string;
  context: string;
}): Promise<ProseSuggestion> {
  const text = await opts.transport([
    { role: 'system', content: opts.system },
    { role: 'user', content:
      `Write the full prose for this scene. Return prose only, no preamble.\n\nOutline: ${opts.sceneSynopsis}\n\nContext:\n${opts.context}` },
  ]);
  return { sceneId: opts.sceneId, expectedVersion: opts.sceneVersion, text: text.trim() };
}

export async function acceptProse(db: PlotBunniDB, s: ProseSuggestion): Promise<void> {
  const turnId = newTurnId();
  await dispatch(db, [{
    type: 'update', store: 'scenes', entityId: s.sceneId,
    expectedVersion: s.expectedVersion, actor: 'gen', turnId, patch: { content: s.text },
  }], { actor: 'gen', turnId });
}
```

- [ ] **Step 4: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/prose.ts src/core/generate/prose.test.ts
git commit -m "feat(generate): staged prose drafting with accept"
```

---

## Self-Review

- **Spec coverage (§6 of the design):** injectable transport + structured-output contract ✓ (T1/T2), repair loop ✓ (T2), single-shot per ladder step ✓ (T3/T4/T5), transactional apply via dispatcher with `actor:'gen'` ✓ (T3/T4/T5), split-apply — scaffolding auto-applies, **prose staged and only applied by `acceptProse`** ✓ (T5). Deferred (documented): HTTP retry/timeout (Plan 7); `splitChapters` ladder step (structurally identical to `elaborateScenes`, add when the UI needs it); passive-retrieval wiring into these prompts (Plan 5 supplies `context` from Plan 3's `retrieve`).
- **Placeholder scan:** none.
- **Type consistency:** `ChatTransport`/`ChatMessage`/`EndpointProfile` (T1), `generateStructured` (T2), create-`Op` construction `{type:'create', store, entityId, expectedVersion:null, actor:'gen', turnId, entity}` matches Plan 1's `CreateOp`; `ProseSuggestion` update-op matches `UpdateOp`. `dispatch(db, ops, {actor,turnId})` and `newTurnId()` used consistently.
