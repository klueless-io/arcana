# KyberBot → Arcana adoption playbook

How KyberBot incrementally rips out `packages/cli/src/brain/*` and replaces it with `@kybernesisai/arcana-*` imports.

This document is the **contract between two Claude Code sessions**:
- **Arcana session** at `~/dev/kybernesis/arcana/` — implements kernel methods on demand
- **KyberBot session** at `~/dev/kybernesis/kyberbot/` — drives the adoption

Read this top-to-bottom before starting adoption work. The flow only works if both sessions agree on the protocol.

---

## 0. One-time setup (KyberBot side)

Add Arcana packages as local `file:` deps in `kyberbot/packages/cli/package.json`:

```json
"dependencies": {
  "@kybernesisai/arcana-contracts": "file:../../../arcana/packages/arcana-contracts",
  "@kybernesisai/arcana-config":    "file:../../../arcana/packages/arcana-config",
  "@kybernesisai/arcana-core":      "file:../../../arcana/packages/arcana-core"
}
```

(Adjust relative path based on actual repo layout — `kyberbot/` and `arcana/` are siblings under `~/dev/kybernesis/`, so `../../../arcana/...` is correct from `packages/cli/`.)

Then in the kyberbot repo root:

```bash
pnpm install
```

Verify:

```bash
pnpm --filter @kyberbot/cli exec node -e "
  const { createArcana } = require('@kybernesisai/arcana-core');
  console.log(typeof createArcana);
"
# expect: function
```

When Arcana's source changes, refresh in KyberBot with `pnpm install` (pnpm re-links the file: dep).

---

## 1. The demand-driven rule

> **Implement Arcana kernel methods only when KyberBot adoption work demands them.** Don't pre-implement against a tidy zone-by-zone TODO. The order is driven by what gets ripped out first.

Concretely:

- KyberBot session attempts to replace `brain/timeline.ts` (say) with `arcana.ingest.storeMemory(...)` calls
- That call throws `NotImplementedError: arcana-core/ingest.storeMemory is a v0.1 scaffold stub; real implementation lands in v0.x`
- KyberBot session **pauses adoption work**, opens or switches to the Arcana session, says "implement `ingest.storeMemory` next"
- Arcana session implements it, commits, KyberBot session resumes
- Repeat per module

This produces small, justified commits on both sides. No method gets implemented in Arcana that doesn't have a real caller.

---

## 2. Per-module migration recipe

For each `brain/<module>.ts` that gets replaced:

### Step 1 — Read the existing tests

Before touching the module:

```bash
cat packages/cli/src/brain/<module>.test.ts
```

These tests describe the behavior contract that the replacement must satisfy. If no tests exist, write minimal ones from inspection of the module's actual usage in callers — this protects the migration.

### Step 2 — Rename old, don't delete

```bash
git mv packages/cli/src/brain/<module>.ts packages/cli/src/brain/<module>.legacy.ts
```

Update any internal imports that still use the legacy file. The `.legacy.ts` stays around during the migration; it's a reference + rollback target.

### Step 3 — Write the new module

