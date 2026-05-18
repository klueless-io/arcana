# ADR 006 — Contradiction.rationale addition + correctFact stub deletion

**Status**: Accepted
**Date**: 2026-05-18
**Driven by**: KyberBot module #11 (sleep/observe.ts) audit

## Context

Module #11 needed two write-paths on the Arcana side to mirror KyberBot's supersede + contradiction lifecycle from `sleep/observe.ts`:

1. **Pure-link supersession**: `UPDATE facts SET is_latest=0, superseded_by=? WHERE id=?` — KyberBot already calls this against its local store via `markFactSuperseded` in fact-store.ts.
2. **Contradiction creation**: KyberBot's `createContradiction` (in entity-graph.ts) records the detected conflict between two facts plus the Haiku-extracted rationale for why they conflict.

The audit also re-evaluated the existing stub `command.correctFact(oldFactId, newValue: string)` against real consumer patterns.

## Decision

### 1. Add `command.markFactSuperseded(oldFactId, newFactId): Promise<void>`

Pure-link primitive matching KyberBot's existing pattern: the new fact is already created via `recordFact` upstream; this kernel method just joins them by updating `isLatest=false` and `supersededBy=newFactId` on the old fact.

Lives on the kernel surface (`command.markFactSuperseded`) and on the provider surface (`StructuredStore.markFactSuperseded`). The provider-level method is a specialised lifecycle op rather than a generic `updateFact` — supersession is the dominant fact mutation in practice, and keeping it specific enforces the semantic invariant that `isLatest=false` only sets WITH `supersededBy=newId`.

### 2. Add `command.storeContradiction(input): Promise<string>`

Kernel-level convenience over the existing `StructuredStore.storeContradiction`. Mints `id` (UUID) + `createdAt` automatically; defaults `status` to `'pending'`. Input shape:

```ts
interface StoreContradictionInput {
  factAId: string;
  factBId: string;
  status?: ContradictionStatus;
  rationale?: string;
}
```

### 3. Add `rationale?: string` to `ContradictionSchema`

The audit revealed a real data shape KyberBot produces (`description` — the Haiku-extracted explanation of why two facts conflict). The original Contradiction schema had no place for this; KyberBot's lean was to discard the rationale on mirror.

Decision: **capture it as `rationale?: string`** (renamed from KyberBot's `description` to avoid semantic collision with Arcana's existing `resolution` field). Two axes:

- `rationale` — why detected (input, set at create time)
- `resolution` — how resolved (output, set when status transitions)

Reasoning:

- This is **not** an ADR 003 anti-pattern. ADR 003 was about adding fields *no consumer was producing*. Here KyberBot **is** producing the rationale right now — we have a real consumer feeding real data. The principle is "build to what the actual consumer code does," not "build the minimum."
- Reversibility math favours capture: discarding now and adding later loses rationale for all historical mirror records (recoverable only if KyberBot still has local denorms). Adding now and never using costs ~50 bytes per row.
- The rationale is the **load-bearing signal** of a contradiction record. Without it, contradictions are opaque (just two fact ids); with it, future consumers (Kybernesis Brain UI, eval-suite traces) can display the why.

The field is optional. Existing consumers that don't produce rationales (or older mirror records) are unaffected.

### 4. Delete `command.correctFact(oldFactId, newValue: string)` stub

The stub's signature was a combined "create-new-fact-from-value + supersede-old" operation. KyberBot's audit confirmed no consumer uses this pattern. The real pattern is:

1. Create the new fact via `recordFact` upstream
2. Link old to new via `markFactSuperseded`

No combined create-and-supersede primitive is needed. Per ADR 005's process rule — **audit consumer code before deciding** — and the demand-driven adoption principle, dead stub surface area is deleted rather than kept.

If a future consumer surfaces a genuine need for a combined op, it can be added back with a clean signature informed by the real use case.

## Process rule reinforced

This ADR is the **fourth instance** of ADR 005's "audit consumer code before deciding" rule paying out:

1. **ADR 003 → 004**: Audit revealed FactSchema required triples that neither consumer produced.
2. **ADR 005**: Audit revealed both consumers updated memories in place, contradicting the brain doc's append-only claim.
3. **Module #6 (19:45 comms)**: Audit revealed fact-contradiction.ts is a pure detector, not a state mutator.
4. **This ADR**: Audit revealed `correctFact`'s combined-op shape doesn't fit any consumer; `markFactSuperseded` + an existing `recordFact` is the real shape.

KyberBot's framing from module #7 close — *"don't act on the playbook's prediction without reading the actual code"* — is the canonical one-line version.

## Consequences

### Positive

- Two kernel methods move from stubbed to implemented (9 → 11 of 21).
- One stub deleted (12 → 10 stubs remaining).
- Contradiction records gain the detection-time rationale, useful for both debugging and future UI surfacing.
- KyberBot can close module #11 with a clean mirror of both supersede + contradiction paths.

### Negative

- `Contradiction` schema gains one optional field. Minor migration cost for any provider implementing the contract (additive, backward-compatible).
- `StructuredStore` interface gains `markFactSuperseded`. Existing providers (the in-memory testkit fake) updated alongside this ADR; future providers (libsql, Convex) implement it as part of their fact-table support.

### Neutral

- The schema/interface evolution trail extends. See `.mochaccino/data/04-contracts-surface.json` for the updated history (Contradiction: +rationale; StructuredStore: +markFactSuperseded).

## Related

- ADR 003 (superseded by 004) — original facts-as-triples decision
- ADR 004 — corrected FactSchema for sentence-form facts
- ADR 005 — Memory updates + the audit-consumer-code process rule
- KyberBot module #6 ANSWER (comms 2026-05-18 19:45) — first foreshadowing of `markFactSuperseded`
- KyberBot module #11 audit (comms 2026-05-18 22:05) — the audit that produced the contract decisions
- KyberBot module #11 ANSWER (comms 2026-05-18 22:10) — three decisions: Q1.a / Q2.b / delete correctFact
