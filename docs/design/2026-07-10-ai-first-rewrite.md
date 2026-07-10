# Plot Bunni v2 — AI-First Rewrite: Design & Spec

**Status:** Draft for review · **Date:** 2026-07-10 · **Owner:** Phillip Mah

This document is the source-of-truth design for the ground-up rewrite of Plot Bunni.
It captures the full product vision so architectural seams are real, while scoping the
**first implementation to M0 (MVP)** only. OpenSpec change proposals (`openspec/changes/*`)
carry the incremental capability specs during the build; this doc is the reference they draw from.

---

## 1. Thesis & non-goals

**Thesis.** Invert the app from v1's "structured forms with AI-suggestion buttons" to
**AI-first**: natural language is the *primary* way an author creates and mutates a
structured story, with direct manual editing as a first-class fallback. Every story
element — character, location, item, lore, arc, theme, scene, chapter — is created and
fleshed out through the same conversational mechanism, and a free-form brain-dump can be
turned into an initial outline by a reasoning model.

**What stays the same as v1.** Fully **local-first** React/Vite SPA. All data in the
browser (IndexedDB). **No backend, no accounts.** Bring-your-own OpenAI-compatible LLM
endpoint. Export/import as JSON; export manuscript as Markdown/text.

**Reference models.** The target endpoints are **GLM 4+ cloud** models (near-frontier,
reliable native tool-calling and structured output) via OpenAI-compatible APIs, plus
providers like ArliAI / Ollama Cloud. The design assumes a capable model but degrades to
a **structured-output (JSON-schema) contract** that works on weaker models too.

**Non-goals (this rewrite).** No cloud sync / multi-device / collaboration / real-time
server agent. No re-platform off React/Vite. No import of v1 novels in M0 (later). **No
Electron / desktop wrapper** — Plot Bunni stays a **self-hosted web app**; CORS to
self-hosted LLM endpoints is handled by the user's own setup (e.g. `OLLAMA_ORIGINS`, or a
same-origin reverse proxy). These are explicitly out; the local-first, single-author,
self-hosted model is intentional.

---

## 2. Product vision — the authoring loop

The core creative workflow is a **progressive-elaboration ladder**: the author works
coarse→fine, and the same **four-beat loop** repeats at every zoom level:

> **① you outline → ② AI elaborates → ③ you revise → ④ AI generates**

Ladder levels:

| Level | You do | AI does |
|---|---|---|
| **Seed** | Brain-dump the premise as free-form prose | Extract characters/locations/arcs + a skeleton outline (one batch) |
| **Book** | Jot chapters as 1–2 sentences | Split into a clean, structured set of chapter bullets |
| **Chapter** | Sketch a chapter's scenes | Elaborate each into scene beats/synopses |
| **Scene** | Confirm the outline is good | Draft the scene prose |
| **Revision** | Review a drafted chapter | Suggest continuity / pacing fixes |

**Apply model (split by risk).** Structure/outline elaboration **auto-applies** as
editable content (undoable) and you revise it inline. **Prose generation** arrives as a
**staged suggestion you accept or reject** — structure is cheap, prose is sacred.

---

## 3. Architecture overview

```
┌────────────────────────────────────────────────────────────────┐
│  React/Vite SPA (local-first, no backend)                       │
│                                                                 │
│  UI (three-pane IDE)                                            │
│    outline+bible tree · working surface · agent command panel   │
│         │ intents                                               │
│         ▼                                                       │
│  Generation layer  ──uses──►  Prompt composer + Context packer  │
│    single-shot structured-output per ladder step                │
│    (M1: multi-step agent loop over the same tool API)           │
│         │ proposes ops                                          │
│         ▼                                                       │
│  Mutation layer:  single serialized Op Dispatcher               │
│    entityVersion preconditions · turnId grouping · op-log       │
│         │                                                       │
│         ▼                                                       │
│  Persistence: normalized IndexedDB stores + op-log + snapshots  │
│         ▲                                                       │
│  Retrieval layer (pure): keyword ∪ links ∪ always-on ∪ graph    │
│    → rank → token-budget pack   (over world + narrative memory) │
│                                                                 │
│  Endpoints: BYO OpenAI-compatible LLM  (+ M1: SD image API)     │
└────────────────────────────────────────────────────────────────┘
```

Everything above the endpoints runs in the browser. The **mutation layer is the spine**:
all changes — whether typed by the user or proposed by generation — flow through one
dispatcher, which is what makes undo, provenance, and safe concurrency possible.

