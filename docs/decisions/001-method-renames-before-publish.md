# ADR 001 — Method renames before publish

**Status**: Accepted
**Date**: 2026-05-18
**Decider**: David Cruwys (AppyDave)

## Context

KyberBot's module #2 adoption (entity-graph.ts) surfaced that `command.linkMemories` accepted `NodeRef` — a discriminated union of `{type: 'memory'}` and `{type: 'entity'}` — meaning the method always operated on *nodes*, not specifically memories. The name disagreed with the signature.

The principle being tested: should consumer feedback drive API renames in the canonical library?

## Decision

**Renamed `command.linkMemories` → `command.linkNodes`.**

This rename was justified on **API-design grounds independent of who raised it**. The method signature already took a polymorphic `NodeRef` — the name was simply incorrect. If a hypothetical second consumer had asked the same question independently, the same mismatch would have surfaced.

## Naming policy (general)

Two principles cohabit:

1. **The library sets the vocabulary; consumers conform.** Pre-emptive renames driven by one consumer's mental model are an anti-pattern — they shape API choices around the first adopter's preferences, leaving the second adopter dealing with KyberBot-flavored names. Avoid this.

2. **Rename when the name is provably wrong.** When a method's signature contradicts its name, that's not a consumer-preference issue; it's a code-quality issue. Rename regardless of who noticed.

The test for whether a rename is justified: *would any independent reviewer find the existing name inconsistent with the signature/behavior?* If yes → rename. If it's just consumer mental model differing from the library's design → don't rename; document the library's vocabulary.

## Rename window

Arcana is **pre-publish**. Renames cost nothing right now — there are no external consumers locked to specific identifiers. The window for free renames closes the moment `arcana-core` publishes to npm at v0.1.0.

**Post-publish, renames are breaking changes**: bump major version, deprecate old name, retain it as an alias for at least one minor cycle. Costs accumulate across every consumer.

**Implication**: any name-quality issues should be flushed *before* the first npm publish. Treat the pre-publish window as a focused cleanup phase.

## Consequences

- `command.linkNodes(from: NodeRef, to: NodeRef, relation: string, opts?)` is the canonical name. `linkMemories` no longer exists.
- KyberBot adoption uses `command.linkNodes` for entity↔entity, memory↔entity, and memory↔memory links uniformly.
- Future similar renames before v0.1.0 publish are encouraged when the criterion above is met. After publish, the bar moves to "breaking change worth the major bump."

## Process learning (procedural, not API)

The original rename was applied directly in commit `17c3f48` without first stating the rationale as a recommendation. Going forward, when an API change emerges during demand-driven implementation, **propose first, implement after acknowledgment** — even when the consumer asked the question that surfaced it. This keeps API decisions visibly attributable to the architect, not silently to whichever session happened to type the code.

## References

- Commit: `17c3f48 feat(arcana-core): command.upsertEntity, deleteEntity, linkNodes`
- Comms exchange: `~/dev/kybernesis/.comms/arcana-kyberbot.md` — 2026-05-18 13:00 (KBOT QUESTION) → 13:25 (ARCANA IMPLEMENTED)
- arcana-spec.md §14 — relation vocabulary unification remains open; the name change is orthogonal to vocab choices
