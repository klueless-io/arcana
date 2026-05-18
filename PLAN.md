# Plan: Arcana v0.1.0

## Scope reminder

v0.1.0 = **scaffold-grade**. Packages publish, types/exports/CI wire up, but kernel methods are stubs. Real implementations are v0.x work. KyberBot adoption is v0.y work.

## Components

| # | Component | Description | Depends on |
|---|---|---|---|
| 0 | Mochaccino workspace | Initialize `arcana/.mochaccino/` with workspace.md (mode: documentation, canonical source: SPEC.md + PLAN.md + repo state). Seed empty data files for the 5 proposed views. | 1 |
| 1 | Repo init | `git init`, GitHub repo under `KybernesisAI/arcana`, `.gitignore`, `LICENSE` (MIT), `README.md` | — |
| 2 | Workspace shell | Root `package.json`, Bun workspace config, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts` | 1 |
| 3 | `arcana-contracts` | Zod schemas for Memory/Chunk/Entity/Edge/Fact/Contradiction/Insight/EntityProfile/AgentSelf, ARP scope fields, provider interfaces, `Logger`, `QueryResult<T>` | 2 |
| 4 | `arcana-config` | Zod-validated loader (defaults → file → env), explicit env map | 3 |
| 5 | `arcana-core` | `createArcana()` factory, ingest/retrieve/maintain/access zone scaffolds, all methods stubbed | 3 |
| 6 | `arcana-testkit` | `runComplianceSuite(provider)` skeleton, fakes for every provider interface | 3, 5 |
| 7 | `arcana-providers-libsql` | Reference `StructuredStore` impl — real libsql connect + one round-trip (storeMemory/getMemory), other methods throw NotImplementedError | 3, 6 |
| 8 | CI: `ci.yml` | Lint + typecheck + test on PR | 2 |
| 9 | CI: `publish.yml` | Idempotent `npm view` skip, sequential publish in dep order | 2, 3, 4, 5, 6, 7 |
| 10a | First publish (manual) | Hand-rolled `npm publish` per package, dep order, for v0.1.0 — surfaces auth/scope/exports gotchas | 7 |
| 10b | First CI publish | Tag v0.1.1, prove publish.yml idempotency | 9, 10a |

**Every task also includes a `.mochaccino/data/` refresh step** — closing a task without refreshing affected data files violates the SPEC.md "Always: build-as-documented" rule.

## Implementation order

```
┌─ 1 Repo init
│
├─ 2 Workspace shell ──────────────┬─── 8 CI ci.yml
│                                  │
└─ 3 arcana-contracts ─┬──────────┬──────────┬───────────────┐
                       │          │          │               │
                       ▼          ▼          ▼               ▼
                  4 config   5 core      (parallel)      (used by all)
                              │
                              ▼
                         6 testkit
                              │
                              ▼
                  7 providers-libsql
                              │
                              ▼
                       9 publish.yml ──→ 10 first publish
```

### Sequential critical path

1 → 2 → 3 → 5 → 6 → 7 → 9 → 10

### Parallelizable

- **After 2**: CI scaffold (8), README polish, LICENSE — all can be done while contracts (3) is being authored
- **After 3**: config (4) and core (5) can be written in parallel; both depend only on contracts
- **After 5**: testkit (6) and a placeholder for providers-libsql (7) can start concurrently — testkit needs core's *interface types*, not its impl

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bun + `tsc -b` composite project resolution issues | Med | High | Validate end-to-end with a minimal 2-package toy first; lock Bun version in `engines` |
| Vitest 2.x + Bun runtime compatibility — Vitest runs on Node | Low | Med | Run Vitest via `bun x vitest` (Bun shells out to Node) — confirmed pattern in AppySentinel |
| npm publish ordering — `core` consuming unpublished `contracts` version | Med | High | Use `workspace:^` protocol in dev; CI rewrites to fixed version at publish; publish in dependency order |
| GitHub Actions OIDC + npm provenance setup friction | Low | Low | Skip provenance for v0.1; add as v0.2 hardening |
| Logger interface shape too narrow for KyberBot or cloud needs | Low | High (locks contract) | Mirror KyberBot's existing logger surface (`debug/info/warn/error` + optional ctx object) — already inspected its `logger.ts` |
| Zod 3 vs Zod 4 — Zod 4 is out; do we pin 3 or jump to 4? | Med | Low | Pin 3.x for v0.1 (stable, what cloud likely already uses); revisit in v0.2 |
| Naming collision on `@kybernesisai/*` scope — does it exist on npm yet? | Resolved | — | Verified: scope not yet claimed on npm (404). David to register the `kybernesisai` org via `npm org create kybernesisai` (or npmjs.com web UI) before T12a. |
| The "next day or two" timeline | High | Med | This plan is realistic for scaffold-grade in 1-2 focused days *if* repo/CI/npm-scope ops go smoothly. If they don't, day 2 slips to day 3. Not catastrophic. |

## Verification checkpoints

Each checkpoint is a stop-the-world gate before proceeding:

- **After 2** — `bun install` on a fresh clone succeeds; `bun run typecheck` succeeds (no packages yet, just config validates)
- **After 3** — `bun --filter @kybernesisai/arcana-contracts run build` produces `dist/`; importing `Memory`, `Logger`, `QueryResult` types from another package works; Zod schemas validate sample data correctly
- **After 5** — `createArcana({stubs})` returns an object with `.ingest`, `.retrieve`, `.maintain`, `.providers`, `.logger`; calling a method returns a typed stub response (no real work)
- **After 7** — `runComplianceSuite(libsqlProvider)` passes (suite may be 1 trivial test); `vitest run` is green across all packages
- **After 8** — PR to a test branch triggers ci.yml; all checks green
- **After 9** — `bun run version:bump 0.1.0` followed by `git push --follow-tags` triggers publish.yml; all 5 packages appear on npm; re-running the same workflow on the same tag is a no-op (idempotency proven)
- **After 10** — `npm install @kybernesisai/arcana-core` from a scratch directory works; `import { createArcana } from '@kybernesisai/arcana-core'` resolves; published `dist/` matches local build

## Authoring

v0.x kernel implementations: **David Cruwys (AppyDave)** as primary author. Task sizing in Phase 3 reflects one human's focused sessions, not parallel multi-agent dispatch.

## What this plan does NOT cover

Explicitly out of scope for Phase 2:

- v0.x kernel implementations (Jaccard math, RRF, sleep step bodies, etc.) — separate plan
- KyberBot's adoption / rip-out — separate plan in the KyberBot repo
- Kybernesis Brain adoption — separate plan
- Hermes/MemoryOS synthesis research — separate research track
- Provider implementations beyond libsql reference — v0.2+
- Performance benchmarking — v0.2+
