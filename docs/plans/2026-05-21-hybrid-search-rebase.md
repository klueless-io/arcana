# Plan — Rebase Arcana's `hybridSearch` onto KyberBot's behaviour (v0.4.0)

**Date**: 2026-05-21
**Mode**: code
**Driving session**: arcana-library
**Related**:
- docs/decisions/009-parity-gate-for-consumer-swaps.md (the methodology that surfaces parity gaps)
- docs/audits/sleep-pipeline-gap-analysis.md (the same code-concept-divergence pattern in sleep)
- docs/plans/2026-05-20-fts-and-hybridsearch.md §4 (the v0.2.0 wave-1 result shape — still correct)
- New ADR 011 written as part of this sprint

## 1. Stack

- Arcana monorepo at `/Users/davidcruwys/dev/kybernesis/arcana`
- KyberBot reference implementation at `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/hybrid-search.ts` (the *empirical* implementation; source of truth for behaviour)
- Bun 1.3.10 / Vitest 4.1 / TypeScript 5.9 strict / ESLint 10
- All 5 packages currently at v0.3.1; this sprint bumps to v0.4.0 (minor — internal-logic rewrite of a public method; backward-compatible result shape but new channel semantics)
- Parity harness available at `@kybernesis/arcana-testkit/parity` (v0.3.0+) — used to *verify* the port

## 2. In Scope

### Architecture principle — ADR 011

Write `docs/decisions/011-port-first-improve-later.md` capturing the policy this sprint codifies. Headline:

> KyberBot is the empirical implementation of the brain. Arcana is the portable brain library, sourced from KyberBot's working code. For every brain capability: **port KyberBot's logic faithfully first**, prove 100% data parity, swap KyberBot to consume the kernel, and *then* improve. Speculative redesigns ship behind a flag or in a v2, never as the v1 port.

This ADR governs all future capability work (sleep pipeline next, then any remaining read-path divergences). It also retroactively rationalises this rebase.

### Schema addition — `Memory.createdAt`

The temporal channel needs a memory timestamp. Today `memories` has `lastAccessedAt?` but no `createdAt`. Add it as part of this sprint:

- `MemorySchema.createdAt: string` — required, ISO 8601. Add to `packages/arcana-contracts/src/memory.ts`.
- `ingest.storeMemory` populates `createdAt: new Date().toISOString()` if the caller doesn't supply one.
- `arcana-provider-libsql` schema: `created_at TEXT NOT NULL` in the `memories` DDL.
- Migration for existing v0.3.x databases on connect: `ALTER TABLE memories ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))` if the column doesn't exist. Done idempotently via `PRAGMA table_info` check or simple try/catch.
- Test fixtures across the codebase that construct raw `Memory` objects gain `createdAt: '2026-05-21T00:00:00.000Z'` (or similar).
- libsql `memoryToRow` / `rowToMemory` map the field both ways.
- Testkit fake unchanged at the API level (stores whatever Memory it's given).

### Capability rebase — `retrieve.hybridSearch`

Replace the internal logic of `arcana-core/src/retrieve/index.ts → hybridSearch` so it matches KyberBot's `hybrid-search.ts` behaviour. The wave-1 `HybridSearchResult` shape is already KB-aligned; *only* the channel topology and scoring changes.

**Channel topology — out with the v0.2.0 invention, in with the KB-faithful set:**

| v0.2.0 (drop) | v0.4.0 (KB-port) |
|---|---|
| semantic | semantic — unchanged |
| keyword (FTS5 via `searchFulltext`) | keyword — same provider call, same scoring |
| graph-BFS via `getNeighbors` | **temporal** — recency-ordered slice of memories |
| — | **entity-name-filter** — memories that mention entities matched by the query |

**Behavioural details to port (cite KyberBot file:line where the agent surfaced them):**

- RRF constant `k=60` (already in Arcana; matches KB hybrid-search.ts:70)
- Per-channel `topK * 3` candidate count (already in Arcana; matches KB:325)
- `MAX_SEGMENTS_PER_PARENT=3` deduplication discipline (KB:479–499) — port the *intent* (avoid one parent dominating top-K) against Arcana's `memoryId`-based dedup; document any judgment call in the Findings appendix
- Priority + tier boost on metadata scoring (KB:649, 652–654) — port to Arcana
- Optional reranker pattern (KB:540–541) — Arcana's existing optional-reranker wire is correct; keep
- `matchType` vocabulary: revert from Arcana's current `'semantic' | 'keyword' | 'graph' | 'multi'` to KB-faithful `'semantic' | 'keyword' | 'both'` (the v0.2.0 wave-1 shape promised KB-parity here; the `'graph'` value was a leak from the invented topology)

**Vestigial fields kept for shape stability:**

- `HybridSearchInput.graphHops` — silently ignored (graph-BFS retrieval scheduled for a future v2 hybridSearch; keep the field so consumers don't get a TS break)
- `HybridSearchResult.graphScore` — always `0` in v0.4.0; document the deprecation note in CHANGELOG. Remove in a future major bump.

### Tests

Update `packages/arcana-core/src/retrieve/index.test.ts`:

- Replace the existing `'graph channel expands neighbors of seed memories'` test with a new test for the temporal channel.
- Add a test for the entity-name-filter channel.
- Update the `'memory appearing in both keyword and semantic channels is marked multi'` test — `matchType` should now be `'both'` (KB vocab), not `'multi'`.
- Keep coverage for: RRF fusion, per-channel score fields, reranker hookup, per-channel failure isolation, topK respect, empty-corpus.
- Add a smoke test using `runParityHarness` from `@kybernesis/arcana-testkit/parity` with a tiny in-Arcana fixture — proves the harness wires up against the new impl. The *real* parity test against KyberBot's actual `hybrid-search.ts` lives in KyberBot's repo per ADR 009.

### Mochaccino refresh

- `06-kernel-methods.json` — update `hybridSearch` notes to reflect the rebase; update `[searchFulltext provider]` notes to mention temporal channel; bump test count.
- `kernel-methods.html` — same.
- `index.html` — tagline → v0.4.0, test count, done-strip.
- `03-publish-pipeline.json` — add v0.4.0 lane (status `not_started` pending OTP).
- `publish-pipeline.html` — bump package version chips + tagline + add lane.

### CHANGELOG.md

v0.4.0 section explaining:
- The rebase rationale (ADR 011)
- Channel topology change (3 → 4 KB-faithful)
- `matchType` vocab change (`'graph' | 'multi'` removed; `'both'` restored)
- `graphHops` + `graphScore` deprecated (still accepted/emitted as 0)
- Reference to the new ADR 011

### Comms entry

Append to `~/dev/kybernesis/.comms/arcana-kyberbot.md`. Tells KyberBot:
- v0.4.0 rebases `hybridSearch` onto KB's logic (4 channels: semantic + keyword + temporal + entity-name-filter)
- Parity expectation has *changed*: 100% (not 60–75% as the v0.2.1 audit predicted), because the algorithm is now ported faithfully
- The deprecated fields (`graphHops`, `graphScore`) are still emitted for shape stability
- Default action: when KyberBot authors the parity test, expect 100% overlap; any deviation is a port bug, not a tolerable divergence
- ADR 011 is the new governing principle for all future capability work

### Ship sequence

- Two commits on `main`: a `feat` with the rebase + tests + ADR 011 + docs + mochaccino + comms, then a `chore` with the version bump.
- `git tag v0.4.0`
- `git push origin main && git push origin v0.4.0`
- STOP before npm publish (OTP — hand back to David).

## 3. Out of Scope

- **Sleep pipeline rebase** — same principle applies (port KB's 10 steps as v1, queue Arcana's 4 additional steps for v2), but it's a separate sprint. ADR 010 stays open until that sprint runs.
- **`factRetrieval` rebase** — also a separate sprint when ready.
- **`getEntityProfile` generalisation reduction** — same.
- **Resurrecting graph-BFS** — that's the v2 hybridSearch feature, deferred. Keep `getNeighbors` provider method (it's still used by `factRetrieval` for memory-neighbor expansion and may have other callers).
- **Changing the `HybridSearchResult` shape** — wave-1 KB-parity already correct; no contract change.
- **Changing `StructuredStore.searchFulltext` contract** — same; provider surface unchanged.
- **npm publish** — OTP browser flow; David runs it.
- **KyberBot or Brain repo changes** — none.

## 4. Definition of Done

`git log --oneline -2` shows a `feat` rebase commit + `chore` version-bump commit, both pushed to `origin/main`. `git tag` lists `v0.4.0` (pushed). `bun run build` exits 0. `bun run test` exits 0 with ≥ 256 tests (254 baseline + new tests minus replaced graph test, net ~+2 to +4). `docs/decisions/011-port-first-improve-later.md` exists and is referenced from CHANGELOG + the comms entry. `packages/arcana-core/src/retrieve/index.ts` `hybridSearch` no longer references `getNeighbors` for graph expansion; channel topology is keyword + semantic + temporal + entity-name-filter. The `'graph'` value is removed from `matchType`; `'both'` is restored. `graphHops` accepted but ignored; `graphScore` emitted as `0`. Mochaccino reflects v0.4.0 state. Comms entry appended. npm publish NOT executed.

## 5. Acceptance Criteria

| # | Criterion | How to check |
|---|---|---|
| 1 | `hybridSearch` uses 4 channels: semantic + keyword + temporal + entity-name-filter | Inspect `packages/arcana-core/src/retrieve/index.ts`; no call to `structured.getNeighbors` from inside `hybridSearch` |
| 2 | `matchType` vocab restored to `'semantic' \| 'keyword' \| 'both'` | TypeScript signature reflects this; `'graph'` and `'multi'` removed |
| 3 | `graphHops` input still accepted (no TS break for consumers); silently ignored | Test confirms passing `graphHops: 5` produces same result as omitting it |
| 4 | `graphScore: 0` on every result | Test confirms |
| 5 | Tests cover the temporal channel (recency-ordered) | New test in `retrieve/index.test.ts` |
| 6 | Tests cover the entity-name-filter channel | New test |
| 7 | Existing RRF-fusion, reranker, failure-isolation, topK tests still pass | Vitest exit 0 |
| 8 | `runParityHarness` smoke test against the new impl exists | Test imports from `@kybernesis/arcana-testkit/parity` and asserts `passes: true` against a same-impl baseline (sanity check; real KB parity lives in KyberBot's repo) |
| 9 | All 5 packages bumped to 0.4.0 | `grep -h '"version"' packages/*/package.json` reports `0.4.0` |
| 10 | `bun run build` succeeds | Exit code 0 |
| 11 | `bun run test` succeeds with ≥ 256 tests | Exit code 0; count check |
| 12 | CHANGELOG.md has v0.4.0 section referencing ADR 011 | `grep -A 2 "v0.4.0" CHANGELOG.md` returns expected content |
| 13 | ADR 011 exists at `docs/decisions/011-port-first-improve-later.md` | File present; references this sprint as its first application |
| 14 | Comms entry appended dated 2026-05-21 | `tail ~/dev/kybernesis/.comms/arcana-kyberbot.md` shows ARCANA → KBOT v0.4.0 entry |
| 15 | Mochaccino reflects v0.4.0 + new channel topology | `grep "temporal" .mochaccino/data/06-kernel-methods.json` returns hits |
| 16 | Tag pushed | `git ls-remote --tags origin v0.4.0` returns the tag |
| 17 | npm publish NOT executed | `npm view @kybernesis/arcana-core@0.4.0 version` returns 404 |
| 18 | Two commits on main: feat + chore | `git log --oneline -2` shows both |

## 6. Key References

- This plan: `/Users/davidcruwys/dev/kybernesis/arcana/docs/plans/2026-05-21-hybrid-search-rebase.md`
- KyberBot reference (source of truth for behaviour): `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/hybrid-search.ts`
- KyberBot reference tests: `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/hybrid-search.test.ts`
- Arcana target: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-core/src/retrieve/index.ts`
- Arcana tests: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-core/src/retrieve/index.test.ts`
- ADR 009 (parity gate methodology): `/Users/davidcruwys/dev/kybernesis/arcana/docs/decisions/009-parity-gate-for-consumer-swaps.md`
- ADR 011 (new — written this sprint): `/Users/davidcruwys/dev/kybernesis/arcana/docs/decisions/011-port-first-improve-later.md`
- Parity harness: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-testkit/src/parity/index.ts`
- Comms log: `/Users/davidcruwys/dev/kybernesis/.comms/arcana-kyberbot.md`
- Mochaccino data: `/Users/davidcruwys/dev/kybernesis/arcana/.mochaccino/data/06-kernel-methods.json`

## Findings appendix

Resolutions for the three judgment calls anticipated at planning time. All resolved during the port; no open questions carry forward.

### Finding 1 — Memory-id dedup vs KyberBot's `MAX_SEGMENTS_PER_PARENT`

**KyberBot's behavior**: dedupes search results at chunk level (each chunk is a "segment" of a longer source like a conversation) then caps the result set to `MAX_SEGMENTS_PER_PARENT = 3` segments per parent path (`kyberbot/packages/cli/src/brain/hybrid-search.ts:479–499`). This prevents a single long conversation from dominating the top-K with its own chunks at the expense of other content.

**Arcana's data model**: memories are the unit of retrieval, not chunks. The `Chunk` schema exists (with `memoryId` linking back to the parent) but `hybridSearch` operates at the memory level — `searchFulltext` returns `FulltextMatch[]` with `memoryId`, not chunk ids. There is no parent/segment hierarchy to cap *inside* the hybridSearch path.

**Resolution applied**: the `MAX_SEGMENTS_PER_PARENT` cap does not apply at Arcana's hybridSearch layer. Dedup happens at the memory-id level via the `fused = new Map<memoryId, Fused>()` map in the RRF fusion step — each memory contributes once per channel regardless of how many chunks it has. If a future chunk-level retrieval surface is added (e.g. a v2 hybridSearch that returns chunks for snippet display), the cap would apply there, not in the current memory-level API.

**Code locations**: `packages/arcana-core/src/retrieve/index.ts` — the `fused` Map keyed by `memoryId` at the fusion step is the dedup mechanism; no parent-cap logic added.

**Behavioural equivalence to KyberBot**: equivalent at the memory granularity that consumers see. A consumer asking "give me the top 10 memories" gets at most 10 distinct memories from each implementation; KyberBot's per-parent cap operates at a granularity Arcana doesn't expose, and its effect (preventing one parent from dominating) is automatic at the memory-id level since each memory is one entry.

### Finding 2 — Temporal channel implementation against Arcana's `memories` table

**KyberBot's behavior**: temporal channel orders FTS keyword matches by `timeline_events.timestamp DESC` to surface recent activity (`kyberbot/packages/cli/src/brain/hybrid-search.ts:396`). The temporal channel reuses keyword channel's *result set* with a different *ordering*.

**Arcana's data model gap at planning time**: `memories` had `lastAccessedAt?` (optional) but no `createdAt`. The temporal channel could not be implemented faithfully without a memory creation timestamp.

**Resolution applied**: added `Memory.createdAt: string` (ISO 8601, required) to `MemorySchema` as part of this sprint (see §2 Schema addition). `ingest.storeMemory` populates it via `new Date().toISOString()` when the caller doesn't supply one. libsql DDL gains `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`; existing v0.3.x databases are migrated idempotently on `connect()` via `ALTER TABLE memories ADD COLUMN created_at`. The temporal channel orders by `createdAt DESC` (string ISO compare = chronological compare).

**Code locations**:
- Contract: `packages/arcana-contracts/src/memory.ts` — `createdAt: z.string().datetime()` field
- Default population: `packages/arcana-core/src/ingest/index.ts` — `createdAt: new Date().toISOString()` in `storeMemory`
- libsql DDL + migration: `packages/arcana-provider-libsql/src/schema.ts` + the `PRAGMA table_info`-gated `ALTER TABLE` in `libsql-structured-store.ts → connect()`
- Temporal channel implementation: `packages/arcana-core/src/retrieve/index.ts` — sorts `keywordMemories` by `b.createdAt.localeCompare(a.createdAt)`

**Behavioural equivalence to KyberBot**: equivalent — both implementations re-rank the keyword channel's results by recency to produce a second RRF vote weighted toward newer content.

### Finding 3 — Entity-name-filter against Arcana's `entities` + `edges` (vs KyberBot's `entity_mentions`)

**KyberBot's behavior**: queries `entity_mentions` table where `entity_mentions.entity_name LIKE '%token%'` for each query token; returns the linked `source_path` (memory pointer) for matches (`kyberbot/packages/cli/src/brain/hybrid-search.ts:400–403`). `entity_mentions` is a denormalised table that pairs entity names directly with memory paths.

**Arcana's data model**: separates concerns across two tables — `entities` (id, name, type, ...) and `edges` (from, to, relation, ...). There is no equivalent denormalised "entity_mentions" table. Routing from entity-name match to memory ids requires:
1. Enumerating entities whose name contains a query token
2. For each matched entity, walking `edges` to find memory neighbors

Step 1 had no public method on `StructuredStore` at planning time — only `getEntity(id)` and `upsertEntity(entity)`, no enumeration or name search.

**Resolution applied**: added `StructuredStore.listEntities(filter?: EntityFilter)` to the contract. `EntityFilter` is `{ nameContains?: string; scopes?: Scopes; limit?: number }`. libsql implementation uses `WHERE LOWER(name) LIKE ?` with `%token%` substring match. Testkit fake mirrors with JS `String.includes`. The entity channel in `hybridSearch`:

1. Tokenises the query (lowercase, strip non-alphanumeric, length ≥ 3 to match KyberBot's token-length floor)
2. For each token, calls `listEntities({ nameContains: token, scopes: input.scopes, limit: 20 })`
3. For each returned entity, calls `getNeighbors({ type: 'entity', id })` and filters to memory neighbors
4. Collects memory ids (deduped), caps at `channelTopK`

**Code locations**:
- Contract: `packages/arcana-contracts/src/providers.ts` — `listEntities` on `StructuredStore`, `EntityFilter` type
- libsql impl: `packages/arcana-provider-libsql/src/libsql-structured-store.ts` — `listEntities` using `LOWER(name) LIKE`
- Testkit fake: `packages/arcana-testkit/src/fakes/structured-store.ts` — JS-side filter
- Entity channel implementation: `packages/arcana-core/src/retrieve/index.ts` — the entity-channel block inside `hybridSearch`

**Behavioural equivalence to KyberBot**: equivalent at the produced-memory-id-set level. The route differs (entities table + edges traversal vs entity_mentions direct lookup) but the SET of memory ids returned for a given query token is the same, provided the data has been correctly populated. The substring-match semantics on entity name (`LOWER(name) LIKE '%token%'`) are identical to KyberBot's.

**Note**: this is a structural rather than logical port. KyberBot's `entity_mentions` is a denormalisation of (entity, edges-where-type=memory) into a single table; Arcana keeps the normalisation. If profiling later shows the two-step lookup is slow on large brains, a future v2 could add a denormalised `entity_memory_mentions` view/table to match KyberBot's shape — but for v1 parity, the normalised route is correct.
