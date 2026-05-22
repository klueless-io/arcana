# Plan — v1.0.0 v2 factRetrieval (deepen Fact schema + fact-FTS + rich-bundle return)

**Date**: 2026-05-22
**Mode**: code
**Driving session**: arcana-library
**Related**:
- [ADR 013](../decisions/013-fact-schema-deepening-before-sleep.md) — sequencing rationale
- [ADR 011](../decisions/011-port-first-improve-later.md) — port-first
- [ADR 004](../decisions/004-fact-schema-optional-triple-decomposition.md) — narrowed by ADR 013
- KyberBot source of truth: `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/fact-store.ts` (508 LOC)
- v0.4.1 Findings appendix: `docs/plans/2026-05-21-fact-retrieval-rebase.md`

## 1. Stack

- Arcana monorepo, 6 packages at v0.5.0
- Bun 1.3.10 / Vitest 4.1 / TypeScript 5.9 strict
- KB `fact-store.ts` is the empirical impl — port shape verbatim per ADR 011

## 2. In Scope — five pieces shipped together

### Piece 1 — `FactSchema` widening (`arcana-contracts`)

Add to `FactSchema`:
- `entities: z.array(z.string().min(1))` — replaces single `entity` (denormalised list)
- `sourceMemoryId?: string` — backlink to source memory
- `sourcePath?: string` — file/note origin
- `sourceConversationId?: string` — conversation origin
- `category: FactCategorySchema` — required, defaults to `'general'`

Add `FactCategorySchema = z.enum(['biographical', 'preference', 'event', 'relationship', 'temporal', 'opinion', 'plan', 'general'])` — verbatim from KB `fact-store.ts:38-46`.

Remove `entity` (single). Migration helper exposed: `widenLegacyFact(old) → new`.

Breaking — major bump. Update fact.test.ts round-trip coverage.

### Piece 2 — `StructuredStore.searchFactsFulltext` contract method

```ts
searchFactsFulltext(opts: FulltextSearchOpts & { category?: FactCategory }): Promise<FulltextMatch[]>
```

Same return shape as existing memory `searchFulltext` — `{ id, score (0..1), matchedFields }`. Implementations must populate `matchedFields` with `'content'` and/or `'entities'`.

### Piece 3 — libsql provider — `facts_fts` virtual table + triggers

In `arcana-provider-libsql`:
- Migration on `connect()` creates `facts_fts USING fts5(content, entities)` virtual table.
- INSERT/UPDATE/DELETE triggers on `facts` keep `facts_fts` in sync.
- Schema migration adds new columns: `entities_json TEXT DEFAULT '[]'`, `source_memory_id TEXT`, `source_path TEXT`, `source_conversation_id TEXT`, `category TEXT DEFAULT 'general'`.
- Indices: `idx_facts_category`, `idx_facts_source_memory_id`, `idx_facts_source_conv`.
- Mirror KB `fact-store.ts:102-225` patterns.
- Implement `searchFactsFulltext` via FTS5 MATCH against `facts_fts`, score normalised to 0..1 per existing memory pattern.
- 10 KB input cap on the FTS query string (same defensive limit as memory FTS).

### Piece 4 — Ingest layer — `extractFacts` populates new fields

In `arcana-core/src/ingest/`:
- `extractFacts(memory)` LLM prompt change: ask for `entities: string[]`, `category: FactCategory`, propagate `sourceMemoryId = memory.id`, carry `sourcePath` / `sourceConversationId` from memory metadata when present.
- The prompt format and parsing port from KB's extraction shape — read `kyberbot/packages/cli/src/brain/extract-facts.ts` (or wherever the extraction prompt lives in KB) and port verbatim.
- Validation: facts with empty `entities` rejected (KB invariant); category defaults to `'general'`.

### Piece 5 — `factRetrieval` algorithm — 5th layer (direct fact-FTS) + rich bundle return

In `arcana-core/src/retrieve/`:
- Add **Layer 0: Direct fact-FTS** — runs first, ahead of the existing 4 layers (direct memory FTS, entity expansion, graph expansion, bridge). Calls `searchFactsFulltext`, scores `0.5 + matchRatio * 0.5` (KB convention).
- Layer 0 results carry `why: 'fact-retrieval/direct_facts'`.
- Source-layer priority updated: `bridge > direct_facts > direct > entity_expansion > graph_expansion`.
- Return shape changes from `HybridSearchResult[]` to:
  ```ts
  interface FactRetrievalResult {
    facts: ScoredFact[];                  // direct fact hits
    supportingMemories: HybridSearchResult[];  // memory-shaped, via the 4 memory layers
    assembledContext: string;             // concatenated, token-budgeted
    tokenEstimate: number;                // rough token count of assembledContext
    stats: {
      perLayerCounts: Record<string, number>;
      totalCandidates: number;
      deduplicatedCount: number;
    };
  }
  ```
- Port shape verbatim from KB's `factRetrieval` return — read KB `fact-retrieval.ts` to confirm field names.

