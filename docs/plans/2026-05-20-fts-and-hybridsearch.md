# Sprint Plan — FTS contract + hybridSearch architecture

**Date**: 2026-05-20
**Status**: Decisions locked, ready to execute
**Driving session**: arcana-library

## Sprint principle

**Implement the architecture. Defer the consumer swap.**

Every code change in this sprint is *additive* to the Arcana kernel. KyberBot's working `cli/src/brain/hybrid-search.ts` is not touched. No consumer swap happens without a separate parity gate (see §6).

This shape exists because KyberBot's hybrid search empirically works today and we have no oracle to verify "the new version produces equivalent or better results." Shipping architecture without shipping the swap removes the regression risk while still building toward the unified kernel.

---

## What lands in this sprint

### 1. `StructuredStore.searchFulltext` — new contract method

Add to `packages/arcana-contracts/src/providers.ts`:

```typescript
searchFulltext(
  query: string,
  opts?: {
    scopes?: Scopes;
    tier?: Tier;
    topK?: number;
    fields?: ('title' | 'content' | 'tags')[];
  },
): Promise<Array<{
  memoryId: string;
  score: number;           // BM25 or tsvector rank, normalized 0-1
  matchedFields: string[];
}>>;
```

Single signature that works for both FTS5 (`MATCH`) and tsvector (`@@ to_tsquery`). Returns memory IDs + score + matched fields — kernel enriches to full `Memory` objects.

### 2. libsql impl of `searchFulltext`

In `packages/arcana-provider-libsql/`:
- Add `memories_fts` virtual table to `schema.ts` (FTS5, `unicode61` tokenizer, columns: `title`, `summary`, `content`, `tags`).
- Add triggers: AFTER INSERT/UPDATE/DELETE on `memories` to sync the FTS table.
- Implement `searchFulltext` in `libsql-structured-store.ts` using `MATCH` + `bm25()` ranking.
- Tests: query matches, scope filtering, tier filtering, empty results, multi-word queries.

### 3. Kernel `hybridSearch` implementation

In `packages/arcana-core/src/retrieve/index.ts`:
- Replace the `NotImplementedError` stub with a real RRF fusion implementation.
- Three channels: `structured.searchFulltext` (keyword), `vector.query` (semantic), `getNeighbors`-based BFS (graph expansion).
- RRF formula: `Σ 1 / (60 + rank_i)` across channels.
- No reranker (kept optional via existing `RerankerProvider` interface).
- Tests against fixture data, scope filtering preserved.

### 4. `HybridSearchResult` shape — wave-1 parity with KyberBot

**Wave 1 (this sprint)** — match KyberBot's existing flat shape so the eventual swap is shape-compatible:

```typescript
interface HybridSearchResult {
  memory: Memory;
  score: number;              // RRF fused score (same as hybridScore in KyberBot)
  semanticScore: number;      // 0 if not in semantic channel
  keywordScore: number;       // 0 if not in keyword channel
  graphScore: number;         // 0 if not in graph channel
  matchType: 'semantic' | 'keyword' | 'graph' | 'multi';
  why?: string;
}
```

KyberBot-specific `source_path` stays in KyberBot land — kernel only knows `Memory`.

**Wave 2 (future, not this sprint)** — once KyberBot has swapped and parity is proven, evolve to a nested channels object (`{ keyword: { score, rank }, semantic: { ... }, ... }`) that exposes rank alongside score and supports future channels cleanly. Documented here so the future shape isn't lost; not implemented until consumers are stable on wave 1.

### 5. `queryFacts({ asOf })` — bitemporal timeline query

In `packages/arcana-core/src/access/query/index.ts`:
- Add optional `asOf?: string` (ISO 8601) parameter.
- Filter out facts where `expiresAt < asOf`.
- Backward compatible: omitting `asOf` preserves current behavior.

Provider chain (`StructuredStore.getFactsForEntity`) takes a matching optional param. libsql impl filters in SQL. Tests cover: no asOf, future asOf, past asOf, expired facts excluded.

