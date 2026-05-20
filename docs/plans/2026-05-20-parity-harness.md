# Plan — Parity Harness in `@kybernesis/arcana-testkit` (v0.3.0)

**Date**: 2026-05-20
**Mode**: code
**Driving session**: arcana-library
**Related**: docs/decisions/009-parity-gate-for-consumer-swaps.md (this builds the shared harness named in §"Future evolution")

## 1. Stack

- Arcana monorepo at `/Users/davidcruwys/dev/kybernesis/arcana`
- Target package: `@kybernesis/arcana-testkit` (currently exposes fakes only)
- Bun 1.3.10 / Vitest 4.1 / TypeScript 5.9 strict / ESLint 10
- All 5 packages currently at v0.2.1; this sprint bumps to v0.3.0 (minor — new public API export)
- Existing testkit shape: `packages/arcana-testkit/src/fakes/*.ts` + `packages/arcana-testkit/src/index.ts` re-exports; subpath export `./fakes` already declared in its `package.json`
- ADR 009 is the spec; no design decisions are pending

## 2. In Scope

### Core deliverable — `runParityHarness` utility

New module at `packages/arcana-testkit/src/parity/index.ts` exposing a generic, retrieval-shaped harness that compares two implementations on a query corpus:

```ts
export interface ParityHarnessInput<TResult, TId = string> {
  /** Named query corpus. Caller seeds any fixtures into the stores
   *  themselves before invoking the harness. */
  queries: Array<{ id: string; input: unknown }>;

  /** The proven-working impl (e.g. KyberBot's local hybrid-search.ts). */
  baseline: (input: unknown) => Promise<TResult>;

  /** The candidate impl (e.g. arcana.retrieve.hybridSearch). */
  candidate: (input: unknown) => Promise<TResult>;

  /** Extract the comparable identity from each result row. Typically
   *  memory id, source path, or whatever the consumer uses to dedup. */
  extractIds: (result: TResult) => TId[];

  /** Top-N depth to compare. Default 10. */
  topN?: number;

  /** Overlap threshold (0..1) below which the report fails. Default 0.8. */
  threshold?: number;
}

export interface ParityReport<TId = string> {
  passes: boolean;
  threshold: number;
  topN: number;
  meanOverlap: number;
  totalQueries: number;
  perQuery: Array<{
    queryId: string;
    overlap: number; // 0..1, fraction of baseline top-N also in candidate top-N
    baselineIds: TId[];
    candidateIds: TId[];
    missingFromCandidate: TId[];
    extraInCandidate: TId[];
    error?: { side: 'baseline' | 'candidate'; message: string };
  }>;
}

export async function runParityHarness<TResult, TId = string>(
  input: ParityHarnessInput<TResult, TId>,
): Promise<ParityReport<TId>>;
```

### Subpath export

Add `"./parity"` to `packages/arcana-testkit/package.json` `exports` field, mirroring the existing `./fakes` shape.

### Tests

New test file `packages/arcana-testkit/src/parity/index.test.ts`. Cover:

- **Passing case**: synthetic baseline + candidate returning largely overlapping ids → `passes: true`, high `meanOverlap`.
- **Failing case**: baseline + candidate returning disjoint ids → `passes: false`, low `meanOverlap`.
- **Partial overlap**: 8 of 10 match → exactly at default threshold → `passes: true`.
- **Per-query diff tracking**: `missingFromCandidate` and `extraInCandidate` correctly populated.
- **Empty corpus**: 0 queries → `meanOverlap: 0`, `passes: false` (cannot prove parity with no evidence).
- **Baseline throws**: candidate still runs; error recorded in `perQuery[i].error.side === 'baseline'`; that query counted as 0 overlap toward mean.
- **Candidate throws**: symmetric — error recorded with `side: 'candidate'`.
- **Custom threshold**: caller-supplied 0.5 with 0.6 overlap → passes; same with threshold 0.7 → fails.
- **Custom topN**: top-5 comparison ignores results 6-10 even if those would match.
- **Non-array result handling**: `extractIds` returning empty array → 0 overlap for that query.

### Documentation

- `packages/arcana-testkit/README.md` — add a "Parity harness" section with usage example (KyberBot hybrid-search swap scenario as the worked example).
- Reference `docs/decisions/009-parity-gate-for-consumer-swaps.md` for methodology context.

### Mochaccino refresh

- `05-testkit-compliance.json` — add a "parity harness" section to the testkit row; bump milestone to v0.3.0.
- `06-kernel-methods.json` — bump test count, note v0.3.0 in summary.
- View regeneration: `kernel-methods.html` (test count + headline), `index.html` (tagline + stats + done-strip), `publish-pipeline.html` (v0.3.0 pending lane).

### CHANGELOG.md

Add v0.3.0 entry naming:
- New `@kybernesis/arcana-testkit/parity` export
- Reference to ADR 009 §"Future evolution"
- Note that this is the *shared* harness — consumers (KyberBot, Brain) still bring their own fixtures + implementations

### Comms entry to KyberBot

Append to `~/dev/kybernesis/.comms/arcana-kyberbot.md`. Tells KyberBot:
- v0.3.0 ships `runParityHarness` as a public testkit export
- Usage example: how to wire `kybernesisHybridSearch` and `arcana.retrieve.hybridSearch` into the harness with a fixture corpus
- Reminder of the parity-audit finding from v0.2.1 (60–75% expected overlap on the channel-topology divergence)
- Default action: when convenient, author a parity test in KyberBot's repo using this harness; bounce-back via QUESTION if they want our help designing the fixture corpus

### Version bump + ship

