# ADR 005 — Memory is not append-only; `updateMemory` is first-class

**Status**: Accepted
**Date**: 2026-05-18
**Decider**: David Cruwys (AppyDave)
**Discovered by**: David's challenge — *"have we made an architectural mistake? Ian always talks about the ability to update memories"*

## Context

While advising KyberBot on the DVR-UT-006 orphan-mirror issue, I claimed *"Arcana's Memory model is append-only by design — there's no update API, no source_path field, no concept of 'same source as before.'"* That assertion drove my "treat orphans as audit trail" recommendation.

David pushed back: Ian's framing of the brain has always included updating memories. Was Arcana made wrong?

Audit results:

**Arcana's `Memory` schema** (`arcana-contracts/src/memory.ts`) has fields that are *explicitly* meant to mutate:
- `accessCount` (every read)
- `lastAccessedAt` (every read)
- `decayScore` (sleep pipeline — decay step)
- `priority` (sleep pipeline — decay/tier steps)
- `tier` (sleep pipeline tier step + manual `moveToTier`)
- `isPinned` (manual `pin`/unpin commands)

**KyberBot's actual behavior** (`packages/cli/src/brain/timeline.ts` + related): `INSERT OR REPLACE` on `source_path`-keyed upsert. Pin/unpin update `is_pinned` column. Tier moves update tier in place. Memories ARE updated.

**Kybernesis Brain's actual behavior** (Convex mutations in `apps/convex/convex/mutations/memory.ts`): `ctx.db.patch(id, { tier, accessCount, ... })`. Top-level field replacement, in place.

**Conclusion**: Memory is *not* append-only by design. The schema has mutating fields; both real consumers update memories. **Arcana's `StructuredStore` interface was simply missing the update primitive** — the same gap pattern as ADRs 002 (deleteEntity) and 004 (Fact schema).

## Decision

**Added two new methods:**

1. **`StructuredStore.updateMemory(id: string, fields: Partial<Omit<Memory, 'id'>>): Promise<void>`** — provider primitive. `id` immutable; all other fields updatable, including `contentHash` (kernel writes it on the consumer's behalf).

2. **`command.updateMemory(id: string, fields: UpdateMemoryFields): Promise<void>`** — kernel API where `UpdateMemoryFields = Partial<Omit<Memory, 'id' | 'contentHash'>>`. The kernel:
   - Validates the partial via `MemorySchema.partial().omit({ id, contentHash }).strict()`
   - Recomputes `contentHash = djb2Hash(newContent)` automatically when `content` is supplied
   - Calls `structured.updateMemory(id, mergedFields)`

**`scopes` is replaced, not deep-merged** when supplied. This matches Convex's `ctx.db.patch` semantics (top-level replace). Consumers that want column-by-column scope updates do read-merge-write in user-land. See "Rationale" for why.

**Two previously-stubbed kernel methods are now real implementations** via internal use of `updateMemory`:
- `command.pin(memoryId)` → `updateMemory(memoryId, { isPinned: true })`
- `command.moveToTier(memoryId, tier)` → `updateMemory(memoryId, { tier })`

Both were stubs only because the underlying primitive didn't exist.

## Rationale

### Why replace, not merge, on scopes

Audit of both consumers:

- **Kybernesis Brain (Convex)**: `ctx.db.patch({ scopes: { project_id: 'X' } })` replaces the whole `scopes` field. Existing `org_id` / `connection_id` are wiped. Consumers that want to preserve those do read-merge-write explicitly.
- **KyberBot (libsql)**: scopes are stored as **flat columns** (`project_id`, `classification`, `connection_id`, `source_did`) — no nested object exists at the storage layer. Each column is updated individually via SQL. The replace-vs-merge question is moot at the storage layer.

For Arcana — which models `scopes` as a *nested object* — the natural semantic is **replace**. Matches Convex's `patch` natively. KyberBot's wrappers do read-merge-write if they want column-by-column updates (same pattern as Convex consumers).

If we deep-merged in Arcana, KyberBot wrappers would still need read-merge-write to know they're not accidentally re-setting a stale value. Deep-merge adds complexity without removing work.

### Why this resolves DVR-UT-006

The orphan-mirror behavior David's previous note flagged (KyberBot's INSERT OR REPLACE on same source_path → new Arcana memory id every time → previous one orphaned) is now fixable cleanly:

