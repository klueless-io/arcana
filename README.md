# Arcana

The canonical knowledge-brain library for the Kybernesis product family.

Arcana defines the shared memory substrate consumed by **KyberBot** (local agent runtime), **Kybernesis cloud** (multi-tenant memory SaaS), and future Kybernesis products. It implements the **portable-cortex pattern** — a `kernel` (data model + sleep pipeline + retrieval logic) wrapped by pluggable `providers` (embedding, LLM, vector store, structured store, scheduler, queue) and `interfaces` (CLI, MCP, HTTP, channels, ingestion).

## Status

**v1.2.0 — kernel stable, KyberBot adoption in progress.** All six packages publish to npm. The kernel ports KyberBot's empirical brain code per [ADR 011 — port-first, improve-later](./docs/decisions/011-port-first-improve-later.md): match the proven implementation before considering improvements. Sleep pipeline (10 KB-faithful steps), hybridSearch (4-channel RRF), factRetrieval (5-layer with direct fact-FTS), and the StructuredStore/VectorStore/LLMProvider/Scheduler contracts are all live. Remaining stubs are demand-driven (`ingestDocument`, three Convex-shaped facades).

System-health verdict at v1.2.0: **AMBER** — solid core, audit-known seams documented in [docs/SYSTEM-HEALTH.md](./docs/SYSTEM-HEALTH.md), Phase 1 production-blockers fixed.

## Documentation

- [`SPEC.md`](./SPEC.md) — the build contract: tech stack, project structure, code style, boundaries
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes per version (most trustworthy "what shipped" reference)
- [`docs/SYSTEM-HEALTH.md`](./docs/SYSTEM-HEALTH.md) — system-health audit (cross-layer patterns, phased remediation plan)
- [`docs/decisions/`](./docs/decisions/) — Architecture Decision Records ([README](./docs/decisions/README.md) indexes ADRs 001-013)
- [`docs/plans/`](./docs/plans/) — sprint plans (one per release; current and historical)
- [`.mochaccino/`](./.mochaccino/) — live build documentation dashboards

The architectural design source lives outside this repo: `~/dev/ad/brains/kybernesis/arcana-spec.md`.

## Install

```bash
npm install @kybernesis/arcana-contracts \
            @kybernesis/arcana-core \
            @kybernesis/arcana-provider-libsql \
            @kybernesis/arcana-provider-sqlite-vec \
            @kybernesis/arcana-provider-llm-claude-code
```

`@kybernesis/arcana-testkit` is dev-only (provider compliance suite + parity harness).

## Packages

| Package | Purpose |
|---|---|
| `@kybernesis/arcana-contracts` | Zod schemas (Memory, Fact, Edge, Entity, Insight, EntityProfile, Contradiction, AgentSelf), provider interfaces, `Logger`, `QueryResult<T>`, `Scopes` |
| `@kybernesis/arcana-core` | Kernel — `createArcana()` factory + `ingest`/`retrieve`/`maintain`/`access` zones |
| `@kybernesis/arcana-testkit` | In-memory fakes + parity harness (`runParityHarness`) for consumer swaps per [ADR 009](./docs/decisions/009-parity-gate-for-consumer-swaps.md) |
| `@kybernesis/arcana-provider-libsql` | Reference `StructuredStore` impl — libsql + FTS5 + recursive-CTE multi-hop graph + transaction primitive |
| `@kybernesis/arcana-provider-sqlite-vec` | `VectorStore` impl via the sqlite-vec extension |
| `@kybernesis/arcana-provider-llm-claude-code` | `LLMProvider` impl via subprocess to the local `claude` CLI (no API key required — uses Claude Code subscription) |

## Usage

```ts
import { createArcana } from '@kybernesis/arcana-core';
import { createLibsqlStructuredStore } from '@kybernesis/arcana-provider-libsql';
import { createSqliteVecVectorStore } from '@kybernesis/arcana-provider-sqlite-vec';
import { createClaudeCodeLLMProvider } from '@kybernesis/arcana-provider-llm-claude-code';

const arcana = createArcana({
  structured: createLibsqlStructuredStore('./arcana.db'),
  vector: createSqliteVecVectorStore('./arcana.db', { dimensions: 1536 }),
  llm: createClaudeCodeLLMProvider(),
  embed: yourEmbeddingProvider,
});

await arcana.providers.structured.connect();
const id = await arcana.ingest.storeMemory({ content: 'hello world', source: 'cli' });
const facts = await arcana.ingest.extractFacts(id);
const results = await arcana.retrieve.hybridSearch({ query: 'hello' });
await arcana.maintain.runSleepPipeline();
```

## License

[MIT](./LICENSE) © 2026 David Cruwys (AppyDave)