Create a new `packages/cli/src/brain/<module>.ts` that:
- Imports types from `@kybernesisai/arcana-contracts`
- Calls methods on an Arcana instance created via `createArcana(...)` at the KyberBot agent's boot
- Preserves the **public surface** the old module exposed (so callers don't have to change yet)

Example sketch for `timeline.ts`:

```ts
// packages/cli/src/brain/timeline.ts
import type { Memory } from '@kybernesisai/arcana-contracts';
import { getArcanaInstance } from './arcana-singleton.js';

export async function storeTimelineEvent(input: { /* old shape */ }): Promise<string> {
  const arcana = getArcanaInstance();
  return arcana.ingest.storeMemory({
    content: input.content,
    title: input.title,
    source: input.source ?? 'channel',
    // ...
  });
}
```

### Step 4 — Run KyberBot's tests

```bash
pnpm --filter @kyberbot/cli test -- <module>
```

One of three things happens:

| Outcome | What it means | Action |
|---|---|---|
| Tests pass | Arcana already had this implemented | Move on; delete `.legacy.ts` when confidence is high |
| `NotImplementedError` thrown | Arcana method exists as a stub | Switch to Arcana session, implement it |
| Real behavior mismatch | Arcana's shape doesn't match what KyberBot needs | Contract bug — fix in Arcana session, then retry |
| Test expectation wrong | KyberBot test was testing impl details, not behavior | Adjust the test (carefully — get a second look) |

### Step 5 — Implement the Arcana method (in Arcana session)

The Arcana session reads `~/dev/ad/brains/kybernesis/arcana-spec.md` for the canonical algorithm, implements the method in the relevant zone (replacing the `throw new NotImplementedError(...)` line with real code), adds a unit test, and commits.

Implementation discipline:
- Match the spec's behavior unless there's a documented reason to diverge
- Real test (not just "doesn't throw") — exercise inputs/outputs/edge cases
- Keep the commit small; one method per commit when possible

### Step 6 — Verify end-to-end, then archive the legacy

Once KyberBot tests pass against the new module + real Arcana impl:

```bash
git rm packages/cli/src/brain/<module>.legacy.ts
git commit -m "drop <module>.legacy.ts — Arcana adoption complete for this module"
```

---

## 3. Suggested migration order

KyberBot brain modules are roughly listed in dependency order. Lower-numbered items have fewer dependencies and should be ripped out first:

| Order | KyberBot module | Arcana methods it'll demand |
|---|---|---|
| 1 | `timeline.ts` | `ingest.storeMemory`, `access.query.queryFacts`-ish reads |
| 2 | `entity-graph.ts` | entity + edge ops (via `access.command.linkMemories`, store helpers) |
| 3 | `embeddings.ts` | provider wiring: `EmbeddingProvider` + `VectorStore` adapters around OpenAI + ChromaDB |
| 4 | `fact-store.ts` | `access.command.recordFact`, `access.query.queryFacts` |
| 5 | `fact-extractor.ts` | `ingest.storeMemory` flow + LLM provider wiring |
| 6 | `fact-contradiction.ts` | sleep step + contradiction storage |
| 7 | `fact-temporal.ts` | temporal expiry logic in fact storage |
| 8 | `fact-retrieval.ts` | `retrieve.factRetrieval` (multi-stage) |
| 9 | `hybrid-search.ts` | `retrieve.hybridSearch` (RRF + graph expansion + optional rerank) |
| 10 | `store-conversation.ts` | composition of ingest + downstream extraction |
| 11 | `sleep/*` | `maintain.runSleepPipeline` + 13 steps |
| 12 | `user-profile.ts` | `retrieve.getEntityProfile` (entity = user) |
| 13 | `messages.ts` | chat history surface — likely stays in KyberBot, not Arcana (interface layer) |
| 14 | `chromadb.ts` | provider lifecycle for VectorStore impl |
| 15 | `db-recovery.ts` | likely stays in KyberBot — operational, not kernel |

Items 13-15 may end up not migrating — they're interface-layer concerns (per SPEC's three-ring model). Decide on each as you reach it.

---

## 4. Cross-session protocol

When KyberBot session hits a stub or contract issue, the message back to Arcana session should include:

```
NEEDS: arcana-core/<zone>.<method>
CALLED FROM: kyberbot/packages/cli/src/brain/<file>.ts:<line>
SHAPE: <expected input/output, briefly>
SPEC REF: ~/dev/ad/brains/kybernesis/arcana-spec.md §<section>
```

The Arcana session responds when implementation is committed:

```
IMPLEMENTED: arcana-core/<zone>.<method>
COMMIT: <hash>
TEST COUNT: <before> → <after>
NOTES: <anything subtle about the impl that KyberBot caller should know>
```

This isn't ceremony — it's keeping both contexts coherent without one session re-reading the other's full history.

---

## 5. What to do when something breaks

| Symptom | Likely cause | Where to fix |
|---|---|---|
| `NotImplementedError` thrown from Arcana | Stub still in place | Arcana session: implement the named method |
| TypeScript error on import from `@kybernesisai/arcana-*` | Contract drift between Arcana types and KyberBot expectations | Arcana session: revise contract (carefully — every consumer sees this); update both sides |
| Runtime error in Arcana code | Bug in the implementation | Arcana session: fix, add regression test |
| KyberBot test was testing implementation details (e.g., specific SQL emitted) | Old test was too coupled to the old impl | KyberBot session: rewrite test as a behavior test |
| `pnpm install` doesn't pick up Arcana changes | `file:` dep cache stale | `rm -rf node_modules` in kyberbot, re-`pnpm install` |
| Arcana rebuild not reflected | Stale `dist/` | In Arcana: `bun run build` |

---

## 6. When KyberBot adoption is "done"

The adoption is complete when:

- `packages/cli/src/brain/` no longer exists in KyberBot, OR contains only interface-layer concerns (messages, chromadb wiring, db-recovery) that were never in Arcana's scope
- All of KyberBot's tests pass with Arcana as the kernel
- KyberBot can run end-to-end (channel chat → memory store → retrieval → response) against a real libsql + ChromaDB backend, with Arcana doing all the brain work

At that point the local `file:` deps can be replaced with published npm versions (T12a returns from deferred). KyberBot becomes the first real-world Arcana consumer.

---

## See also

- `docs/adoption/kybernesis-brain.md` — parallel playbook for Ian's Kybernesis Brain repo
- `SPEC.md` — Arcana build contract
- `~/dev/ad/brains/kybernesis/arcana-spec.md` — canonical algorithmic spec for kernel methods
