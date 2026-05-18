# Spec: Arcana

## Objective

Arcana defines the canonical knowledge-brain kernel for the Kybernesis product family — **KyberBot** (local agent runtime), **Kybernesis cloud** (multi-tenant memory SaaS), and future consumers (Kyber Desktop, embedded-in-Skills). Today KyberBot and Kybernesis cloud independently implement the same concepts — memory storage, fact extraction, sleep-pipeline maintenance, hybrid retrieval — with measurable drift (decay rates differ 2.5×, retrieval fusion algorithms differ, relation vocabularies are 15 vs 6). Arcana collapses that into one library all current and future Kybernesis products depend on.

**Authoring approach**: code is written from scratch to the architecture below. KyberBot's existing `packages/cli/src/brain/*` and Kybernesis cloud's pipeline code are treated as **algorithmic references** — sources for understanding the problem domain, edge cases, and validated tuning constants — but are not lifted as source. Quality bar is set fresh.

It implements the **portable-cortex pattern**: a `kernel` (data model + sleep pipeline + retrieval logic) wrapped by pluggable `providers` (embedding, LLM, vector store, structured store, scheduler, queue) and `interfaces` (CLI, MCP, HTTP, channels, ingestion).

**Users**: KyberBot (Ian) and Kybernesis cloud (David, Martin). Secondary: any future Kybernesis product that needs the same memory primitives.

**Success looks like**: both consumers depend on `@kybernesisai/arcana-*` for memory primitives; the next decay-semantics or relation-vocab change is made in one place, not two; drift between the two products stops compounding.

The architectural design source is `~/dev/ad/brains/kybernesis/arcana-spec.md` (kernel surface, sleep pipeline, gap analysis). This document is the **build contract**.

## Tech Stack

| | |
|---|---|
| Language | TypeScript 5.7+, strict mode, ESM-only |
| Runtime | Node 20+ (also: Convex runtime, Cloudflare Workers) |
| Build | Plain `tsc` per package — no bundler |
| Package mgr | **Bun workspaces** (≥ 1.1) |
| Validation | Zod 3 (re-exported from `arcana-contracts`) |
| Tests | Vitest 2.x + `@kybernesisai/arcana-testkit` (provider compliance suite) |
| Logging | Injected `Logger` interface — no logger dependency |
| Publish | Manual version bump → GH Actions auto-tag + idempotent `npm view` skip |
| License | MIT |
| npm scope | `@kybernesisai/arcana-*`, public registry |
| Repo | `KybernesisAI/arcana` on GitHub, public |

## Commands

```bash
# Install (workspace root)
bun install

# Build all packages
bun run build              # runs tsc -b across workspaces

# Test
bun run test               # vitest run
bun run test:watch         # vitest

# Lint + typecheck
bun run lint               # eslint . --fix
bun run typecheck          # tsc --noEmit

# Per-package
bun --filter @kybernesisai/arcana-core run build
bun --filter @kybernesisai/arcana-core run test

# Release (manual)
bun run version:bump       # interactive version bump
git push --follow-tags     # CI takes over: tag → publish
```

## Project Structure

```
arcana/
├── packages/
│   ├── arcana-contracts/         → Zod schemas, TS types, Logger interface, QueryResult envelope
│   │   └── src/
│   │       ├── memory.ts           Memory / Chunk / Entity / Edge / Fact / Contradiction / Insight / EntityProfile / AgentSelf
│   │       ├── scopes.ts           ARP scoping fields (org_id, project_id, connection_id, source_did, classification)
│   │       ├── providers.ts        Provider interfaces (StructuredStore, VectorStore, EmbeddingProvider, LLMProvider, Reranker, Scheduler, JobQueue)
│   │       ├── logger.ts           Logger interface
│   │       └── query-result.ts     QueryResult<T> freshness envelope
│   │
│   ├── arcana-core/              → Kernel — pure logic, no I/O
│   │   └── src/
│   │       ├── ingest/             storeMemory, ingestDocument
│   │       ├── retrieve/           hybridSearch (RRF), factRetrieval, getEntityProfile
│   │       ├── maintain/           sleep pipeline (12 steps, ordered)
│   │       └── access/
│   │           ├── bindings/       createArcana() factory
│   │           ├── query/          read-side facade
│   │           └── command/        write-side facade
│   │
│   ├── arcana-config/            → Zod-validated config loader (defaults → file → env)
│   ├── arcana-testkit/           → Provider compliance harness — every provider runs the same suite
│   └── arcana-providers-libsql/  → REFERENCE PROVIDER: StructuredStore impl backed by libsql
│
├── docs/                          → Architecture notes, ADRs
├── .github/workflows/
│   ├── ci.yml                      Lint, typecheck, test on PR
│   └── publish.yml                 Auto-tag on version bump, idempotent npm publish (config → contracts → core → providers)
├── SPEC.md                        → This document
├── README.md
├── LICENSE                         MIT
├── package.json                   Workspace root
├── bun.lock
├── tsconfig.base.json
└── eslint.config.mjs
```

## Code Style

Factory functions return plain objects with escape-hatch properties. No classes. DI through options.

