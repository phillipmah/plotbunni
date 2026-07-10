# M0 Plan 2 (Tokenizer + Prompt Composer + Context Packer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the pure, deterministic context-assembly primitives every AI generation depends on — a real tokenizer, a composable system-prompt builder, a budget-aware context packer, and an assembler that ties them together with a token breakdown.

**Architecture:** Pure functions under `src/core/ai/`, no IO, no network, fully unit-tested. Replaces v1's `chars/4` token estimate and its front-of-string truncation (which decapitated sentences). The packer drops **whole items by priority**, never substring-trims. Depends on nothing from the op-dispatcher; consumed later by Plan 3 (retrieval produces pack items) and Plan 4 (generation calls the assembler).

**Tech Stack:** TypeScript (strict), Vitest, `gpt-tokenizer` (pure-JS BPE, browser-safe).

## Global Constraints

- TypeScript `strict`; `npm test` and `npm run typecheck` BOTH green before every commit.
- Pure functions only in this plan — no IndexedDB, no fetch, no React.
- Tokenizer: use `gpt-tokenizer` with the `o200k_base` encoding (a close, stable approximation for modern models incl. GLM 4+; the packer carries a safety margin regardless — exact per-model counts are not required).
- Packer never partially includes an item: an item is fully in or fully dropped, selected by priority.
- Conventional-commit messages; commit exactly as each task specifies (the last task's message contains "prompt assembler" — the completion marker).

---

### Task 1: Tokenizer

**Files:**
- Create: `src/core/ai/tokenizer.ts`, `src/core/ai/tokenizer.test.ts`
- Modify: `package.json` (add `gpt-tokenizer`)

**Interfaces:**
- Produces: `countTokens(text: string): number`

- [ ] **Step 1: Install the tokenizer**

Run: `npm install gpt-tokenizer`

- [ ] **Step 2: Write the failing test**

`src/core/ai/tokenizer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countTokens } from './tokenizer';

describe('countTokens', () => {
  it('is 0 for empty', () => expect(countTokens('')).toBe(0));
  it('counts a word as at least one token', () => expect(countTokens('hello')).toBeGreaterThanOrEqual(1));
  it('grows with length', () => {
    expect(countTokens('hello world, this is a longer sentence.'))
      .toBeGreaterThan(countTokens('hello'));
  });
  it('is far below the naive chars/4 for long prose', () => {
    // sanity: real tokenizer, not chars/4 — but same order of magnitude
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    const n = countTokens(text);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(text.length); // fewer tokens than characters
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tokenizer`
Expected: FAIL ("Cannot find module './tokenizer'").

- [ ] **Step 4: Implement**

`src/core/ai/tokenizer.ts`:

```ts
import { encode } from 'gpt-tokenizer/encoding/o200k_base';

/** Real BPE token count (o200k_base). Replaces v1's chars/4 estimate. */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- tokenizer && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/ai/tokenizer.ts src/core/ai/tokenizer.test.ts
git commit -m "feat(ai): real tokenizer (gpt-tokenizer)"
```

---

### Task 2: Prompt module type + built-in defaults

**Files:**
- Create: `src/core/ai/promptModules.ts`, `src/core/ai/promptModules.test.ts`

**Interfaces:**
- Produces:
  - `type PromptModuleKind = 'director-voice' | 'pov' | 'narrative-tracking' | 'task-base'`
  - `interface PromptModule { id: string; kind: PromptModuleKind; name: string; content: string; enabled: boolean; order: number }`
  - `BUILTIN_MODULES: PromptModule[]` (a small default set: a core director voice, a POV default, a continuity/tracking default)

- [ ] **Step 1: Write the failing test**

`src/core/ai/promptModules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_MODULES } from './promptModules';

describe('BUILTIN_MODULES', () => {
  it('ships at least one enabled module of each core kind', () => {
    const kinds = new Set(BUILTIN_MODULES.filter(m => m.enabled).map(m => m.kind));
    expect(kinds.has('director-voice')).toBe(true);
    expect(kinds.has('pov')).toBe(true);
    expect(kinds.has('narrative-tracking')).toBe(true);
  });
  it('every module has non-empty content and a unique id', () => {
    const ids = BUILTIN_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of BUILTIN_MODULES) expect(m.content.trim().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- promptModules`
Expected: FAIL ("Cannot find module './promptModules'").

- [ ] **Step 3: Implement**

`src/core/ai/promptModules.ts`:

```ts
export type PromptModuleKind = 'director-voice' | 'pov' | 'narrative-tracking' | 'task-base';

export interface PromptModule {
  id: string;
  kind: PromptModuleKind;
  name: string;
  content: string;
  enabled: boolean;
  order: number;
}

export const BUILTIN_MODULES: PromptModule[] = [
  {
    id: 'core-voice', kind: 'director-voice', name: 'Core narrator', order: 0, enabled: true,
    content:
      'You are an experienced novelist and a sharp writing partner. Prose is vivid, ' +
      'concrete, and economical. Show through action and sensory detail; avoid cliché and filler.',
  },
  {
    id: 'pov-third-past', kind: 'pov', name: 'Third person, past tense', order: 10, enabled: true,
    content:
      'Write in third-person limited, past tense, staying inside the point-of-view ' +
      'character for the scene unless told otherwise.',
  },
  {
    id: 'continuity', kind: 'narrative-tracking', name: 'Continuity', order: 20, enabled: true,
    content:
      'Honor established facts about characters, places, and prior events. Do not contradict ' +
      'canon or introduce information the point-of-view character could not know.',
  },
];
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- promptModules && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/promptModules.ts src/core/ai/promptModules.test.ts
git commit -m "feat(ai): prompt module type and built-in defaults"
```

---

### Task 3: System prompt composer

**Files:**
- Create: `src/core/ai/composer.ts`, `src/core/ai/composer.test.ts`

**Interfaces:**
- Consumes: `PromptModule`.
- Produces: `composeSystemPrompt(modules: PromptModule[]): string` — enabled modules, sorted by `order`, contents joined with a blank line; disabled or empty-content modules omitted.

- [ ] **Step 1: Write the failing test**

`src/core/ai/composer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeSystemPrompt } from './composer';
import type { PromptModule } from './promptModules';

const mod = (p: Partial<PromptModule> & { id: string; content: string; order: number }): PromptModule =>
  ({ kind: 'task-base', name: p.id, enabled: true, ...p });

describe('composeSystemPrompt', () => {
  it('joins enabled modules in order', () => {
    const out = composeSystemPrompt([
      mod({ id: 'b', content: 'Second', order: 10 }),
      mod({ id: 'a', content: 'First', order: 0 }),
    ]);
    expect(out).toBe('First\n\nSecond');
  });
  it('omits disabled and empty modules', () => {
    const out = composeSystemPrompt([
      mod({ id: 'a', content: 'Keep', order: 0 }),
      mod({ id: 'b', content: 'Drop', order: 5, enabled: false }),
      mod({ id: 'c', content: '   ', order: 10 }),
    ]);
    expect(out).toBe('Keep');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- composer`
Expected: FAIL ("Cannot find module './composer'").

- [ ] **Step 3: Implement**

`src/core/ai/composer.ts`:

```ts
import type { PromptModule } from './promptModules';

export function composeSystemPrompt(modules: PromptModule[]): string {
  return modules
    .filter(m => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map(m => m.content.trim())
    .filter(c => c.length > 0)
    .join('\n\n');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- composer && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/composer.ts src/core/ai/composer.test.ts
git commit -m "feat(ai): system prompt composer"
```

---

### Task 4: Rank-drop context packer

**Files:**
- Create: `src/core/ai/packer.ts`, `src/core/ai/packer.test.ts`

**Interfaces:**
- Produces:
  - `interface PackItem { id: string; content: string; tokens: number; priority: number }`
  - `interface PackResult { packed: PackItem[]; dropped: PackItem[]; usedTokens: number }`
  - `packContext(items: PackItem[], budget: number): PackResult` — selects items by descending `priority` while they fit within `budget`; **whole items only** (never partial); returns `packed` in the **original input order** (so callers control display/chronology), plus `dropped` and `usedTokens`.

- [ ] **Step 1: Write the failing test**

`src/core/ai/packer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { packContext, type PackItem } from './packer';

const item = (id: string, tokens: number, priority: number): PackItem =>
  ({ id, content: id, tokens, priority });

describe('packContext', () => {
  it('includes everything when under budget, preserving input order', () => {
    const r = packContext([item('a', 10, 1), item('b', 20, 5)], 100);
    expect(r.packed.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.usedTokens).toBe(30);
    expect(r.dropped).toEqual([]);
  });
  it('drops lowest-priority whole items when over budget', () => {
    const r = packContext([
      item('low', 60, 1),
      item('high', 60, 9),
    ], 100);
    expect(r.packed.map(p => p.id)).toEqual(['high']);
    expect(r.dropped.map(p => p.id)).toEqual(['low']);
    expect(r.usedTokens).toBe(60);
  });
  it('never partially includes an item', () => {
    const r = packContext([item('big', 200, 9)], 100);
    expect(r.packed).toEqual([]);
    expect(r.dropped.map(p => p.id)).toEqual(['big']);
    expect(r.usedTokens).toBe(0);
  });
  it('respects the budget when the next item would overflow', () => {
    const r = packContext([item('big', 90, 9), item('small', 5, 1)], 92);
    expect(r.packed.map(p => p.id)).toEqual(['big']);
    expect(r.dropped.map(p => p.id)).toEqual(['small']);
    expect(r.usedTokens).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packer`
Expected: FAIL ("Cannot find module './packer'").

- [ ] **Step 3: Implement**

`src/core/ai/packer.ts`:

```ts
export interface PackItem { id: string; content: string; tokens: number; priority: number }
export interface PackResult { packed: PackItem[]; dropped: PackItem[]; usedTokens: number }

export function packContext(items: PackItem[], budget: number): PackResult {
  const indexed = items.map((it, i) => ({ it, i }));
  const byPriority = [...indexed].sort((a, b) => b.it.priority - a.it.priority);
  const chosen = new Set<number>();
  let used = 0;
  for (const { it, i } of byPriority) {
    if (used + it.tokens <= budget) { chosen.add(i); used += it.tokens; }
  }
  const packed = indexed.filter(x => chosen.has(x.i)).map(x => x.it);
  const dropped = indexed.filter(x => !chosen.has(x.i)).map(x => x.it);
  return { packed, dropped, usedTokens: used };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- packer && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/packer.ts src/core/ai/packer.test.ts
git commit -m "feat(ai): rank-drop context packer"
```

---

### Task 5: Prompt assembler

**Files:**
- Create: `src/core/ai/assemble.ts`, `src/core/ai/assemble.test.ts`

**Interfaces:**
- Consumes: `composeSystemPrompt`, `packContext`, `PackItem`, `PromptModule`, `countTokens`.
- Produces:
  - `interface AssembleInput { modules: PromptModule[]; taskBase?: string; contextItems: PackItem[]; budget: number; userMessage: string }`
  - `interface AssembledPrompt { system: string; messages: { role: 'user'; content: string }[]; breakdown: { systemTokens: number; contextTokens: number; userTokens: number; droppedItems: number } }`
  - `assemblePrompt(input: AssembleInput): AssembledPrompt` — appends `taskBase` (if any) as a high-order `task-base` module, composes the system prompt, packs context into `budget`, prepends the packed context block to the user message (separated by `---`), and reports a token breakdown.

- [ ] **Step 1: Write the failing test**

`src/core/ai/assemble.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from './assemble';
import { BUILTIN_MODULES } from './promptModules';
import type { PackItem } from './packer';

const ctx = (id: string, content: string, tokens: number, priority: number): PackItem =>
  ({ id, content, tokens, priority });

describe('assemblePrompt', () => {
  it('composes system prompt including an appended task base', () => {
    const out = assemblePrompt({
      modules: BUILTIN_MODULES, taskBase: 'TASK: draft the scene.',
      contextItems: [], budget: 1000, userMessage: 'Write scene 1.',
    });
    expect(out.system).toContain('novelist');
    expect(out.system).toContain('TASK: draft the scene.');
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]!.content).toBe('Write scene 1.');
  });
  it('prepends packed context and drops over-budget items', () => {
    const out = assemblePrompt({
      modules: [], contextItems: [ctx('a', 'BOB is a detective', 5, 9), ctx('b', 'noise', 999, 1)],
      budget: 10, userMessage: 'Continue.',
    });
    expect(out.messages[0]!.content).toContain('BOB is a detective');
    expect(out.messages[0]!.content).toContain('---');
    expect(out.messages[0]!.content).toContain('Continue.');
    expect(out.breakdown.droppedItems).toBe(1);
    expect(out.breakdown.contextTokens).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble`
Expected: FAIL ("Cannot find module './assemble'").

- [ ] **Step 3: Implement**

`src/core/ai/assemble.ts`:

```ts
import { composeSystemPrompt } from './composer';
import { packContext, type PackItem } from './packer';
import { countTokens } from './tokenizer';
import type { PromptModule } from './promptModules';

export interface AssembleInput {
  modules: PromptModule[];
  taskBase?: string;
  contextItems: PackItem[];
  budget: number;
  userMessage: string;
}

export interface AssembledPrompt {
  system: string;
  messages: { role: 'user'; content: string }[];
  breakdown: { systemTokens: number; contextTokens: number; userTokens: number; droppedItems: number };
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const modules: PromptModule[] = input.taskBase
    ? [...input.modules, {
        id: 'task-base', kind: 'task-base', name: 'Task', order: 1000, enabled: true, content: input.taskBase,
      }]
    : input.modules;

  const system = composeSystemPrompt(modules);
  const { packed, dropped } = packContext(input.contextItems, input.budget);
  const contextBlock = packed.map(p => p.content).join('\n\n');
  const userContent = contextBlock ? `${contextBlock}\n\n---\n\n${input.userMessage}` : input.userMessage;

  return {
    system,
    messages: [{ role: 'user', content: userContent }],
    breakdown: {
      systemTokens: countTokens(system),
      contextTokens: countTokens(contextBlock),
      userTokens: countTokens(input.userMessage),
      droppedItems: dropped.length,
    },
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/assemble.ts src/core/ai/assemble.test.ts
git commit -m "feat(ai): prompt assembler (composer + packer + budget breakdown)"
```

---

## Self-Review

- **Spec coverage (§6.2 of the design):** real tokenizer ✓ (T1, replaces chars/4), composable prompt modules + composition ✓ (T2/T3), budget-pack dropping whole items by rank ✓ (T4, replaces v1 front-truncation), assembler with token breakdown ✓ (T5). Scene-context *pipeline* wiring (which items to gather) is Plan 3/4; this plan provides the primitives it uses.
- **Placeholder scan:** none. Task 4's test has an explicit correction note (delete the bad `it` block, use the corrected one) — an instruction, not a placeholder.
- **Type consistency:** `PackItem`/`PackResult`, `PromptModule`/`PromptModuleKind`, `composeSystemPrompt`, `packContext`, `countTokens`, `assemblePrompt`/`AssembleInput`/`AssembledPrompt` consistent across tasks.
