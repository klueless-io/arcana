# Session Checkpoint — 2026-05-23

Handover for the next Claude Code session. This session shipped v1.2.1 (KB-faithful Layer 0 scoring fix) and v2.0.0 (library renamed Arcana → Cortex). The next session likely opens from `~/dev/kybernesis/cortex/` after David renames the local directory.

## Right-now state

### Code
- Branch: `main`
- HEAD: `a71d133` — `feat!: v2.0.0 — rename library Arcana → Cortex (BREAKING)`
- Tag `v2.0.0` pushed to origin
- 352 tests passing; `bun run build` exits 0
- Working tree: clean (this handover file is the only outstanding change)

### npm — both names live in parallel
**Cortex (current, v2.0.0):**
- `@kybernesis/cortex-contracts@2.0.0` ✓
- `@kybernesis/cortex-core@2.0.0` ✓
- `@kybernesis/cortex-testkit@2.0.0` ✓
- `@kybernesis/cortex-provider-libsql@2.0.0` ✓
- `@kybernesis/cortex-provider-sqlite-vec@2.0.0` ✓
- `@kybernesis/cortex-provider-llm-claude-code@2.0.0` ✓

**Arcana (legacy, last at v1.2.1):**
- All 6 `@kybernesis/arcana-*` packages still live at v1.2.1 — **not yet deprecated**. See "Pending manual" below.

### GitHub + git remote
- Repo renamed: `klueless-io/arcana` → `klueless-io/cortex` ✓
- Local remote updated: `git remote -v` → `git@github.com:klueless-io/cortex.git` ✓
- `git ls-remote origin` works against the new URL ✓

### Local directory
- **Still at `~/dev/kybernesis/arcana`** — David's pending rename
- When this rename happens, the current Claude session breaks (binds to absolute path); new session starts in `~/dev/kybernesis/cortex/`

### Syncthing
- Verified directly: syncthing is **NOT** replicating this folder. PLAN.md historical section claims otherwise — that note is stale, predates v0.1.1 npm publish. Worth correcting in PLAN.md whenever someone touches it.

## What shipped this session (chronological)

### v1.2.1 — KB-faithful Layer 0 scoring (`888721b` + `9593644`)
Driven by KyberBot's parity-harness reports (2026-05-22 13:30 + 15:00). Pattern 2/3 traced to an Arcana-side scoring miss: BM25-derived FTS5 rank gave entity-only matches an unfair boost over content-matches. Per ADR 011 port-first, switched Layer 0 scoring to KB's content-only word-match-ratio (`0.5 + wordMatchRatio * 0.5`). Backwards-compatible contract addition: `FactsFulltextMatch.content: string`. Tests 350 → 352.

### v2.0.0 — Library rename (`a71d133`)
Per ADR 014 + KyberBot comms 2026-05-23 10:30. `KybernesisAI/arcana` is Ian's cloud product at `arcana.kybernesis.ai` — couldn't keep the shared name. The library renamed to **Cortex** (the design pattern was already called "portable cortex" in the README).

Surface changes:
- 6 npm packages: `@kybernesis/arcana-*` → `@kybernesis/cortex-*`
- 6 package dirs: `packages/arcana-*/` → `packages/cortex-*/`
- Factory + types: `createArcana()` → `createCortex()`; `Arcana` → `Cortex`; `ArcanaOptions` → `CortexOptions`; `ArcanaApi` → `CortexApi`
- Logger debug strings + error messages: `'arcana.X'` / `'arcana-core: …'` → `'cortex.X'` / `'cortex-core: …'`
- All active docs, ADR 014 added, ADR README indexes it, mochaccino refreshed

No functional changes — byte-identical to v1.2.1 behaviour. Pure rename.

## Pending manual work (David)

In this order:

1. **Deprecate the 6 arcana packages on npm** — 6 commands, each needs OTP. Commands listed below. **Wait until KyberBot has bumped deps to cortex-* successfully** (otherwise their `npm install` warns about deprecated deps during the migration window).
2. **Local working directory rename** `~/dev/kybernesis/arcana` → `~/dev/kybernesis/cortex` — single `mv` (syncthing confirmed not in play). Will break the active Claude session — start fresh in the new directory.
3. **Brain doc rename** (optional, separate decision): `~/dev/ad/brains/kybernesis/arcana-spec.md` → `cortex-spec.md`. Lives outside this repo.
4. **Comms file rename** (optional, deferred decision): keep `~/dev/kybernesis/.comms/arcana-kyberbot.md` as-is for now — preserves continuity of 5000+ lines of conversation history.

### Deprecation commands

```bash
npm login   # if needed

npm deprecate "@kybernesis/arcana-contracts" "Renamed to @kybernesis/cortex-contracts at v2.0.0 — see https://github.com/klueless-io/cortex"
npm deprecate "@kybernesis/arcana-core" "Renamed to @kybernesis/cortex-core at v2.0.0 — see https://github.com/klueless-io/cortex"
npm deprecate "@kybernesis/arcana-testkit" "Renamed to @kybernesis/cortex-testkit at v2.0.0 — see https://github.com/klueless-io/cortex"
npm deprecate "@kybernesis/arcana-provider-libsql" "Renamed to @kybernesis/cortex-provider-libsql at v2.0.0 — see https://github.com/klueless-io/cortex"
npm deprecate "@kybernesis/arcana-provider-sqlite-vec" "Renamed to @kybernesis/cortex-provider-sqlite-vec at v2.0.0 — see https://github.com/klueless-io/cortex"
npm deprecate "@kybernesis/arcana-provider-llm-claude-code" "Renamed to @kybernesis/cortex-provider-llm-claude-code at v2.0.0 — see https://github.com/klueless-io/cortex"
```