```ts
// packages/arcana-core/src/access/bindings/createArcana.ts
import type {
  Logger,
  StructuredStore,
  VectorStore,
  EmbeddingProvider,
  LLMProvider,
} from '@kybernesisai/arcana-contracts';

export interface ArcanaOptions {
  structured: StructuredStore;
  vector: VectorStore;
  embed: EmbeddingProvider;
  llm: LLMProvider;
  logger?: Logger;
  reranker?: RerankerProvider;
  installSignalHandlers?: boolean;  // false in tests
}

export interface Arcana {
  ingest: IngestApi;
  retrieve: RetrieveApi;
  maintain: MaintainApi;
  // Public escape hatches
  readonly providers: Readonly<ArcanaOptions>;
  readonly logger: Logger;
}

export function createArcana(opts: ArcanaOptions): Arcana {
  const logger = opts.logger ?? noopLogger;
  // ... wire up zones
  return { ingest, retrieve, maintain, providers: opts, logger };
}
```

**Naming**:
- Files: `kebab-case.ts`
- Exports: `camelCase` functions, `PascalCase` types
- Factories: `createX()` returning `X`
- Zod schemas: `MemorySchema`, inferred type `Memory = z.infer<typeof MemorySchema>`

**Subpath exports** (granular, tree-shakable):
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./bus": "./dist/bus/index.js",
    "./lifecycle": "./dist/lifecycle/index.js",
    "./ingest": "./dist/ingest/index.js",
    "./retrieve": "./dist/retrieve/index.js",
    "./maintain": "./dist/maintain/index.js"
  }
}
```

## Testing Strategy

- **Framework**: Vitest 2.x, one config at repo root, per-package overrides allowed.
- **Location**: `packages/<pkg>/src/**/*.test.ts` co-located with sources.
- **Levels**:
  - **Unit** (kernel): pure-function tests against fakes from `arcana-testkit`. Cover decay math, RRF, Jaccard, tier classification.
  - **Compliance** (providers): every provider runs the `@kybernesisai/arcana-testkit` suite. Same assertions across libsql / Convex / Chroma / OpenAI — that's how we know the contract holds.
  - **Integration**: one smoke test per provider that exercises createArcana() with real backends (libsql in tmpfile, etc.). Off the default CI path; run via `bun run test:integration`.
- **Coverage**: not enforced at v0.1.0. Targets land at v0.2.
- **No mocks of internals** — provide a fake adapter via `arcana-testkit` instead.

## Boundaries

**Always**
- Run `bun run typecheck && bun run lint && bun run test` before commit
- All public APIs typed with Zod schema or explicit TS types from `arcana-contracts`
- Provider implementations live in their own package, never reach into `arcana-core`
- Logger always injected, never imported from a logging library
- Subpath exports declared in `package.json` for every public entry point
- New provider → must pass the `arcana-testkit` compliance suite
- **Build-as-documented**: when closing a task, refresh affected `.mochaccino/data/*.json` files and regenerate Mocha views. Treated with the same status as "run tests before commit" — non-optional.

**Ask first**
- Adding any runtime dependency to `arcana-core` or `arcana-contracts`
- Changing a provider interface (breaks every implementation)
- Adding a new top-level package
- Changing the sleep pipeline step order or signatures
- Touching the publish/CI workflow
- Bumping a major version

**Never**
- Import a concrete logger (Pino, Winston, etc.) anywhere in the library
- Bundle providers into `arcana-core`
- Commit secrets, `.env`, or npm tokens
- Skip the compliance suite to "ship faster"
- Add code to consume Arcana inside this repo (consumers live elsewhere)
- Mix ESM and CJS — ESM-only, no dual builds
- Rename public API names *post-publish* without a major version bump and a deprecation cycle (pre-publish, renames are free — see [ADR 001](./docs/decisions/001-method-renames-before-publish.md))

## Success Criteria (v0.1.0)

Specific, testable:

- [ ] `bun install && bun run build && bun run test` passes cleanly on a fresh clone
- [ ] Five packages publish to npm: `@kybernesisai/arcana-contracts`, `-core`, `-config`, `-testkit`, `-providers-libsql`
- [ ] GH Actions `publish.yml` is idempotent — re-running on an already-published version is a no-op
- [ ] `createArcana()` factory exists and accepts the documented options; calling it returns an object with `.ingest`, `.retrieve`, `.maintain`
- [ ] `arcana-testkit` exposes a `runComplianceSuite(provider)` function (suite may be a single placeholder test at v0.1)
- [ ] All data-model types from `arcana-spec.md` §10 exist as Zod schemas in `arcana-contracts`
- [ ] `LICENSE` is MIT, `README.md` explains what Arcana is and links back to `SPEC.md`
- [ ] No package depends on Pino or any concrete logger

## Open Questions

Deferred to v0.2+ — captured here so they don't get lost:

1. **ARP scoping** — Promote ARP fields (`project_id`, `connection_id`, `source_did`, `classification`) to first-class kernel scoping vocabulary? Needs Martin (ARP steward) sign-off.
2. **Relation vocabulary** — Unify the 15-type KyberBot vocab with the 6-type cloud vocab. Current proposal: 6 core + 9 extended.
3. **Identity layer** — Support both Letta-style structured `memoryBlocks` AND markdown `SOUL.md` files behind one kernel API. Shape TBD.
4. **Local-first default** — Should `providers-libsql` + embedded HNSW be the "just works" out-of-the-box setup (no Docker)? Implies a `providers-hnsw` package later.
5. **Migration plans** — `kyberbot-adopt-arcana.md` and `kybernesis-adopt-arcana.md` are out of scope here; will be authored as separate documents once v0.1 contracts are validated.
6. **Vitest 2.x vs 4.x** — previous discussion said "2/4"; locking 2.x as the safer pin. Override if 4.x is preferred.
