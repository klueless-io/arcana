# Arcana

The canonical knowledge-brain library for the Kybernesis product family.

Arcana defines the shared memory substrate consumed by **KyberBot** (local agent runtime), **Kybernesis cloud** (multi-tenant memory SaaS), and future Kybernesis products. It implements the **portable-cortex pattern** — a `kernel` (data model + sleep pipeline + retrieval logic) wrapped by pluggable `providers` (embedding, LLM, vector store, structured store, scheduler, queue) and `interfaces` (CLI, MCP, HTTP, channels, ingestion).

## Status

**Pre-alpha — v0.1.0 in progress.** This is the scaffold milestone: packages publish, types/exports/CI wire up, but kernel methods are stubs. Real implementations land in v0.x. Consumer adoption (KyberBot, Kybernesis Brain) lands after that.

## Documentation

- [`SPEC.md`](./SPEC.md) — the build contract: tech stack, project structure, success criteria, boundaries
- [`PLAN.md`](./PLAN.md) — implementation plan + strategy (currently: demand-driven kernel implementation)
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes per package
- [`docs/adoption/kyberbot.md`](./docs/adoption/kyberbot.md) — KyberBot adoption playbook
- [`docs/adoption/kybernesis-brain.md`](./docs/adoption/kybernesis-brain.md) — Kybernesis Brain adoption playbook (handoff for Ian)
- [`docs/decisions/`](./docs/decisions/) — Architecture Decision Records (ADRs) for non-obvious design + process decisions
- [`.mochaccino/`](./.mochaccino/) — live build documentation (refreshed at each task close + kernel method implementation)

The architectural design source lives outside this repo: `~/dev/ad/brains/kybernesis/arcana-spec.md`.

## Local consumption (pre-npm-publish)

Until v0.1.0 publishes to npm, consumers reference Arcana packages via local `file:` deps:

```json
"dependencies": {
  "@kybernesisai/arcana-contracts": "file:../../arcana/packages/arcana-contracts",
  "@kybernesisai/arcana-config":    "file:../../arcana/packages/arcana-config",
  "@kybernesisai/arcana-core":      "file:../../arcana/packages/arcana-core"
}
```

Adjust the relative path based on the consumer's location. Each Arcana rebuild + `pnpm install` (or `npm install`) in the consumer refreshes the linked code. See the adoption playbooks above for full setup instructions per consumer.

## Packages (planned for v0.1.0)

| Package | Purpose |
|---|---|
| `@kybernesisai/arcana-contracts` | Zod schemas, provider interfaces, `Logger`, `QueryResult<T>` |
| `@kybernesisai/arcana-config` | Zod-validated config loader |
| `@kybernesisai/arcana-core` | Kernel — `createArcana()` factory + ingest/retrieve/maintain/access zones |
| `@kybernesisai/arcana-testkit` | Provider compliance harness |
| `@kybernesisai/arcana-providers-libsql` | Reference `StructuredStore` implementation |

## License

[MIT](./LICENSE) © 2026 David Cruwys (AppyDave)
