# M0 Plan 6 (Rolling Narrative Memory) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the narrative-memory axis: compose prior chapter synopses + preceding scene synopses into a rolling context string for prose drafting, and summarize a scene's prose back into its synopsis — so the agent "remembers what happened."

**Architecture:** A pure `buildNarrativeMemory` composes memory **fresh from live synopses** on each call (no cached rollups → no staleness cascade to manage in M0; the dirty-flag cascade in the design is a future caching optimization, explicitly deferred). `summarizeScene` is an LLM step that writes `scene.synopsis` from prose via the dispatcher. `AppStore.draft` is extended to feed narrative memory + bible retrieval into the prose context.

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit.
- `buildNarrativeMemory` is pure. `summarizeScene` mutates only through the dispatcher (`actor:'gen'`).
- No schema changes; memory is composed on demand from current synopses.
- Conventional-commit messages exactly as specified.

---

### Task 1: buildNarrativeMemory (pure)

**Files:**
- Create: `src/core/memory/narrative.ts`, `src/core/memory/narrative.test.ts`

**Interfaces:**
- Consumes: `Chapter`, `Scene`.
- Produces:
  - `buildNarrativeMemory(input: { orderedChapters: Chapter[]; scenesByChapter: Record<string, Scene[]>; targetSceneId: string; precedingScenes?: number }): string`
  - Chapters before the target scene's chapter contribute their synopsis; within the target chapter, up to `precedingScenes` (default 2) scenes immediately before the target contribute their synopses. Returns '' if the target isn't found.

- [ ] **Step 1: Write the failing test**

`src/core/memory/narrative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNarrativeMemory } from './narrative';
import { createChapter, createScene } from '../model/entities';

describe('buildNarrativeMemory', () => {
  const ch1 = createChapter({ bookId: 'b', title: 'One', synopsis: 'Bob finds a body.' });
  const ch2 = createChapter({ bookId: 'b', title: 'Two', synopsis: 'Bob visits the widow.' });
  const a = createScene({ chapterId: ch1.id, title: 'A', synopsis: 'Discovery at the docks.' });
  const b = createScene({ chapterId: ch1.id, title: 'B', synopsis: 'The coroner arrives.' });
  const c = createScene({ chapterId: ch2.id, title: 'C', synopsis: 'The parlor.' });
  const scenesByChapter = { [ch1.id]: [a, b], [ch2.id]: [c] };

  it('includes earlier chapter synopses for a scene in a later chapter', () => {
    const mem = buildNarrativeMemory({ orderedChapters: [ch1, ch2], scenesByChapter, targetSceneId: c.id });
    expect(mem).toContain('Bob finds a body.');   // ch1 synopsis
    expect(mem).not.toContain('The parlor.');      // the target scene itself excluded
  });

  it('includes preceding scenes within the same chapter', () => {
    const mem = buildNarrativeMemory({ orderedChapters: [ch1, ch2], scenesByChapter, targetSceneId: b.id });
    expect(mem).toContain('Discovery at the docks.'); // scene A precedes B
    expect(mem).not.toContain('The coroner arrives.'); // B itself excluded
  });

  it('returns empty string when the target is unknown', () => {
    expect(buildNarrativeMemory({ orderedChapters: [ch1], scenesByChapter, targetSceneId: 'nope' })).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- memory/narrative`
Expected: FAIL ("Cannot find module './narrative'").

- [ ] **Step 3: Implement**

`src/core/memory/narrative.ts`:

```ts
import type { Chapter, Scene } from '../model/entities';

export function buildNarrativeMemory(input: {
  orderedChapters: Chapter[];
  scenesByChapter: Record<string, Scene[]>;
  targetSceneId: string;
  precedingScenes?: number;
}): string {
  const { orderedChapters, scenesByChapter, targetSceneId, precedingScenes = 2 } = input;

  let targetChIdx = -1;
  let targetScIdx = -1;
  orderedChapters.forEach((ch, ci) => {
    const scenes = scenesByChapter[ch.id] ?? [];
    const si = scenes.findIndex(s => s.id === targetSceneId);
    if (si >= 0) { targetChIdx = ci; targetScIdx = si; }
  });
  if (targetChIdx < 0) return '';

  const parts: string[] = [];
  orderedChapters.forEach((ch, ci) => {
    if (ci < targetChIdx) {
      if (ch.synopsis) parts.push(`Chapter "${ch.title}": ${ch.synopsis}`);
    } else if (ci === targetChIdx) {
      const scenes = scenesByChapter[ch.id] ?? [];
      const start = Math.max(0, targetScIdx - precedingScenes);
      for (let i = start; i < targetScIdx; i++) {
        const s = scenes[i]!;
        if (s.synopsis) parts.push(`Scene "${s.title}": ${s.synopsis}`);
      }
    }
  });
  return parts.join('\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- memory/narrative && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory/narrative.ts src/core/memory/narrative.test.ts
git commit -m "feat(memory): rolling narrative memory composition"
```