## 3. Out of Scope

- Sleep pipeline implementation (next sprint after this).
- v2 sleep additional steps (the Arcana-invented 4 steps) — separate sprint.
- KB consumer swap — KB does it when ready, gated by `runParityHarness` per ADR 009.
- Postgres / Convex provider impls of `searchFactsFulltext` — those providers don't exist yet.
- npm publish — David runs OTP.

## 4. Definition of Done

`git log --oneline -2` shows feat + chore commits pushed to `origin/main`. `git tag v1.0.0` pushed. `bun run build` exits 0. `bun run test` exits 0 with ≥ 295 tests (275 baseline + ~20 new for the five pieces). All 6 packages bumped to 1.0.0. CHANGELOG.md v1.0.0 section. Mochaccino refreshed. Comms entry appended. npm publish NOT executed.

## 5. Acceptance Criteria

| # | Criterion | How to check |
|---|---|---|
| 1 | `FactSchema` has `entities: string[]`, `sourceMemoryId?`, `sourcePath?`, `sourceConversationId?`, `category` (required, enum); `entity` removed | `grep -A 30 "FactSchema" packages/arcana-contracts/src/fact.ts` |
| 2 | `FactCategorySchema` enum has 8 members matching KB `fact-store.ts:38-46` verbatim | enum test |
| 3 | `widenLegacyFact` helper exported for migration | round-trip test |
| 4 | `StructuredStore.searchFactsFulltext(opts)` declared in contract | TS compile |
| 5 | libsql migration adds new columns + `facts_fts` virtual table + 4 triggers + 3 indices on `connect()` | inspect DB schema after connect |
| 6 | libsql `searchFactsFulltext` returns scored `FulltextMatch[]` with matchedFields populated | integration test |
| 7 | `ingest.extractFacts` populates new fields; rejects empty `entities`; defaults `category` to `'general'` | unit tests |
| 8 | `factRetrieval` has Layer 0 (direct fact-FTS) running before existing 4 layers | inspect impl + test |
| 9 | Source-layer priority is `bridge > direct_facts > direct > entity_expansion > graph_expansion` | priority resolution test |
| 10 | Return shape is `FactRetrievalResult` (facts + supportingMemories + assembledContext + tokenEstimate + stats) — NOT `HybridSearchResult[]` | shape test |
| 11 | Token estimate computed via `Math.ceil(assembledContext.length / 4)` (KB convention) | unit test |
| 12 | All 6 packages at 1.0.0 | grep versions |
| 13 | `bun run build` exits 0 | exit code |
| 14 | `bun run test` exits 0 with ≥ 295 tests | exit code + count |
| 15 | CHANGELOG.md v1.0.0 section references ADR 013 + ADR 011 + lists 5 breaking schema changes | grep |
| 16 | Mochaccino refreshed — 04-contracts-surface (Fact evolution row), 06-kernel-methods (test count + sprint summary); views re-rendered | inspect files |
| 17 | Comms entry appended dated 2026-05-22 to `~/dev/kybernesis/.comms/arcana-kyberbot.md` — v1.0.0, breaking, parity expectation 100% on KB's fact fixtures, default action to KB: bring fixtures + invoke parity harness | tail comms file |
| 18 | Two commits on main — feat (5 pieces + docs + mochaccino + comms) then chore (6 version bumps) | `git log --oneline -2` |
| 19 | Tag v1.0.0 created and pushed | `git ls-remote --tags origin v1.0.0` |
| 20 | Findings appendix populated with concrete port-time resolutions for: KB extraction prompt shape, multi-entity handling on legacy facts, FTS5 trigger ordering, rich-bundle field names, token-estimate divisor | appendix populated |

## 6. Key References

- This plan: `docs/plans/2026-05-22-v2-fact-retrieval.md`
- KB source of truth (READ FIRST): `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/fact-store.ts` + `fact-retrieval.ts` + extract-facts impl
- ADR 013 (sequencing): `docs/decisions/013-fact-schema-deepening-before-sleep.md`
- ADR 011 (port-first): `docs/decisions/011-port-first-improve-later.md`
- Existing factRetrieval (v0.4.1): `packages/arcana-core/src/retrieve/index.ts`
- v0.4.1 Findings (schema-depth inventory): `docs/plans/2026-05-21-fact-retrieval-rebase.md`
- Memory-FTS reference impl: `packages/arcana-provider-libsql/src/index.ts` (`searchFulltext` + `memories_fts`)

## Findings appendix

_Populated by the goal-runner during the port. Resolutions cite KB file:line + Arcana code location._

- KB extraction prompt shape — read KB's extract-facts impl and port verbatim
- Multi-entity handling on existing facts in tests — `widenLegacyFact` wraps `entity → [entity]`
- FTS5 trigger ordering on UPDATE — KB uses delete+insert (claude.ts pattern); confirm
- Rich-bundle field names — port verbatim from KB `factRetrieval` return
- Token-estimate divisor — KB uses `length / 4` (rough chars-per-token); confirm