### 6. Parity-gate methodology — documented, not built

New doc: `docs/decisions/009-parity-gate-for-consumer-swaps.md`

Captures the rule: no consumer migrates from a working parallel implementation to the kernel without a parity test proving equivalent output on a representative fixture set. Defines the methodology (top-N overlap, threshold, fixture sourcing) without building the harness — that's the next milestone.

### 7. Sleep-pipeline gap — documented, not implemented

New doc: `docs/decisions/010-sleep-pipeline-step-reconciliation.md`

Side-by-side: KyberBot's 9 steps vs Arcana's 13 `SLEEP_STEPS`. Flags `consolidate` and `observe` as KyberBot-only with no clean Arcana home. Records the open design question (fold `observe` into `extractFacts`? add `consolidate` as a 14th step?) without resolving it. Sleep implementation work is a separate future milestone.

### 8. Kernel-consumer matrix — JSON schema first, HTML second

In `.mochaccino/`:

- Update `data/06-kernel-methods.json` schema. Each method record gains a `consumers` field:
  ```json
  "consumers": {
    "kyberbot": {
      "mode": "wired | parallel | wrapped | unused | needs",
      "location": "<file path>",
      "migration_debt": <boolean>,
      "notes": "<optional>"
    },
    "kyberagent-desktop": { ... },
    "kybernesis-brain": { ... }
  }
  ```
  State vocabulary: `wired` (calls kernel), `parallel` (own impl, kernel exists, migration debt), `wrapped` (kernel call behind local wrapper), `unused` (doesn't need), `needs` (wants but kernel doesn't have it yet).

- Backfill data for every method based on current state.

- Add new `data/08-provider-adoption.json` — providers × consumers matrix showing which adapter each consumer uses.

- Extend `views/kernel-methods.html` to render the new consumer columns. Click-to-select continues to flow into `COPY CONTEXT`.

---

## Out of scope for this sprint

- **KyberBot consumer swap** — gated on parity harness. Separate milestone.
- **Reranker package** — KyberBot keeps its Haiku call locally. Future architectural cleanup: collapse `RerankerProvider` into `LLMProvider` + kernel-side rerank utility, then ship `arcana-provider-llm-openrouter` / `-ollama` as model-pointer providers. Documented as a follow-up.
- **Sleep pipeline implementation** — only the gap doc lands here.
- **Postgres provider** — next sprint. Will reuse the `searchFulltext` contract locked here.
- **`ingestDocument`, `deleteMemory`, `updateBlock`** — no consumer demand.

---

## Order of operations

A. Contract + libsql FTS (items 1, 2) — pure addition, lowest risk.
B. queryFacts asOf (item 5) — small, independent.
C. Kernel hybridSearch + enriched result shape (items 3, 4) — depends on A.
D. Three docs (items 6, 7) — can land in parallel with code.
E. Matrix schema + backfill + HTML (item 8) — depends on nothing, can interleave.

Recommended interleave: A → B → matrix JSON schema → C → docs → matrix HTML.

---

## Decisions locked

1. **`HybridSearchResult` shape** — wave 1 matches KyberBot's flat shape exactly. Wave 2 (nested channels with rank info) deferred until consumers are stable. Recorded in §4.
2. **Ordering** — code sprint and matrix work run in parallel. Matrix JSON schema lands early so sprint progress is visible in the dashboard as it lands.

The "waves" principle: parity with KyberBot first, architectural improvement second — applied to every shape decision in this sprint.

---

## Definition of done

- All new code paths have tests.
- `pnpm test` passes (current baseline: 212 tests).
- New docs are committed under `docs/decisions/` and `docs/plans/`.
- Mochaccino data updated; HTML view reflects the new matrix.
- No version bumps yet — all changes ship in the next coordinated release (v0.2.0 candidate).
- KyberBot is untouched. Its tests still pass.