- All 5 packages bumped 0.2.1 → 0.3.0 (minor — new public API export warrants minor under semver)
- `feat` commit with harness + tests + docs + mochaccino + comms
- `chore` commit with version bumps
- `git tag v0.3.0`
- `git push origin main && git push origin v0.3.0`
- STOP before npm publish (OTP browser flow — hand back to user)

## 3. Out of Scope

- **Running an actual parity test against KyberBot's real data** — KyberBot's fixtures and its `hybrid-search.ts` live in its own repo; harness gives them the tool, they bring the test
- **Order-aware scoring** (NDCG@k, Spearman ρ) — ADR 009 lists this as "future evolution" beyond top-N overlap; not in this sprint
- **Failure triage tooling** (auto-generated diff reports beyond `perQuery` payload) — ADR 009 future
- **CLI wrapper** — library function is enough; consumers can wire their own runner
- **Fixture loader / seeder utilities** — caller seeds their stores before invoking the harness
- **Multi-version parity** (within-kernel regression battery) — ADR 009 future
- **npm publish** — OTP required; hand back to David
- Anything touching sleep pipeline, Brain-domain stubs, postgres provider, LLMProvider impl, or KyberBot/Brain repos

## 4. Definition of Done

`git log --oneline -2` shows a v0.3.0 feat commit + chore version-bump commit, both pushed to `origin/main`. `git tag` lists `v0.3.0` (pushed). `bun run test` exits 0 with ≥ 248 tests (238 baseline + 10 new parity harness tests). `bun run build` exits 0. `@kybernesis/arcana-testkit` package exports `./parity` subpath; `runParityHarness` is callable from a consumer importing `@kybernesis/arcana-testkit/parity`. CHANGELOG.md has a v0.3.0 section. `~/dev/kybernesis/.comms/arcana-kyberbot.md` has a fresh ARCANA → KBOT v0.3.0 entry. Mochaccino data + views reflect v0.3.0 state. The npm publish step is NOT executed.

## 5. Acceptance Criteria

| # | Criterion | How to check |
|---|---|---|
| 1 | `runParityHarness` function exists at `packages/arcana-testkit/src/parity/index.ts` and is exported | `grep -l "export.*runParityHarness" packages/arcana-testkit/src/parity/index.ts` returns the file |
| 2 | Subpath export `./parity` declared in `packages/arcana-testkit/package.json` | `node -e "console.log(require('./packages/arcana-testkit/package.json').exports['./parity'])"` prints the export entry |
| 3 | Passing-case test confirms `passes: true` when overlap ≥ threshold | New test in `parity/index.test.ts` passes |
| 4 | Failing-case test confirms `passes: false` when overlap < threshold | Same |
| 5 | Partial overlap (exactly threshold) → passes; one below → fails | Boundary tests pass |
| 6 | `missingFromCandidate` and `extraInCandidate` per-query diffs correct | Diff-tracking test passes |
| 7 | Baseline-throws and candidate-throws cases handled — error captured in `perQuery[i].error` with correct `side` | Error-side tests pass |
| 8 | Empty corpus returns `meanOverlap: 0` and `passes: false` | Empty-corpus test passes |
| 9 | Custom `threshold` and `topN` honored | Custom-config tests pass |
| 10 | All 5 packages bumped to 0.3.0 | `grep -h '"version"' packages/*/package.json` reports `0.3.0` for all five |
| 11 | `bun run build` succeeds | Exit code 0 |
| 12 | `bun run test` succeeds with ≥ 248 tests | Exit code 0; count check |
| 13 | CHANGELOG.md has v0.3.0 section referencing ADR 009 | `grep -A 2 "v0.3.0" CHANGELOG.md` returns expected content |
| 14 | Comms entry appended dated 2026-05-20 | `tail ~/dev/kybernesis/.comms/arcana-kyberbot.md` shows ARCANA → KBOT v0.3.0 entry |
| 15 | Mochaccino data files reflect v0.3.0 testkit feature | `grep "parity" .mochaccino/data/05-testkit-compliance.json` returns hits |
| 16 | Tag pushed | `git ls-remote --tags origin v0.3.0` returns the tag |
| 17 | npm publish NOT executed | `npm view @kybernesis/arcana-testkit@0.3.0 version` returns 404 / not found |
| 18 | Two commits on main: feat + chore | `git log --oneline -2` shows both |

## 6. Key References

- This plan: `/Users/davidcruwys/dev/kybernesis/arcana/docs/plans/2026-05-20-parity-harness.md`
- Methodology spec: `/Users/davidcruwys/dev/kybernesis/arcana/docs/decisions/009-parity-gate-for-consumer-swaps.md`
- Previous sprint (sets up the channel-topology context): `/Users/davidcruwys/dev/kybernesis/arcana/docs/plans/2026-05-20-tier1-tier2-facades-and-audits.md` (Findings appendix)
- Testkit package: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-testkit/`
- Testkit fake pattern to mirror for style: `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-testkit/src/fakes/structured-store.ts`
- Testkit package.json (for subpath export shape): `/Users/davidcruwys/dev/kybernesis/arcana/packages/arcana-testkit/package.json`
- Comms log: `/Users/davidcruwys/dev/kybernesis/.comms/arcana-kyberbot.md`
- Mochaccino data: `/Users/davidcruwys/dev/kybernesis/arcana/.mochaccino/data/05-testkit-compliance.json`
- Mochaccino view: `/Users/davidcruwys/dev/kybernesis/arcana/.mochaccino/views/index.html`

## Findings appendix

_Reserved for any defensive findings or design surprises surfaced during implementation._
