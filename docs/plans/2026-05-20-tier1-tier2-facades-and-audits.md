> **[SHIPPED in v0.2.1 + v0.3.1]** — historical reference. Live state lives in [CHANGELOG.md](../../CHANGELOG.md).

# Plan — Tier 1 + Tier 2 (v0.2.1 facades + read-only audits)

**Date**: 2026-05-20
**Mode**: code
**Driving session**: arcana-library
**Related**: docs/plans/2026-05-20-fts-and-hybridsearch.md (just shipped as v0.2.0)

## 1. Stack

- Arcana monorepo at `/Users/davidcruwys/dev/kybernesis/arcana`
- Bun 1.3.10 for dev/test; pnpm for publishing
- TypeScript 5.9 strict; Vitest 4.1 (`bun run test`); ESLint 10 (`bun run lint`); `tsc -b` build
- 5 packages: `@kybernesis/arcana-{contracts,core,testkit,provider-libsql,provider-sqlite-vec}` — all live at v0.2.0
- Mochaccino dashboard at `.mochaccino/` — data files drive HTML views
- Comms log at `~/dev/kybernesis/.comms/arcana-kyberbot.md` — Arcana ↔ KyberBot cross-session protocol

## 2. In Scope

### Tier 1 — three query-zone facades + ship v0.2.1

- Implement `query.getNeighbors(node, hops?)` — thin facade over `structured.getNeighbors`, wrap in `QueryResult` envelope
- Implement `query.listContradictions(status?)` — thin facade over `structured.listContradictions`, wrap in envelope
- Implement `query.listInsights(entityId?)` — thin facade over `structured.listInsights`, wrap in envelope
- Tests for all three in `packages/arcana-core/src/access/query/index.test.ts` (remove the `still-stubbed` block for these three; add positive + negative cases each)
- Bump all 5 packages 0.2.0 → 0.2.1
- Append v0.2.0 and v0.2.1 sections to `CHANGELOG.md`
- Refresh `.mochaccino/data/06-kernel-methods.json` — flip the three stubs to ✓; bump test count
- Refresh `.mochaccino/views/kernel-methods.html` — flip stub badges to ✓; bump headline counters (17 → 20 implemented, 11 → 8 stubbed)
- Refresh `.mochaccino/views/index.html` stats (test count, implemented count)
- Append v0.2.1 entry to `~/dev/kybernesis/.comms/arcana-kyberbot.md` with the `arcana.providers.structured.*` escape hatch note
- Commit, tag `v0.2.1`, push commits + tag to origin

### Tier 2 — two read-only Explore agents in parallel

- Agent A: audit `packages/arcana-provider-libsql/src/libsql-structured-store.ts` `buildFtsQuery` for FTS5 syntax-injection edge cases (quotes, NEAR, column filters, operators)
- Agent B: cross-check `packages/arcana-core/src/retrieve/index.ts` hybridSearch RRF impl against KyberBot's `kyberbot/packages/cli/src/brain/hybrid-search.ts` for behavioural parity — report deltas, not a full parity harness
- If either agent surfaces a material finding, fold into the Tier 1 commit before tagging

## 3. Out of Scope

- `npm publish` (requires OTP browser flow — hand back to user)
- ADR 010 resolution (sleep step gap — design decision belongs to David)
- Sleep pipeline implementation (`runSleepPipeline`, `startSleepSchedule`, `stopSleepSchedule`)
- Brain-domain stubs (`readBlock`, `getBlockHistory`, `updateBlock`)
- No-demand stubs (`deleteMemory`, `stats`)
- LLMProvider concrete impl (architectural — reranker/LLM collapse decision belongs to David)
- `arcana-provider-postgres` scaffold (Postgres driver choice belongs to David)
- Any change to KyberBot or Brain repos

## 4. Definition of Done

`git log --oneline -1` shows a v0.2.1 commit, `git tag` lists `v0.2.1`, both pushed to `origin/main`. `bun run test` reports 232+ tests passing (will be ~245 after the new facade tests). `.mochaccino/data/06-kernel-methods.json` shows `getNeighbors`, `listContradictions`, `listInsights` with `status: "implemented"`. `CHANGELOG.md` has v0.2.0 and v0.2.1 entries. `~/dev/kybernesis/.comms/arcana-kyberbot.md` has a fresh ARCANA → KBOT entry dated 2026-05-20. The npm publish step is NOT executed.

## 5. Acceptance Criteria

| # | Criterion | How to check |
|---|---|---|
| 1 | `query.getNeighbors` returns `QueryResult<NodeRef[]>` for a node with neighbors | Vitest passes the new positive test in `access/query/index.test.ts` |
| 2 | `query.listContradictions(status?)` returns `QueryResult<Contradiction[]>`, respects status filter | New tests cover both no-filter and `status='pending'` |
| 3 | `query.listInsights(entityId?)` returns `QueryResult<Insight[]>`, respects entity filter | New tests cover both no-filter and entity-scoped |
| 4 | No method throws `NotImplementedError` for these three | The `still-stubbed query methods` block in the test file no longer asserts on these three |
| 5 | All 5 packages bumped to 0.2.1 | `grep -E '"version"' packages/*/package.json` reports `0.2.1` for all five |
| 6 | `bun run build` succeeds with no TS errors | Exit code 0 |
| 7 | `bun run test` reports all tests passing | Exit code 0; count ≥ 232 + 6 new (per facade ~2 tests minimum) |
| 8 | `.mochaccino/data/06-kernel-methods.json` reflects implementations | `getNeighbors`, `listContradictions`, `listInsights` show `"status": "implemented"` with `"driven_by"` populated |
| 9 | HTML view consistent with data | `.mochaccino/views/kernel-methods.html` shows ✓ done for the three; headline numbers updated |
| 10 | CHANGELOG.md has v0.2.0 + v0.2.1 sections | File contains both version headings with dates and notes |
| 11 | Comms entry appended | `tail ~/dev/kybernesis/.comms/arcana-kyberbot.md` shows ARCANA → KBOT 2026-05-20 v0.2.1 entry |
| 12 | Tag pushed | `git ls-remote --tags origin v0.2.1` returns the tag |
| 13 | npm publish NOT executed | `npm view @kybernesis/arcana-contracts@0.2.1 version` returns 404 / not found |
| 14 | Tier 2 agent findings recorded | If either Explore agent reported material issues, they either landed in the v0.2.1 commit OR are documented in this plan's "Findings" appendix |

