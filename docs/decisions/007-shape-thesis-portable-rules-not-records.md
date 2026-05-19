# ADR 007 — Arcana's shape thesis: portable rules, not portable records

**Status**: Accepted
**Date**: 2026-05-19
**Decider**: David
**Driven by**: Kybernesis Brain data-model audit + Brain-vs-Convex structural analysis

## Context

The Kybernesis Brain audit (2026-05-18) returned a 🟡 YELLOW-LIGHT verdict: five structural "misfits" between Brain's Convex schema and Arcana's contracts. The implied conclusion was that Arcana's shape was wrong for at least one of its two real consumers and would need contract-level surgery to fit both.

A follow-up structural analysis (2026-05-19, `docs/audits/brain-structure-vs-convex.md`) tested an alternative hypothesis: are Brain's choices *intrinsically domain-driven* or are they *artifacts of Convex*?

The natural experiment was already in front of us. **KyberBot runs the same domain on libsql/SQLite.** It made independent modelling choices on a different storage engine. Comparing KyberBot's shape against Brain's against Arcana's gives a three-point signal that no single audit could.

The result was decisive:

| Audit misfit | KyberBot (SQLite) | Brain (Convex) | Verdict |
|---|---|---|---|
| Edge shape (4-flat-IDs vs `NodeRef`) | text-path edges → maps cleanly to `NodeRef` | 4 nullable FK columns | Convex artifact |
| `memoryEntities` shadow rows | does not exist | every memory gets a shadow entity row | Convex artifact (no-JOIN coping) |
| `EntityProfile` structured arrays | flat narrative columns | structured arrays | Mixed: intent right, shape Convex-shaped |
| `Memory.status` missing from Arcana | present | present | **Domain feature**, survives any DB |
| Enum collisions (`sourceType`, `source`) | CHECK-constrained, matches Arcana's `EntitySchema` enum exactly | loose validator strings | Convex artifact (no DB-enforced enums) |

Three of the five "misfits" are Brain's database showing through its schema. KyberBot — working the same domain without Convex — independently converged on Arcana's shape. The other two are genuine domain lessons Arcana hadn't yet captured.

## Decision

### 1. Arcana's contracts encode portable *rules*, not portable *records*

The original framing — "shared brain data model" — overreached. Arcana's actual value, the thing that justified extracting a library in the first place, is the *rules and operations* over brain data: decay scoring, supersession resolution, contradiction lifecycle, tier promotion, retrieval composition. These survive any storage choice.

The records themselves — exact column types, denormalisation choices, soft-delete mechanics, FK shapes — are *storage-shaped*. Brain's Convex shape and KyberBot's libsql shape will always differ on these axes, not because the domain disagrees, but because the databases do.

Therefore:

- **`MemorySchema`, `EdgeSchema`, `EntitySchema`, `FactSchema`, `ContradictionSchema`, `EntityProfileSchema`** stay as the canonical *rule-bearing* shapes. They describe what brain knowledge *means*, not how each consumer happens to store it.
- **`StructuredStore` (provider interface)** is the seam. Consumer-shaped translation lives here, not in the contracts.
- Cross-consumer record portability (e.g. JSON-exporting from KyberBot and JSON-importing into Brain) is **not** a goal. It was an assumed corollary, never a stated requirement, and giving it up costs nothing real.

### 2. Brain's 3 structural misfits stay as adapter concerns, not contract changes

The 4-flat-ID edges, `memoryEntities` shadow rows, and loose `sourceType`/`source` vocab are Convex's footprint on Brain's schema. They do not warrant changes to Arcana's contracts. Specifically:

- **Edges**: `NodeRef` (discriminated union) stays. Brain's adapter, when it ships, translates 4-flat-ID rows into `NodeRef`-shaped reads and `NodeRef`-shaped writes into 4-flat-ID inserts.
- **Shadow entities**: Brain's adapter filters them out when projecting `Entity`. Arcana's `Entity` remains strictly real-world, matching KyberBot's already-aligned model.
- **Enums**: Arcana keeps its tight enum vocab (which matches KyberBot's CHECK constraints exactly). Brain's adapter maps Brain's loose strings to/from Arcana's enums on read/write.

This is what the provider abstraction is *for*. Pushing Convex's artifacts up into the contracts would degrade the contracts for every other consumer (KyberBot, future Kyber Desktop, future portable brain).

### 3. Adopt Brain's 2 genuine domain lessons

Two findings from the Brain analysis are not Convex artifacts — they are real domain features Arcana lacks:

- **`Memory.status` lifecycle field** (`active` / `archived` / `deleted` or similar). Load-bearing for audit-grade systems. Both Brain and KyberBot have it; Arcana doesn't. **To be added** as part of the implementation work following this ADR.
- **Memory-level supersession** (`isLatest`, `supersededBy` on memories, not just facts). Mirrors the fact-level supersession Arcana already supports. **To be added** alongside a `markMemorySuperseded` kernel method analogous to `markFactSuperseded`.

These are the two cases where Arcana grows toward consumers' real-world needs. Both are additive and backward-compatible.

### 4. Formalise `ProfileEntry` to replace opaque `string[]` arrays

`EntityProfileSchema` currently uses `string[]` for facets like roles, skills, projects. Brain's structured-arrays approach has the *right intent* (each entry carries provenance — which fact it came from, when, with what confidence) but the *wrong shape* for a portable library (arrays-in-row is a Convex denormalisation choice).

Decision: introduce a `ProfileEntry` schema:

```ts
interface ProfileEntry {
  value: string;
  factId?: string;        // provenance — which fact established this
  confidence?: number;    // 0–1
  recordedAt?: string;    // ISO datetime
}
```

`EntityProfile` fields become `ProfileEntry[]` instead of `string[]`. The provenance fields are optional, so KyberBot's current flat-string emissions migrate trivially (wrap each string in `{value}`). Brain's structured arrays project naturally onto this shape.

## Why this is not retreat

The frame to resist: "Arcana picked the wrong shape; we're backing out." That's not the situation.

The actual situation:

- KyberBot independently converged on Arcana's shape on a different database. The shape was right.
- Brain diverged on three points; all three are Convex's footprint, not domain disagreement.
- Brain diverged on two further points that *are* genuine domain features Arcana should add. They are additive.

The honest one-line summary: **Arcana picked the right shape. Two additions; everything else stays.** That's not retreat, it's vindication with footnotes.

## Process rule reinforced

This is the **fifth instance** of ADR 005's "audit consumer code before deciding" rule paying out, with a twist: this time the audit's *first* conclusion (yellow-light) was itself a premature decision. The second-order audit — comparing Brain against a counterfactual storage choice and against KyberBot's actual choices — was needed to separate domain signal from database noise.

The lesson for future audits: when a consumer's shape disagrees with a contract, ask *what would a thoughtful engineer building this on a different database have done?* before concluding the contract is wrong.

## Consequences

### Positive

- The "egg on face" question is answered: the shape was right, the audit conclusion needed correcting, the contracts grow only by what consumers genuinely need.
- KyberBot's 15-module dual-write is **confirmed** as the architecture, not a transitional pattern. No surprise deprecation surface for Ian.
- Brain's eventual adapter has a clear contract — translate Convex shapes to/from Arcana's `NodeRef`/`Entity`/enum vocab. The translation is local to the adapter; the rest of the system is unaware.
- The brain-takeover scenario (project memory `project-brain-takeover`) is no longer load-bearing for the shape question. Whether David takes over Brain or not, the shape is the same.

### Negative

- Three schema additions (`Memory.status`, `Memory.isLatest`/`supersededBy`, `ProfileEntry`) are forward-incompatible with v0.x in-flight consumers. Mitigated by Arcana being pre-1.0; all current consumers (KyberBot via dual-write) re-pin on the new version.
- The yellow-light verdict in `docs/ideas/kybernesis-brain-data-model-audit.md` is now stale. That doc is superseded by this ADR (note added there).
- The `EntityProfile` change is the largest of the three additions — every consumer producing profile data has to migrate `string[]` → `ProfileEntry[]`. Migration is mechanical (wrap each string).

### Neutral

- The schema/interface evolution trail continues. `.mochaccino/data/04-contracts-surface.json` to be updated alongside implementation work (separate PR).
- ADR 005's process rule is reinforced again; ADR 003 → 004 lineage and the audit-consumer-code principle remain canonical.

## Implementation work following this ADR

Tracked separately from this ADR, in this order:

1. Add `MemorySchema.status` enum + field
2. Add `MemorySchema.isLatest` + `MemorySchema.supersededBy`
3. Add `command.markMemorySuperseded` kernel method + `StructuredStore.markMemorySuperseded` provider method
4. Define `ProfileEntrySchema`; change `EntityProfileSchema` array fields from `string[]` to `ProfileEntry[]`
5. Migrate testkit fake + tests
6. Update `.mochaccino/data/` evolution records
7. CHANGELOG entry

Each is small (< 100 LOC) and independently shippable. The order is dependency-driven, not priority-driven.

## Related

- `docs/audits/kybernesis-brain-data-model-audit.md` — the initial audit that surfaced the 5 misfits and the (now-corrected) yellow-light verdict
- `docs/audits/brain-structure-vs-convex.md` — the structural analysis that separated Convex artifacts from domain insight; the load-bearing input to this ADR
- `docs/ideas/kybernesis-brain-data-model-audit.md` — parked idea doc; superseded by this ADR (yellow-light verdict invalid)
- `docs/strategy/shape-thesis.md` — narrative companion to this ADR (story-form for cold-start readers and agent context)
- ADR 005 — codifies the audit-consumer-code process rule this ADR applies at the contract level
- ADR 006 — most recent prior schema addition (`Contradiction.rationale`); same principle of growing only by demonstrated consumer need
- Project memory `project-brain-takeover` — strategic context; no longer load-bearing for the shape question after this ADR