Each deprecates **all published versions** of that package (11 versions for most; 3 for arcana-provider-llm-claude-code). Reversible via `npm deprecate "<pkg>" ""` (empty message).

## Pending external work (KyberBot)

KyberBot needs to do two things on their `arcana-adoption` branch:

1. **Bump deps** from `@kybernesis/arcana-*@^1.2.1` to `@kybernesis/cortex-*@^2.0.0`.
2. **Migrate symbols** in their consumer code: `createArcana` → `createCortex`, `Arcana` → `Cortex`, `'@kybernesis/arcana-` → `'@kybernesis/cortex-`. Migration recipe in CHANGELOG v2.0.0 entry.
3. **Re-run their parity harness** against v2.0.0. Expected: identical results to post-v1.2.1 (rename is functionally a no-op). If they were sitting at meanOverlap 0.769 with KB's Pattern 1 fix applied (per their 09:45 entry), they should see ~0.95+ once they apply v1.2.1's Pattern 2/3 scoring fix — bundled into v2.0.0 since v2.0.0 inherits everything from v1.2.1.

The last KyberBot comms entry (10:30) confirmed they would handle the dep bump after Arcana publishes. As of now (post-rename, post-publish, post-deprecation-pending), the ball is on their court.

## ADRs added this session

- **ADR 014** — `docs/decisions/014-library-rename-arcana-to-cortex.md` — the rename rationale, scope, migration recipe, and out-of-scope items.

## Plan docs

- `docs/plans/2026-05-22-system-health-phase1.md` — v1.2.0 sprint (shipped)
- `docs/plans/2026-05-23-rename-to-cortex.md` — v2.0.0 sprint (shipped, Findings appendix has 7 entries documenting BSD-sed gotchas, workspace link rebuild, etc.)
- `docs/plans/goal.txt` — the v2.0.0 rename goal text (now stale; next sprint will overwrite)

## Comms file state

Last entries in `~/dev/kybernesis/.comms/arcana-kyberbot.md`:
- 2026-05-23 09:00 ARCANA → KBOT — three patterns answered (Pattern 1 KB-side, 2/3 Arcana-side)
- 2026-05-23 09:30 ARCANA → KBOT — v1.2.1 Layer 0 fix staged
- 2026-05-23 09:45 KBOT → ARCANA — Pattern 1 fixed KB-side; meanOverlap 0.650 → 0.769; waiting on v1.2.1 publish
- 2026-05-23 10:30 KBOT → ARCANA — rename decision: arcana → cortex
- 2026-05-23 11:00 ARCANA → KBOT — v2.0.0 staged

Next expected entry: KyberBot confirming dep bump + post-v2.0.0 parity result. Expected to hit ≈ 1.0 once both sides' fixes are in play.

## Next-session orientation

The next Claude session should:

1. Read this checkpoint first.
2. Verify state with: `git log --oneline -5`, `git remote -v`, `bun run test 2>&1 | tail -3`.
3. Check comms for KyberBot's response: `tail -50 ~/dev/kybernesis/.comms/arcana-kyberbot.md`.
4. If npm deprecations are still pending and KyberBot has confirmed migration, prompt David to run them.
5. If KyberBot has reported post-v2.0.0 parity, update ADR 011's `§ Status of parity verification` table with the measured number.

The next *meaningful* sprint (after the rename dust settles) is **Phase 2 of the system-health audit** — `docs/SYSTEM-HEALTH.md` has 19 strong recommendations queued. The most valuable cluster is "retrieve correctness" (Layer 0 priority comparator, tokenBudget enforcement, BM25 keyword sum vs max). But these are no longer blocking anything — purely improvement work.

## Documentation drift to fix opportunistically

- `PLAN.md` historical section says syncthing replicates this folder — confirmed false (see "Syncthing" section above). Worth a one-line correction in the historical section.
- All `[SHIPPED]` sprint plans in `docs/plans/` and old ADRs 001-013 deliberately retain "Arcana" references — that's correct (point-in-time records). The CHANGELOG v2.0.0 entry + ADR 014 are the trail back.

## Key context for the next session

- **You are now Cortex, not Arcana.** Everywhere — except the brain-doc path and the comms file path (deliberate historical refs).
- **KyberBot is the only consumer.** No others to worry about.
- **The parity harness is on KyberBot's side.** Arcana ships fixes; KyberBot validates.
- **Port-first is sacred (ADR 011).** Any deviation from KyberBot's empirical brain shape must be justified explicitly and documented in the source-of-truth comparison.
- **The system-health audit (`docs/SYSTEM-HEALTH.md`) is the canonical backlog**, not PLAN.md. Phase 1 done in v1.2.0; Phase 2 + 3 queued.