```ts
// KyberBot's timeline.ts wrapper, with updateMemory available:
async function mirrorToArcana(event, existingArcanaMemoryId) {
  if (existingArcanaMemoryId !== null) {
    await arcana.command.updateMemory(existingArcanaMemoryId, {
      content, title, summary, tags, scopes,
      // contentHash recomputed automatically by Arcana
    });
    return existingArcanaMemoryId;  // reuse, no orphan
  }
  return await arcana.ingest.storeMemory({ content, ... });
}
```

No orphan accumulation. No Arcana-side dedup heuristics (option c — rejected). No "audit trail" interpretation (option a — was wrong because grounded in the now-falsified append-only premise). Option **(b) — KyberBot checks `arcana_memory_id` first, calls updateMemory or storeMemory accordingly — is the resolution.**

## Process learning (fourth instance — this is now a defined anti-pattern)

The "Arcana is append-only" assertion was wrong for the same reason as:

- ADR 002 (`deleteEntity` was missing — spec didn't include it)
- ADR 003→004 (`FactSchema` required triples that neither consumer produces)
- The original playbook fact-store mapping (`command.recordFact` predicted without reading KyberBot's actual fact-store code)

All four are the same pattern: **I made architectural assertions from the brain doc and Arcana's own surface, without auditing what the actual consumers do.**

The rule from ADR 005, broader than ADR 002/004's version:

> **Before making ANY design decision that affects how consumers will use the library, audit at least one real consumer's actual code. The brain doc is a map, not the territory. Arcana's own surface is the current state, not necessarily the intended state.**

This expansion goes beyond ADR 002/004's "read consumer code before defining/modifying schemas." It applies to:
- Architectural assertions ("Memory is append-only")
- Recommendation framing ("treat orphans as audit trail")
- API design defaults ("replace vs merge")
- Any answer to a consumer's question

When David next catches me making an assertion that *could* have been verified against consumer code, the right response is to audit immediately — not to defend the assertion.

## Consequences

### Contract change (additive)

- `StructuredStore.updateMemory(id, fields)` added to `arcana-contracts/src/providers.ts`
- Fake structured store in `arcana-testkit` implements it (Map-backed, atomic)
- Any future real provider implementation (libsql, Convex, etc.) must implement it

### Kernel methods now implemented (previously stubs)

- `command.updateMemory` — full implementation
- `command.pin` — wrapper around `updateMemory`
- `command.moveToTier` — wrapper around `updateMemory`

### Downstream impact

- **KyberBot**: orphan-mirror fix is now mechanical (check `arcana_memory_id`, branch to updateMemory or storeMemory). Was deferred under DVR-UT-006 option (a); now should be done under option (b).
- **Kybernesis Brain**: when Ian adopts, `updateMemory` is the natural mapping for his existing `ctx.db.patch` patterns. One-to-one.
- **`docs/adoption/kyberbot.md`**: lifecycle module (#13ish — pin / unpin / moveToTier) now has real kernel methods. Migration table updated.

### David taking over KyberBot memory

David's noted that he'll own KyberBot's memory integration after Arcana stabilizes. The consequence: ADR negotiations for memory-related contract changes get lighter — David authors the ADR; he's also the one implementing on both sides. The cross-session comms-file protocol stays useful for visibility but becomes less critical for memory specifically.

## References

- Commit: `<HEAD>` — feat(arcana): updateMemory primitive + real pin/moveToTier
- Comms exchange: David's 2026-05-18 "have we made an architectural mistake?" question; the scopes replace-vs-merge audit
- Brain doc: `~/dev/ad/brains/kybernesis/arcana-spec.md` §4 (Memory data model — incomplete on update semantics) and §5.6 (tier classification — implies in-place update)
- Code grounding:
  - `kyberbot/packages/cli/src/brain/timeline.ts` (INSERT OR REPLACE pattern)
  - `kybernesis-brain/apps/convex/convex/mutations/memory.ts` (ctx.db.patch pattern)
- Related ADRs:
  - [ADR 002 — deleteEntity contract addition](./002-deleteentity-contract-addition.md) (same root cause)
  - [ADR 004 — Fact schema optional triple decomposition](./004-fact-schema-optional-triple-decomposition.md) (same root cause)