## 6. Key References

- This plan: `/Users/davidcruwys/dev/kybernesis/arcana/docs/plans/2026-05-20-tier1-tier2-facades-and-audits.md`
- Sprint predecessor: `/Users/davidcruwys/dev/kybernesis/arcana/docs/plans/2026-05-20-fts-and-hybridsearch.md`
- Parity-gate methodology: `/Users/davidcruwys/dev/kybernesis/arcana/docs/decisions/009-parity-gate-for-consumer-swaps.md`
- Sleep step gap (out of scope but referenced): `/Users/davidcruwys/dev/kybernesis/arcana/docs/decisions/010-sleep-pipeline-step-reconciliation.md`
- Query zone source: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-core/src/access/query/index.ts`
- Query zone tests: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-core/src/access/query/index.test.ts`
- FTS audit target: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-provider-libsql/src/libsql-structured-store.ts`
- Hybrid search audit target: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-core/src/retrieve/index.ts`
- KyberBot reference: `/Users/davidcruwys/dev/kybernesis/kyberbot/packages/cli/src/brain/hybrid-search.ts`
- Comms log: `/Users/davidcruwys/dev/kybernesis/.comms/arcana-kyberbot.md`
- Mochaccino data: `/Users/davidcruwys/dev/kybernesis/arcana/.mochaccino/data/06-kernel-methods.json`
- Mochaccino view: `/Users/davidcruwys/dev/kybernesis/arcana/.mochaccino/views/kernel-methods.html`

## Findings appendix

### Agent A — FTS5 syntax-injection audit (`buildFtsQuery`)

**Verdict: syntactically safe.** The lowercase + `[^\p{L}\p{N}]` strip + double-quote-escape pipeline neutralises every FTS5 operator class — `AND/OR/NOT/NEAR` become literal search tokens, column filters (`title:foo`) are stripped before they reach the parser, wildcards/boosts (`*`, `^`, `()`) are removed, embedded quotes are properly escaped. The resulting expression is always of form `"t1" OR "t2" OR ... OR "tN"` or `null` (zero tokens). No malformed FTS5 expressions reach SQLite; no operator injection possible.

**One defensive recommendation applied this sprint**: unbounded input length is a DoS vector (tokenizer + memory scale linearly). Added a 10 KB input cap (`MAX_FTS_QUERY_LENGTH = 10_000`); inputs over that limit return `null` (same as empty-query semantics) instead of allocating arbitrarily large token arrays. See `packages/arcana-provider-libsql/src/libsql-structured-store.ts`.

**Edge cases worth noting (no action needed — current behaviour is correct):**
- All-punctuation input → 0 tokens → `null` → empty result set (silent, but correct).
- Unicode marks: `\p{L}` preserves Arabic, Hebrew, CJK, accented Latin. Standalone combining marks not in a grapheme cluster *may* be stripped — acceptable for FTS semantics.

### Agent B — Hybrid search behavioural cross-check vs KyberBot

**Verdict: shape parity holds; channel topology diverges.** The wave-1 `HybridSearchResult` field layout matches KyberBot's existing output, but the channels driving those fields are not the same set:

| Channel topology | Arcana | KyberBot |
|---|---|---|
| Channels | semantic + keyword(FTS5) + graph(BFS) | semantic + keyword(FTS5) + temporal + entity-name-filter |
| `matchType` vocab | `'semantic' \| 'keyword' \| 'graph' \| 'multi'` | `'semantic' \| 'keyword' \| 'both'` |
| Graph traversal | BFS over `edges`, configurable `graphHops` | None — entity match is a name-mention filter, no BFS |
| Per-channel scores | `semanticScore`, `keywordScore`, `graphScore` | `semanticScore`, `metadataScore`, `hybridScore` (RRF contrib reused for metadata + temporal) |

**Confirmed identical**: RRF constant `k=60`; per-channel `topK * 3` candidate count; reranker integration pattern (conditional on `rerank=true` + provider supplied); score-zero-when-absent semantics.

**Parity-test implication for KyberBot's eventual swap (per ADR 009):** top-10 overlap will likely fall in the 60–75% range without further reshaping. The wave-1 shape was chosen for swap *adaptation* cost, not output *equivalence*. The parity harness (KyberBot-side, ADR 009) will need to either accept that range as "improved enough" or commission a wave-2 evolution that exposes 4 channels explicitly (semantic + keyword + temporal + entity).

**No code change applied this sprint** — this is a documentation/expectation-setting finding. The wave-1 shape is intentional and correct; the channel divergence is a feature of the kernel rewrite, not a defect.

**Action items recorded** (not in scope today):
- ADR 009's parity harness scaffolding (when built) should support reporting per-channel attribution diffs, not just top-N overlap.
- A future ADR may consider whether Arcana's 3-channel topology should be widened to 4 channels (split keyword from temporal) to match KyberBot's surface area.