---

### Task 2: summarizeScene (prose → synopsis)

**Files:**
- Create: `src/core/generate/summarize.ts`, `src/core/generate/summarize.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `getEntity`, `dispatch`, `newTurnId`, `Scene`, `PlotBunniDB`.
- Produces: `summarizeScene(db: PlotBunniDB, opts: { transport: ChatTransport; system: string; sceneId: string }): Promise<string>` — free-text summary of the scene's prose, written to `scene.synopsis` via the dispatcher; returns the synopsis.

- [ ] **Step 1: Write the failing test**

`src/core/generate/summarize.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { openPlotBunniDB } from '../db/open';
import { putEntity, getEntity } from '../db/stores';
import { createScene, type Scene } from '../model/entities';
import { summarizeScene } from './summarize';

const NAME = 'TestDB_summarize';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('summarizeScene', () => {
  it('writes a synopsis from the prose', async () => {
    const db = await openPlotBunniDB(NAME);
    const scene = createScene({ chapterId: 'ch', title: 'Arrival', content: 'Bob stepped into the rain and found the body.' });
    await putEntity(db, 'scenes', scene);

    const transport = async () => 'Bob discovers a body in the rain.';
    const synopsis = await summarizeScene(db, { transport, system: 's', sceneId: scene.id });

    expect(synopsis).toBe('Bob discovers a body in the rain.');
    expect((await getEntity<Scene>(db, 'scenes', scene.id))!.synopsis).toBe('Bob discovers a body in the rain.');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate/summarize`
Expected: FAIL ("Cannot find module './summarize'").

- [ ] **Step 3: Implement**

`src/core/generate/summarize.ts`:

```ts
import type { PlotBunniDB } from '../db/open';
import { getEntity } from '../db/stores';
import type { Scene } from '../model/entities';
import { dispatch, newTurnId } from '../ops/dispatcher';
import type { ChatTransport } from './transport';

export async function summarizeScene(
  db: PlotBunniDB,
  opts: { transport: ChatTransport; system: string; sceneId: string },
): Promise<string> {
  const scene = await getEntity<Scene>(db, 'scenes', opts.sceneId);
  if (!scene) throw new Error(`scene ${opts.sceneId} not found`);

  const raw = await opts.transport([
    { role: 'system', content: opts.system },
    { role: 'user', content: `Summarize this scene in 1-2 sentences for continuity notes. Return the summary only.\n\n${scene.content}` },
  ]);
  const synopsis = raw.trim();

  const turnId = newTurnId();
  await dispatch(db, [{
    type: 'update', store: 'scenes', entityId: scene.id,
    expectedVersion: scene.version, actor: 'gen', turnId, patch: { synopsis },
  }], { actor: 'gen', turnId });
  return synopsis;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- generate/summarize && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate/summarize.ts src/core/generate/summarize.test.ts
git commit -m "feat(generate): summarize scene prose into synopsis"
```

---

### Task 3: Wire narrative memory + summarize into AppStore

**Files:**
- Modify: `src/app/store.ts`
- Create: `src/app/memory.test.ts`

**Interfaces:**
- Consumes: `buildNarrativeMemory`, `summarizeScene`.
- Produces (on `AppStore`):
  - `async summarize(transport: ChatTransport, system: string, sceneId: string): Promise<string>`
  - `draft(...)` extended so the prose `context` includes **narrative memory first, then bible retrieval** (separated by `---`).

- [ ] **Step 1: Write the failing test**

`src/app/memory.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { AppStore } from './store';
import type { ChatTransport, ChatMessage } from '../core/generate/transport';

const NAME = 'TestDB_appmemory';
afterEach(() => indexedDB.deleteDatabase(NAME));

describe('AppStore narrative memory', () => {
  it('feeds prior-scene synopsis into the prose draft context', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();

    const ingestT: ChatTransport = async () => JSON.stringify({
      entities: [], chapters: [{ title: 'One', synopsis: 'The setup.' }],
    });
    await s.ingest(ingestT, 'sys', book.id, 'dump');
    const chapter = (await s.chapters(book.id))[0]!;

    const sceneT: ChatTransport = async () => JSON.stringify({
      scenes: [{ title: 'A', synopsis: 'Bob arrives at the docks.' }, { title: 'B', synopsis: 'Bob meets the coroner.' }],
    });
    await s.elaborate(sceneT, 'sys', chapter.id, chapter.synopsis);
    const scenes = await s.scenes(chapter.id);
    const sceneB = scenes[1]!;

    let captured: ChatMessage[] = [];
    const proseT: ChatTransport = async (msgs) => { captured = msgs; return 'prose'; };
    await s.draft(proseT, 'sys', sceneB.id);

    const userMsg = captured.find(m => m.role === 'user')!.content;
    expect(userMsg).toContain('Bob arrives at the docks.'); // scene A's synopsis = narrative memory
    s.db.close();
  });

  it('summarize writes the synopsis', async () => {
    const s = await AppStore.open(NAME);
    const book = await s.ensureBook();
    await s.ingest(async () => JSON.stringify({ entities: [], chapters: [{ title: 'One', synopsis: 'x' }] }), 'sys', book.id, 'd');
    const chapter = (await s.chapters(book.id))[0]!;
    await s.elaborate(async () => JSON.stringify({ scenes: [{ title: 'A', synopsis: 'old' }] }), 'sys', chapter.id, 'x');
    const scene = (await s.scenes(chapter.id))[0]!;

    const out = await s.summarize(async () => 'a fresh summary', 'sys', scene.id);
    expect(out).toBe('a fresh summary');
    expect((await s.scenes(chapter.id))[0]!.synopsis).toBe('a fresh summary');
    s.db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/memory`
Expected: FAIL (`summarize` missing; narrative memory not in context).

- [ ] **Step 3: Implement (edit AppStore)**

Add imports at the top of `src/app/store.ts`:

```ts
import { buildNarrativeMemory } from '../core/memory/narrative';
import { summarizeScene } from '../core/generate/summarize';
import type { Chapter } from '../core/model/entities';
```

Replace the existing `draft(...)` method body with this version (builds narrative memory + bible retrieval):

```ts
  async draft(transport: ChatTransport, system: string, sceneId: string): Promise<ProseSuggestion> {
    const scene = await getEntity<Scene>(this.db, 'scenes', sceneId);
    if (!scene) throw new Error(`scene ${sceneId} not found`);
    const chapter = await getEntity<Chapter>(this.db, 'chapters', scene.chapterId);

    let narrative = '';
    if (chapter) {
      const chapters = await this.chapters(chapter.bookId);
      const scenesByChapter: Record<string, Scene[]> = {};
      for (const ch of chapters) scenesByChapter[ch.id] = await this.scenes(ch.id);
      narrative = buildNarrativeMemory({ orderedChapters: chapters, scenesByChapter, targetSceneId: sceneId });
    }

    const entries = await this.entries();
    const items = retrieve({
      entries, relationships: [], queryText: scene.synopsis,
      linkedEntryIds: scene.linkedEntryIds.map(l => l.entryId),
    });
    const bible = items.map(i => i.content).join('\n\n');
    const context = [narrative, bible].filter(Boolean).join('\n\n---\n\n');

    return draftProse({
      transport, system, sceneId, sceneVersion: scene.version,
      sceneSynopsis: scene.synopsis, context,
    });
  }
```

Add this method to `AppStore`:

```ts
  async summarize(transport: ChatTransport, system: string, sceneId: string): Promise<string> {
    return summarizeScene(this.db, { transport, system, sceneId });
  }
```

- [ ] **Step 4: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, clean (the Plan 5 `app/actions` test still passes — its single-scene draft has empty narrative memory).

- [ ] **Step 5: Commit**

```bash
git add src/app/store.ts src/app/memory.test.ts
git commit -m "feat(app): wire narrative memory and scene summarize into the store"
```

---

## Self-Review

- **Spec coverage (§7 narrative axis):** rolling narrative memory composed from prior chapter + preceding scene synopses ✓ (T1), scene summarization ✓ (T2), wired into prose drafting context alongside bible retrieval ✓ (T3). **Deferred (documented):** the dirty-flag staleness cascade — unnecessary in M0 because memory is composed fresh from live synopses each call (no cache to rot); it becomes relevant only when rollups are cached (post-M0). Chapter/book rollup summaries beyond scene synopses → post-M0.
- **Placeholder scan:** none.
- **Type consistency:** `buildNarrativeMemory` input shape, `summarizeScene(db, {transport, system, sceneId})`, `AppStore.summarize`/`draft` signatures consistent with Plans 4–5.
