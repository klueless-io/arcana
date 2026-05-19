# Kybernesis Brain → Arcana adoption playbook (handoff for Ian)

How Kybernesis Brain (`~/dev/kybernesis/kybernesis-brain/`) incrementally adopts `@kybernesis/arcana-*` packages.

This document is intended as a **handoff from David to Ian**. The playbook is structurally identical to `kyberbot.md` — same demand-driven rule, same per-module migration recipe — but customized for the Convex + queue-worker + Cloudflare Workers architecture.

Read `docs/adoption/kyberbot.md` first; this document calls out the deltas, not the basics.

---

## 0. One-time setup (Kybernesis Brain side)

Kybernesis Brain is a multi-app monorepo (Convex, queue-worker, MCP server, durable scheduler, web). Each app that needs Arcana imports it directly.

Add Arcana packages as local deps in the relevant app's `package.json` (e.g., `apps/queue-worker/package.json`):

```json
"dependencies": {
  "@kybernesis/arcana-contracts": "file:../../../arcana/packages/arcana-contracts",
  "@kybernesis/arcana-config":    "file:../../../arcana/packages/arcana-config",
  "@kybernesis/arcana-core":      "file:../../../arcana/packages/arcana-core"
}
```

Then at the kybernesis-brain repo root:

```bash
npm install        # kybernesis-brain uses npm, not pnpm
```

**Note on Convex**: Convex functions run in a special runtime. The `apps/convex/` package can import `@kybernesis/arcana-contracts` for *types* (and Zod schemas for runtime validation), but `arcana-core` methods that depend on Node-only APIs (filesystem, process, etc.) won't work inside Convex functions. Stick to:

- `apps/convex/` → import from `arcana-contracts` only (types + Zod)
- `apps/queue-worker/` (BullMQ, Render) → can use `arcana-core` fully
- `apps/workers/` (Cloudflare Workers) → check each method; Workers runtime is restrictive
- `apps/mcp/` → can use `arcana-core` fully
- `apps/durable/` (Cloudflare Durable Object) → check each method

The Arcana kernel is *designed* to be runtime-portable (the provider model abstracts I/O), but real-world runtime quirks need verification per app.

---

## 1. The demand-driven rule

Identical to the KyberBot playbook. When `arcana-core` throws `NotImplementedError`, that's the signal to ping the Arcana session for implementation.

**Cross-session note**: Ian's adoption session is separate from David's KyberBot adoption session. Both can demand implementations in parallel. The Arcana session prioritizes whichever request arrives first — but if both consumers need the same method, that's a win (one implementation serves both).

---

## 2. Per-module migration recipe

Structurally same as the KyberBot playbook. Differences:

### Step 2 — Rename old, don't delete

Kybernesis Brain's "brain" code is scattered across multiple apps. Rename per-file in place:

```bash
git mv apps/queue-worker/src/pipelines/relationships.ts apps/queue-worker/src/pipelines/relationships.legacy.ts
```

### Step 3 — Write the new module

Pattern is the same: import Arcana types, call Arcana methods, preserve public surface.

For Convex mutations specifically (`apps/convex/convex/mutations/*`), the migration looks like:

```ts
// apps/convex/convex/mutations/memory.ts
import { mutation } from './_generated/server.js';
import { MemorySchema, type Memory } from '@kybernesis/arcana-contracts';
import { v } from 'convex/values';

export const createMemory = mutation({
  args: { /* convex-shaped args */ },
  handler: async (ctx, args) => {
    // Validate input against Arcana shape
    const memory: Memory = MemorySchema.parse({ /* shape from args */ });

    // Persist via Convex (NOT via arcana-core directly — Convex mutations
    // need to use ctx.db, not a Node-only StructuredStore impl)
    return await ctx.db.insert('memoryItems', { /* convex shape */ });
  },
});
```

The Convex side becomes a **provider implementation** rather than a kernel consumer. It implements `StructuredStore` interface using Convex's `ctx.db`. Then the kernel methods (called from queue-worker / MCP / etc.) use that Convex-backed provider.

### Step 4 — Run Kybernesis Brain's tests

```bash
npm --workspace apps/queue-worker test
npm --workspace apps/convex test
# etc.
```

Same three-outcome model: tests pass / NotImplementedError / mismatch.

---

## 3. Suggested migration order

Kybernesis Brain's "brain" code lives in multiple apps. Rough dependency order:

| Order | Kybernesis Brain location | Arcana surface it'll exercise |
|---|---|---|
| 1 | `apps/convex/convex/schema.ts` (memoryItems, memoryChunks, ...) | Adopt `Memory` / `Chunk` / etc. Zod schemas as the source of truth for shape; convex types extend them. |
| 2 | `apps/convex/convex/mutations/memory.ts` | Convex-backed `StructuredStore` provider implementation |
| 3 | `packages/storage-chroma/src/index.ts` | `VectorStore` provider implementation (ChromaDB Cloud) |
| 4 | `apps/queue-worker/src/pipelines/tagging.ts` | sleep step: tag |
| 5 | `apps/queue-worker/src/pipelines/fact-extraction.ts` | sleep step: extractFacts |
| 6 | `apps/queue-worker/src/pipelines/contradiction.ts` | sleep step: detectContradictions |
| 7 | `apps/queue-worker/src/pipelines/confidence-decay.ts` | sleep step: decayFactConfidence |
| 8 | `apps/queue-worker/src/pipelines/relationships.ts` | sleep step: link |
| 9 | `apps/queue-worker/src/pipelines/tiering.ts` | sleep step: tier |
| 10 | `apps/queue-worker/src/pipelines/reasoning.ts` | sleep step: reason |
| 11 | `apps/queue-worker/src/pipelines/profile-builder.ts` | sleep step: buildEntityProfiles |
| 12 | `apps/workers/src/retrieval.ts` | `retrieve.hybridSearch` |
| 13 | `apps/mcp/src/services/chat.ts` | composition of retrieve + LLM |
| 14 | `apps/durable/src/index.ts` | `Scheduler` provider implementation (Durable Object alarm) |

---

## 4. Cross-session protocol

Same as KyberBot playbook section 4. When Ian's session needs an Arcana method:

```
NEEDS: arcana-core/<zone>.<method>
CALLED FROM: kybernesis-brain/apps/<app>/src/<file>.ts:<line>
SHAPE: <expected input/output, briefly>
SPEC REF: ~/dev/ad/brains/kybernesis/arcana-spec.md §<section>
RUNTIME: convex | queue-worker | workers | mcp | durable
```

The `RUNTIME` field is a Kybernesis-Brain-specific addition — it flags to the Arcana session that the implementation may need runtime-portability care (e.g., no `node:fs` in Workers).

Response same shape as KyberBot playbook.

---

## 5. Runtime portability notes

Arcana's design is provider-abstracted but the kernel itself is JavaScript code that runs wherever it's imported. Known constraints:

| Runtime | Limitations | Mitigation |
|---|---|---|
| Convex functions | No `node:fs`, `node:child_process`. Limited CPU/memory/wall-clock per function. | Use `arcana-contracts` only; do persistence via `ctx.db`. |
| Cloudflare Workers / Durable Objects | No `node:fs`, limited APIs. 30s per request. | Audit each kernel method; methods that use filesystem (e.g., `arcana-config` loading from a path) need an env-only config setup. |
| BullMQ queue-worker (Render) | Full Node 20+. No special restrictions. | Use freely. |
| MCP server (Render) | Full Node 20+. | Use freely. |

If a method demand from this runtime would force Arcana to use a Node-only API in its kernel, flag it to the Arcana session — the right fix might be to push the I/O into a provider, not the kernel.

---

## 6. When Kybernesis Brain adoption is "done"

- `apps/convex/convex/schema.ts` table shapes match Arcana's Zod schemas
- `apps/queue-worker/src/pipelines/*` are thin Convex+Arcana orchestrators (no algorithmic logic — that's in Arcana)
- `apps/workers/src/retrieval.ts` is a thin Arcana caller
- All apps' tests pass against the local `file:` Arcana
- Both KyberBot and Kybernesis Brain run the same kernel logic; drift on decay/RRF/tier/sleep cannot recur

At that point, Arcana publishes to npm and both consumers replace their `file:` deps with version pins.

---

## Handover protocol from David to Ian

When Ian is ready to start:

1. David ensures the Arcana repo state is current on Ian's machine (syncthing or git pull if pushed to a remote by then)
2. Ian opens a Claude Code session at `~/dev/kybernesis/kybernesis-brain/`
3. That session reads this document + `kyberbot.md` (for shared context) + `SPEC.md` (for build contract)
4. Ian starts at order #1 (convex schema alignment) — that's the lowest-risk first move
5. Cross-session protocol kicks in when his session needs Arcana implementations

---

## See also

- `docs/adoption/kyberbot.md` — David's KyberBot adoption playbook (the worked example)
- `SPEC.md` — Arcana build contract
- `~/dev/ad/brains/kybernesis/arcana-spec.md` — canonical algorithmic spec
- `~/dev/ad/brains/kybernesis/kybernesis-platform.md` — Kybernesis Brain architecture