---

## 4. Data model

### 4.1 Story Bible — worldbook / memory graph

**`BibleEntry`** — one base shape for *every* type (validated by v1's single `Concept` type):

| Field | Notes |
|---|---|
| `id`, `type` | `character\|location\|item\|lore\|arc\|theme\|faction\|event\|…` (open set) |
| `name`, `aliases[]` | identity |
| `keys[]` | lorebook trigger words for retrieval (default = name + aliases) |
| `summary` | short, cheap-to-inject — **derived from facets**, flagged stale when facets change |
| `facets[]` | **canonical** named prose sections: `{key, content, priority, revealedAtSceneId?}` (appearance, personality, backstory, voice, secrets, …) |
| `fields{}` | **typed scalar attributes only** (age, height…) — static; distinct from M2 Tracker (time-varying) |
| `tags[]`, `priority`, `image?` | image is a Blob reference (Blob store reserved for M1 illustration) |

Canonical-source rule (avoids the same fact drifting across three places):
**facets are canonical**, `summary` is derived, `fields{}` is scalars only.

**`Relationship`** — graph edges: `{id, from, to, type, label?, directed?}`
(`knows|located_in|member_of|involves|owns|custom`). In M0, relationships are **created by
ingestion**, used for 1-hop retrieval expansion; there is **no relationship-editing UI** (M1).

**Views (computed, not stored in M0).** A "view" is a structural projection of an entry at a
detail level — zero generation cost, always fresh:
- `identity` = name + type + one-liner
- `brief` = summary + top-priority facets
- `standard` = summary + all facets' first paragraphs
- `full` = everything
LLM-condensed views are an M1 optimization behind the same interface.

**`revealedAtSceneId` on facets (reserved, M1).** Spoiler/knowledge scoping is *positional*
("known as of scene N"), not a static flag — so we reserve a positional field, not a
`visibility` enum, to avoid migrating it later.

### 4.2 Narrative — manuscript tree

**Book › Chapter › Scene** (Acts dropped). `Scene`:
`{id, chapterId, title, content(markdown prose), synopsis(backward summary),
synopsisForward?(reserved; injection default off), linkedEntryIds[], pov?, tags[]}`.

**Two link mechanisms, on purpose:**
- `scene.linkedEntryIds[]` — the hot path ("this scene features Bob"), stored as
  **`{entryId, source:'auto'|'user', state:'active'|'blocked'}`** so an auto-detected false
  positive the user removes is not silently re-added (this fixes a live v1 bug).
- `Relationship` edges — the bible-to-bible semantic graph.

### 4.3 Persistence

- **Normalized IndexedDB object stores** (entries, relationships, chapters, scenes, chat,
  presets, blobs…), replacing v1's whole-novel-blob serialization — so agent/user edits are
  cheap and granular.
- **`schemaVersion`** on the DB and on export JSON from day one; migration runner in
  `onupgradeneeded`.
- **Tombstones** for deleted entities (undo needs them).
- **Chat threads persisted in IDB** (not localStorage as v1 did); messages reference the
  `turnId`s they produced.
- **Prose generation provenance**: staged drafts record `{model, presetId, contextHash}` for
  debugging retrieval quality.
- **Durability:** call `navigator.storage.persist()` on first write; nudge JSON export
  aggressively (only backup story in a local-first app; mind Safari ITP eviction).
- Export remains **one JSON for the whole novel**, versioned.

---

## 5. Mutation layer (the spine)

- **Single serialized op dispatcher.** *All* mutations — user keystrokes and
  generation-proposed changes — flow through one dispatcher. No direct store writes.
- **Op record:** `{seq(monotonic), turnId, actor:'user'|'gen', type, payload, inverse,
  entityVersion}`. Text-field inverses stored as **diffs**, not full text.
- **Concurrency / precondition.** Every entity carries a version; a generation op computed
  against version *v* is **rejected & re-fetched** if the entity changed under it. Naive
  last-write-wins is banned — silently destroying an author's edit is the worst failure a
  writing tool can have.
- **Undo = linear stack only** in M0 (stored inverses are unsound for out-of-order revert).
  Undo operates on **turn boundaries** for generation ops (a generation "turn" = one batch),
  keystroke ops coalesce per field per debounce window.
- **Snapshot + compaction:** periodic snapshot record; log truncated before it → bounded
  growth. The op-log is an undo stack + audit trail in M0, not a user-facing history UI.
- **Multi-tab safety:** Web Locks API single-writer per novel (second tab read-only).

---

## 6. AI generation layer

### 6.1 Contract

- **M0 = single-shot, schema-validated generation per ladder step.** No open-ended agent
  loop. Each AI action (ingest brain-dump, split chapters, elaborate scenes, draft prose,
  suggest revisions, create-entry-from-utterance) is one call returning a structured object
  validated against a JSON schema, with a **parse-fail → repair-reprompt loop**, applied
  **transactionally** by app code through the dispatcher.
- **Brain-dump ingestion is a batch document**, not a tool loop: one schema-validated object
  (entities + skeleton outline) → repair loop → transactional apply → shown for inline revision.
- **The "tool" layer is the internal mutation API** (dispatcher op builders). In M0 app code
  calls it; in **M1 the multi-step agent drops on top unchanged**, using native tool-calling
  (GLM 4+ supports it) with the same structured-output fallback.

### 6.2 Endpoints, prompts, context

- **Per-task endpoint profiles** (kept from v1 — its best AI-config idea): route a weak/cheap
  model to summaries, a strong model to prose. `{baseUrl, apiKey, model, contextLength,
  maxOutput, mode:'structured'|'native-tools'}`, selected by capability probe.
- **Composable prompt system.** The system prompt is *composed* from ordered, toggleable
  **modules** (`director-voice`, `pov/tense`, `narrative-tracking`, `task-base`). M0 ships the
  **composition architecture + 2–3 built-in modules, no management UI**. M1 adds the preset
  manager + SillyTavern preset-JSON import.
- **Scene-context assembly pipeline** (configurable): prior-N scene summaries/text + chapter
  synopses + retrieved bible views + (M2) tracker state + (reserved) next-scene summary for
  foreshadowing. Composed → budget-packed.
- **Real tokenizer** (gpt-tokenizer / tiktoken-WASM in a worker) — *not* v1's `chars/4`
  (off 30–50% on markdown/non-English). Packer **reacts to a 400 "context exceeded"** by
  re-packing smaller and retrying; carries a ~20% under-fill margin.
- **Failure policy:** per-request timeout, retry-with-backoff on 429/5xx, defined state for a
  failed mid-batch generation (rolled back via the turn's ops).
- **Streaming:** staged prose streams into the staging pane; **Accept enabled only after the
  stream completes**; regenerating a scene with existing prose is a whole replace, recoverable
  via the op-log.

---

## 7. Memory & retrieval

**Two axes, deliberately split:**
- **World memory** (static facts) = the worldbook. **One** matcher: word-boundary,
  case-configurable per key (v1 had two inconsistent matchers — substring `.includes` vs
  `\b`-regex; the substring one falsely fires "Rose" inside "arose"). Links are primary,
  keys are the fallback; 1-hop graph expansion from linked entries.
- **Narrative / episodic memory** (what happened) = **rolling hierarchical summaries**
  (scene synopsis → chapter rollup → book rollup).

**Retrieval is a pure function** of (store snapshot, request) — it never writes (v1's
`aiContextUtils` mutated `scene.context` during prompt-building; banned here). Pipeline:
`candidates (keyword ∪ links ∪ always-on ∪ 1-hop graph) → rank (priority·recency) →
budget-pack dropping **whole items by rank** (never substring-trim mid-sentence, as v1 did)`.
M0 hardcodes one pipeline behind a signature shaped like the future pluggable one.

**Staleness cascade.** Editing scene prose marks its synopsis dirty → chapter rollup dirty →
book rollup dirty; regeneration is lazy (on next use) with a visible **"stale" badge**, so
narrative memory doesn't silently rot and make the AI contradict canon.

**Golden retrieval eval set** — "given this bible + this scene, these entries must be
injected" — so ranking is tunable at all.

*(M1: semantic/embedding retrieval via in-browser transformers.js — stays local-first — added
as another candidate source behind the same interface; knowledge/spoiler scoping via
`revealedAtSceneId`.)*

---

## 8. UX

**Three-pane "IDE" layout:**
- **Left** — outline tree (Book › Chapter › Scene) + Bible nav. The tree *is* the
  coarse→fine ladder, so navigating and drilling are one gesture.
- **Center** — the current node's working surface (outline bullets or prose editor).
- **Right** — the agent panel. **In M0 this is a command box that triggers ladder-step
  generations**, not a free multi-step agent (that's M1). Chat threads persist.

Collapses to a two-pane (canvas + rail) on narrow screens. Structure elaboration
auto-applies + inline-revise; prose is accept/reject. **Onboarding:** first-run without a
configured endpoint offers a clear manual/settings path (v1's zero-config AI Horde is not a
default here); empty-state guides toward the brain-dump.

---

## 9. Milestones

### M0 — MVP (proves "AI-first authoring beats forms-with-buttons")
Three-pane IDE; the full **elaboration ladder (all levels)** via **single-shot
structured-output** steps; targeted NL element creation; batch brain-dump ingestion; faceted
Story Bible with computed views + link provenance; Book/Chapter/Scene; **op dispatcher +
linear undo + snapshots + versioning + Web Locks**; **passive** retrieval (keyword + links +
always-on + 1-hop graph + real tokenizer + rank-drop packer); rolling scene/chapter summaries
+ staleness cascade; prompt-composition architecture + 2–3 built-in modules; per-task endpoint
profiles + GLM 4+ config + failure policy; streaming staged prose; JSON export; the testing
core (§11).

### M0 deferrals (explicitly OUT of M0)
Open-ended multi-step **agent loop** + agentic memory tools (`searchMemory`/`getEntry` as
*agent* tools); pluggable multi-source pipeline (hardcoded in M0); prompt-preset manager UI;
relationship-edit UI; `synopsisForward` injection; re-rank tuning knobs.

### M1
Agent loop over the tool API (native tool-calling); prompt-preset manager + **SillyTavern
import**; **semantic/embedding retrieval**; knowledge/spoiler scoping; **scene illustration**
(SD-compatible gen, Blob storage, illustrated export); foreshadowing tuning.

### M2
**Tracker / scratchpad** — schema **frozen at story start** (AI-assisted design), values
strictly **int / numeric / enum**, per-scene state snapshots, dice, litRPG progression.
Sits under the `fields`-vs-tracker separation (fields=static, tracker=time-varying).

### Later
Full omnibox / inline-thread surface, graph visualization, whole-novel batch writer,
i18n / themes, v1-JSON import.

---

## 10. Risks & mitigations (from design review)

| Risk | Mitigation |
|---|---|
| Model can't reliably drive structured mutation | GLM 4+ reference (capable); structured-output contract + repair loop; single-shot not multi-step in M0 |
| Agent edit clobbers user edit | entityVersion precondition on every op; single dispatcher |
| Half-applied generation on endpoint failure | turn-grouped ops, transactional apply/rollback |
| Narrative memory rots | dirty-flag cascade + stale badges + lazy regen |
| Token math wrong → context overflow | real tokenizer + react-to-400 repack + margin |
| Multi-tab corruption | Web Locks single-writer |
| Storage eviction / data loss | `storage.persist()` + aggressive export nudging |
| Retrieval false positives | one word-boundary matcher; links primary; link provenance |
| Op-log unbounded growth | snapshot + compaction; diff inverses for text |

---

## 11. Testing strategy

- **Pure, deterministic core, heavily unit-tested:** op dispatcher/undo, retrieval pipeline,
  token packer, prompt composer. Keep them pure functions.
- **Recorded LLM fixtures** (record/replay transcripts) for generation steps.
- **Golden retrieval eval set** for tuning ranking.

---

## 12. Build sequencing (M0)

1. **Data layer** — normalized stores, op dispatcher, undo, snapshots, versioning (pure, no
   UI, fully unit-tested).
2. **Tokenizer + context packer + prompt composer** (port v1's graded-fallback idea; replace
   front-truncation with rank-ordered whole-item dropping).
3. **Passive retrieval pipeline + golden eval set.**
4. **Ladder generation steps** as single-shot structured-output calls through the dispatcher
   (batch ingestion first — it's the headline).
5. **Three-pane UI + staged prose accept/reject + streaming.**
6. **Summarization rollups + staleness cascade.**
7. Hardening: Web Locks, `storage.persist()`, failure policy, export/versioning.

---

## 13. Open questions

- Which **built-in prompt modules** ship in M0 (which director-voice / POV defaults)? — decide
  during M0.
- Exact **JSON schemas** per ladder step (ingestion, chapter-split, scene-elaborate,
  prose-draft) — defined in the M0 implementation plan.
- Package rename: keep the name **"Plot Bunni"**; rename the package `claudetemplate` →
  `plotbunni` as an early M0 task. *(Resolved: name kept.)*

*Resolved during review:* name stays "Plot Bunni"; **Electron dropped** (self-hosted web app
only, §2); M0 scope confirmed.
