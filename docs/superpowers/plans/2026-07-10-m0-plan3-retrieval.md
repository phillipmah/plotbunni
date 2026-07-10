# M0 Plan 3 (Passive Retrieval Pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the passive worldbook-retrieval pipeline: given the Story Bible (entries + relationships) and a query context, select the relevant entries, rank them, render them at a chosen view, and emit `PackItem`s the context packer can budget — locking quality with a golden eval.

**Architecture:** Pure functions under `src/core/retrieval/`. Retrieval is a **pure function of (provided entries, provided relationships, query)** — it never reads IndexedDB and never writes anything (v1's retrieval mutated state during prompt-building; forbidden). One word-boundary key matcher (v1 had two inconsistent matchers). Candidate sources — linked ∪ always-on ∪ keyword ∪ 1-hop graph — are merged, ranked, and rendered. Consumes `BibleEntry`/`Relationship` (Plan 1), `countTokens` and `PackItem` (Plan 2).

**Tech Stack:** TypeScript (strict), Vitest.

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit.
- Pure functions only — no IndexedDB, no fetch, no React. Entities/relationships are passed in.
- One key matcher: word-boundary, case-configurable. Never substring.
- Retrieval returns `PackItem`s (from Plan 2) so the packer can drop whole items by rank.
- Conventional-commit messages exactly as specified.

---

### Task 1: Word-boundary key matcher

**Files:**
- Create: `src/core/retrieval/keys.ts`, `src/core/retrieval/keys.test.ts`

**Interfaces:**
- Produces: `matchKeys(text: string, keys: string[], opts?: { caseSensitive?: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

`src/core/retrieval/keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchKeys } from './keys';

describe('matchKeys', () => {
  it('matches on a word boundary, case-insensitive by default', () => {
    expect(matchKeys('Bob ran home', ['Bob'])).toBe(true);
    expect(matchKeys('bob ran home', ['Bob'])).toBe(true);
  });
  it('does NOT match a substring inside another word (v1 bug)', () => {
    expect(matchKeys('the water arose', ['Rose'])).toBe(false);
  });
  it('matches multi-word keys', () => {
    expect(matchKeys('down at the docks tonight', ['the docks'])).toBe(true);
  });
  it('honors case sensitivity when asked', () => {
    expect(matchKeys('bob', ['Bob'], { caseSensitive: true })).toBe(false);
  });
  it('is false for empty text or no keys', () => {
    expect(matchKeys('', ['Bob'])).toBe(false);
    expect(matchKeys('Bob', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- retrieval/keys`
Expected: FAIL ("Cannot find module './keys'").

- [ ] **Step 3: Implement**

`src/core/retrieval/keys.ts`:

```ts
export function matchKeys(
  text: string, keys: string[], opts: { caseSensitive?: boolean } = {},
): boolean {
  if (!text || keys.length === 0) return false;
  const flags = opts.caseSensitive ? '' : 'i';
  for (const raw of keys) {
    const key = raw.trim();
    if (!key) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, flags).test(text)) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- retrieval/keys && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/retrieval/keys.ts src/core/retrieval/keys.test.ts
git commit -m "feat(retrieval): word-boundary key matcher"
```

---

### Task 2: Entry views (structural projections)

**Files:**
- Create: `src/core/retrieval/views.ts`, `src/core/retrieval/views.test.ts`

**Interfaces:**
- Consumes: `BibleEntry` from `../model/entities`.
- Produces:
  - `type ViewLevel = 'identity' | 'brief' | 'standard' | 'full'`
  - `renderView(entry: BibleEntry, level: ViewLevel): string` — structural (computed, no LLM): identity = header + first summary line; brief = header + summary + top-priority facet's first paragraph; standard = header + summary + every facet's first paragraph; full = header + summary + every facet in full.

- [ ] **Step 1: Write the failing test**

`src/core/retrieval/views.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderView } from './views';
import { createBibleEntry } from '../model/entities';

const bob = createBibleEntry({
  type: 'character', name: 'Bob', summary: 'A washed-up detective.',
  facets: [
    { key: 'appearance', content: 'Tall, gaunt.\n\nAlways in a grey coat.', priority: 5 },
    { key: 'backstory', content: 'Left the force after the docks case.', priority: 9 },
  ],
});

describe('renderView', () => {
  it('identity is compact', () => {
    const out = renderView(bob, 'identity');
    expect(out).toContain('Bob');
    expect(out).not.toContain('grey coat');
  });
  it('brief includes the highest-priority facet only', () => {
    const out = renderView(bob, 'brief');
    expect(out).toContain('washed-up detective');
    expect(out).toContain('Left the force'); // backstory, priority 9
    expect(out).not.toContain('grey coat');  // appearance, lower priority
  });
  it('standard includes every facet but only first paragraphs', () => {
    const out = renderView(bob, 'standard');
    expect(out).toContain('Tall, gaunt.');
    expect(out).not.toContain('grey coat'); // second paragraph dropped
  });
  it('full includes complete facet content', () => {
    const out = renderView(bob, 'full');
    expect(out).toContain('grey coat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- retrieval/views`
Expected: FAIL ("Cannot find module './views'").

- [ ] **Step 3: Implement**

`src/core/retrieval/views.ts`:

```ts
import type { BibleEntry } from '../model/entities';

export type ViewLevel = 'identity' | 'brief' | 'standard' | 'full';

const header = (e: BibleEntry): string => `${e.name} — ${e.type}`;
const firstParagraph = (s: string): string => s.split(/\n\n/)[0] ?? s;
const firstLine = (s: string): string => s.split('\n')[0] ?? s;

export function renderView(entry: BibleEntry, level: ViewLevel): string {
  const byPriority = [...entry.facets].sort((a, b) => b.priority - a.priority);

  if (level === 'identity') {
    return entry.summary ? `${header(entry)}: ${firstLine(entry.summary)}` : header(entry);
  }
  if (level === 'brief') {
    const top = byPriority[0];
    return [header(entry), entry.summary, top ? `${top.key}: ${firstParagraph(top.content)}` : '']
      .filter(Boolean).join('\n');
  }
  if (level === 'standard') {
    return [header(entry), entry.summary, ...byPriority.map(f => `${f.key}: ${firstParagraph(f.content)}`)]
      .filter(Boolean).join('\n');
  }
  // full
  return [header(entry), entry.summary, ...byPriority.map(f => `${f.key}: ${f.content}`)]
    .filter(Boolean).join('\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- retrieval/views && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/retrieval/views.ts src/core/retrieval/views.test.ts
git commit -m "feat(retrieval): structural entry views"
```

---

### Task 3: Candidate gathering (linked ∪ always-on ∪ keyword ∪ 1-hop graph)

**Files:**
- Create: `src/core/retrieval/candidates.ts`, `src/core/retrieval/candidates.test.ts`

**Interfaces:**
- Consumes: `BibleEntry`, `Relationship` from `../model/entities`; `matchKeys`.
- Produces:
  - `type CandidateSource = 'linked' | 'always-on' | 'keyword' | 'graph'`
  - `interface Candidate { entry: BibleEntry; sources: CandidateSource[] }`
  - `interface GatherInput { entries: BibleEntry[]; relationships: Relationship[]; queryText: string; linkedEntryIds?: string[]; alwaysOnIds?: string[] }`
  - `gatherCandidates(input: GatherInput): Candidate[]` — deleted entries excluded; keyword matches against `[name, ...aliases, ...keys]`; graph adds 1-hop neighbors (via relationships) of any linked/keyword/always-on candidate.

- [ ] **Step 1: Write the failing test**

`src/core/retrieval/candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gatherCandidates } from './candidates';
import { createBibleEntry, createRelationship } from '../model/entities';

const bob = createBibleEntry({ type: 'character', name: 'Bob', keys: ['Bob'] });
const vivian = createBibleEntry({ type: 'character', name: 'Vivian', keys: ['Vivian'] });
const docks = createBibleEntry({ type: 'location', name: 'the docks', keys: ['docks'] });
const rel = createRelationship({ from: bob.id, to: vivian.id, type: 'knows' });

describe('gatherCandidates', () => {
  it('gathers linked, keyword, and 1-hop graph candidates', () => {
    const cands = gatherCandidates({
      entries: [bob, vivian, docks], relationships: [rel],
      queryText: 'a night at the docks', linkedEntryIds: [bob.id],
    });
    const byId = new Map(cands.map(c => [c.entry.id, c.sources]));
    expect(byId.get(bob.id)).toContain('linked');
    expect(byId.get(docks.id)).toContain('keyword');   // matched "docks"
    expect(byId.get(vivian.id)).toContain('graph');    // 1-hop from Bob
  });
  it('excludes deleted entries', () => {
    const dead = createBibleEntry({ type: 'item', name: 'Ghost', keys: ['Ghost'], deleted: true });
    const cands = gatherCandidates({
      entries: [dead], relationships: [], queryText: 'the Ghost appears',
    });
    expect(cands).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- retrieval/candidates`
Expected: FAIL ("Cannot find module './candidates'").

- [ ] **Step 3: Implement**

`src/core/retrieval/candidates.ts`:

```ts
import type { BibleEntry, Relationship } from '../model/entities';
import { matchKeys } from './keys';

export type CandidateSource = 'linked' | 'always-on' | 'keyword' | 'graph';
export interface Candidate { entry: BibleEntry; sources: CandidateSource[] }
export interface GatherInput {
  entries: BibleEntry[];
  relationships: Relationship[];
  queryText: string;
  linkedEntryIds?: string[];
  alwaysOnIds?: string[];
}

export function gatherCandidates(input: GatherInput): Candidate[] {
  const live = input.entries.filter(e => !e.deleted);
  const byId = new Map(live.map(e => [e.id, e]));
  const sources = new Map<string, Set<CandidateSource>>();
  const add = (id: string, s: CandidateSource) => {
    if (!byId.has(id)) return;
    if (!sources.has(id)) sources.set(id, new Set());
    sources.get(id)!.add(s);
  };

  for (const id of input.linkedEntryIds ?? []) add(id, 'linked');
  for (const id of input.alwaysOnIds ?? []) add(id, 'always-on');
  for (const e of live) {
    if (matchKeys(input.queryText, [e.name, ...e.aliases, ...e.keys])) add(e.id, 'keyword');
  }

  // 1-hop graph expansion from the seeds gathered so far
  const seeds = new Set(sources.keys());
  for (const rel of input.relationships) {
    if (seeds.has(rel.from) && byId.has(rel.to)) add(rel.to, 'graph');
    if (seeds.has(rel.to) && byId.has(rel.from)) add(rel.from, 'graph');
  }

  return [...sources.entries()].map(([id, s]) => ({ entry: byId.get(id)!, sources: [...s] }));
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- retrieval/candidates && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/retrieval/candidates.ts src/core/retrieval/candidates.test.ts
git commit -m "feat(retrieval): candidate gathering with 1-hop graph expansion"
```

---

### Task 4: Ranking

**Files:**
- Create: `src/core/retrieval/rank.ts`, `src/core/retrieval/rank.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `CandidateSource`.
- Produces:
  - `interface RankedCandidate extends Candidate { score: number }`
  - `rankCandidates(cands: Candidate[]): RankedCandidate[]` — `score = max(sourceWeight) + entry.priority`, sorted descending. Source weights: linked 100, always-on 90, keyword 50, graph 20.

- [ ] **Step 1: Write the failing test**

`src/core/retrieval/rank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rankCandidates } from './rank';
import { createBibleEntry } from '../model/entities';
import type { Candidate } from './candidates';

describe('rankCandidates', () => {
  it('ranks linked above keyword above graph, and adds entry priority', () => {
    const mk = (name: string, sources: Candidate['sources'], priority = 0): Candidate =>
      ({ entry: createBibleEntry({ type: 'character', name, priority }), sources });
    const ranked = rankCandidates([
      mk('graphOnly', ['graph']),
      mk('linked', ['linked']),
      mk('keyword', ['keyword']),
    ]);
    expect(ranked.map(r => r.entry.name)).toEqual(['linked', 'keyword', 'graphOnly']);
  });
  it('uses the strongest source when several apply', () => {
    const c: Candidate = { entry: createBibleEntry({ type: 'item', name: 'X' }), sources: ['graph', 'linked'] };
    expect(rankCandidates([c])[0]!.score).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- retrieval/rank`
Expected: FAIL ("Cannot find module './rank'").

- [ ] **Step 3: Implement**

`src/core/retrieval/rank.ts`:

```ts
import type { Candidate, CandidateSource } from './candidates';

const SOURCE_WEIGHT: Record<CandidateSource, number> = {
  linked: 100, 'always-on': 90, keyword: 50, graph: 20,
};

export interface RankedCandidate extends Candidate { score: number }

export function rankCandidates(cands: Candidate[]): RankedCandidate[] {
  return cands
    .map(c => ({
      ...c,
      score: Math.max(...c.sources.map(s => SOURCE_WEIGHT[s])) + c.entry.priority,
    }))
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- retrieval/rank && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/retrieval/rank.ts src/core/retrieval/rank.test.ts
git commit -m "feat(retrieval): source-weighted ranking"
```

---

### Task 5: Retrieval pipeline + golden eval

**Files:**
- Create: `src/core/retrieval/retrieve.ts`, `src/core/retrieval/retrieve.test.ts`

**Interfaces:**
- Consumes: `gatherCandidates`/`GatherInput`, `rankCandidates`, `renderView`/`ViewLevel`, `countTokens`, `PackItem`.
- Produces:
  - `interface RetrieveInput extends GatherInput { view?: ViewLevel }`
  - `retrieve(input: RetrieveInput): PackItem[]` — gather → rank → render each at `view` (default `'brief'`) → `PackItem{ id, content, tokens, priority: score }`, highest score first.

- [ ] **Step 1: Write the failing test (includes the golden eval)**

`src/core/retrieval/retrieve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { retrieve } from './retrieve';
import { createBibleEntry, createRelationship } from '../model/entities';

describe('retrieve (golden eval)', () => {
  const bob = createBibleEntry({ type: 'character', name: 'Bob', keys: ['Bob'], summary: 'A detective.', priority: 1 });
  const vivian = createBibleEntry({ type: 'character', name: 'Vivian', keys: ['Vivian'], summary: 'The widow.' });
  const docks = createBibleEntry({ type: 'location', name: 'the docks', keys: ['docks'], summary: 'Foggy piers.' });
  const rel = createRelationship({ from: bob.id, to: vivian.id, type: 'knows' });

  it('returns linked+keyword+graph entries as scored PackItems, linked first', () => {
    const items = retrieve({
      entries: [bob, vivian, docks], relationships: [rel],
      queryText: 'Bob walks the docks', linkedEntryIds: [bob.id],
    });
    const ids = items.map(i => i.id);
    expect(ids).toContain(bob.id);
    expect(ids).toContain(docks.id);   // keyword
    expect(ids).toContain(vivian.id);  // graph via Bob
    expect(items[0]!.id).toBe(bob.id); // linked ranks first
    for (const i of items) expect(i.tokens).toBeGreaterThan(0);
  });

  it('renders at the requested view', () => {
    const items = retrieve({ entries: [bob], relationships: [], queryText: 'Bob', view: 'identity' });
    expect(items[0]!.content.startsWith('Bob')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- retrieval/retrieve`
Expected: FAIL ("Cannot find module './retrieve'").

- [ ] **Step 3: Implement**

`src/core/retrieval/retrieve.ts`:

```ts
import { gatherCandidates, type GatherInput } from './candidates';
import { rankCandidates } from './rank';
import { renderView, type ViewLevel } from './views';
import { countTokens } from '../ai/tokenizer';
import type { PackItem } from '../ai/packer';

export interface RetrieveInput extends GatherInput { view?: ViewLevel }

export function retrieve(input: RetrieveInput): PackItem[] {
  const view = input.view ?? 'brief';
  const ranked = rankCandidates(gatherCandidates(input));
  return ranked.map(rc => {
    const content = renderView(rc.entry, view);
    return { id: rc.entry.id, content, tokens: countTokens(content), priority: rc.score };
  });
}
```

- [ ] **Step 4: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/retrieval/retrieve.ts src/core/retrieval/retrieve.test.ts
git commit -m "feat(retrieval): passive retrieval pipeline with golden eval"
```

---

## Self-Review

- **Spec coverage (§7 of the design):** one word-boundary matcher ✓ (T1, fixes v1's dual-matcher bug), computed views ✓ (T2), multi-source candidates linked∪always-on∪keyword∪1-hop-graph ✓ (T3), rank ✓ (T4), pipeline emitting PackItems + golden eval ✓ (T5). Pure — no state mutation (fixes v1's read-path write). Semantic/embedding source is M1 behind this same interface; narrative rolling summaries are Plan 6.
- **Placeholder scan:** none; T5 has an explicit "use this corrected block" instruction (a fix, not a placeholder).
- **Type consistency:** `CandidateSource`/`Candidate`/`GatherInput`, `RankedCandidate`, `ViewLevel`/`renderView`, `RetrieveInput`/`retrieve` returning `PackItem[]` (Plan 2) are consistent across tasks.
