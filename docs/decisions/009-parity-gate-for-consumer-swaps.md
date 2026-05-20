# ADR 009: Parity Gate for Consumer Swaps

**Date:** 2026-05-20
**Status:** Accepted
**Deciders:** David Cruwys
**Related:** ADR 008 (Brain migration boundary), docs/plans/2026-05-20-fts-and-hybridsearch.md

---

## Context

When a consumer (KyberBot, Brain, KyberAgent Desktop) has a working in-house implementation of a capability (e.g. KyberBot's `cli/src/brain/hybrid-search.ts`), and Arcana then ships a kernel-side implementation of the same capability, the consumer can swap from its parallel implementation to the kernel.

The risk in that swap: the consumer's existing implementation is empirically known to work — humans use it, it satisfies known queries, it has earned trust by being in production. The kernel version, however cleaner architecturally, has no such track record against the consumer's real workload. Swapping blind risks silent regression: the new code "works" (no errors, tests pass) but ranks results worse, or omits results the old version returned, or shifts semantic intent in ways that are only noticed weeks later.

This ADR establishes a guardrail.

---

## Decision

**No consumer migrates from a working parallel implementation to a kernel implementation without a parity test that demonstrates equivalent or better output against a representative fixture set.**

The parity test is a precondition for the swap PR — it lives in the consumer's repo (because it is the consumer's risk), uses the consumer's real data shape and query patterns, and is reviewed alongside the swap diff.

This is a *gate*, not a *blocker*. A failed parity test means the swap is paused until either the kernel impl is fixed or the divergence is explicitly accepted (with a recorded rationale).

---

## What a parity test looks like

A parity test is a function that:

1. Loads a representative **fixture set** — real or synthesised data that mirrors the production distribution (memories, facts, entities, queries the consumer actually runs).
2. Runs the **same query** through both implementations (the parallel impl and the kernel impl).
3. Compares the result lists and emits a pass/fail signal against an **overlap threshold**.

The default comparison strategy:

- **Top-N overlap** (N typically 10): of the top-10 result IDs from the parallel impl, what fraction appears in the top-10 of the kernel impl, ignoring order?
- **Threshold**: 80%. So at least 8 of 10 must match.
- **Order-sensitivity**: not required at v1. Many ranking changes are improvements; demanding exact-order match would block legitimate upgrades. Order-aware metrics (NDCG, Spearman ρ) are a future evolution if a consumer needs them.

Thresholds are tunable per capability — search may tolerate 80%, but a fact-retrieval method that must surface a specific fact for compliance reasons may demand 100% on its critical queries.

### Why 80%, not 100%

The kernel impl can legitimately *improve* on the parallel impl — better fusion, better tokenization, better ranking. Demanding 100% would freeze the kernel at the consumer's current quality forever.

80% leaves room for the new impl to differ on the long tail while requiring strong continuity on the head. A swap that fails 80% is almost certainly a regression; a swap that passes 80% but isn't 100% is likely an improvement that needs visual spot-check, not a block.

---

## Fixture set sourcing

The fixture set is the consumer's responsibility to provide and is **not synthetic-only**. A meaningful parity test draws from real query logs and real data, redacted as needed for privacy.

Minimum content:

- **Memories / facts / entities**: at least 100 records spanning the data shapes the consumer actually stores.
- **Query corpus**: at least 50 distinct queries the consumer has historically run, sampled across query archetypes (short keyword, long natural-language, entity-name, fact-attribute, etc.).
- **Provenance**: every fixture record links back to its source (anonymised log line, ticket ID, or synthetic-with-rationale).

The fixture set lives in the consumer's repo under `tests/fixtures/parity-<capability>/` and is version-controlled.

---

## When the gate fires

The parity test is required when **all** of:

- The kernel impl is non-trivial (more than a re-export).
- The consumer has a parallel impl that is in production use.
- The swap removes or bypasses the parallel impl (i.e. consumer code starts calling the kernel directly).

The parity test is **not** required when:

- The consumer is a new adopter with no prior parallel impl (Brain, day 1).
- The change is purely additive (kernel impl ships, consumer doesn't swap yet — sprint pattern in `docs/plans/2026-05-20-fts-and-hybridsearch.md`).
- The capability is structural (DDL, schema, type signatures) rather than algorithmic.

---

## Practical workflow

1. Kernel impl lands in Arcana (PR with kernel tests).
2. Consumer authors a parity test in their own repo, using their fixture set.
3. Parity test runs against both the parallel impl and the kernel impl on every CI run, comparing output.
4. Once the test passes the threshold on the chosen fixture set, the swap PR is opened.
5. Swap PR removes the parallel impl, wires the kernel call, and is reviewed alongside the parity-test history.
6. After the swap merges, the parity test stays in CI for one release cycle to catch regressions during the bedding-in period, then can be archived.

---

## Consequences

**Positive**

- Consumers swap with provable confidence, not blind trust.
- The kernel earns trust per-capability, per-consumer — no global "trust the kernel" leap of faith.
- The fixture sets accumulated over time become a regression battery for the kernel itself.

**Negative**

- Each swap has a setup cost — the consumer must invest in fixture curation before swapping.
- Parity tests have to be maintained as kernel behavior evolves; threshold drift can mask gradual regressions.
- The 80% threshold is a judgment call and may be wrong for capabilities where the long tail matters more than the head.

**Mitigations**

- The fixture set is reusable across future swaps for the same capability.
- The harness can be open-sourced as part of `@kybernesis/arcana-testkit` once the shape stabilises, lowering the per-consumer setup cost to near-zero.

---

## Future evolution

- **Shared harness in arcana-testkit**: factor out the comparison logic so consumers only supply fixtures + the two implementations under test.
- **Order-aware scoring**: add NDCG@10 or Spearman ρ when a consumer needs ranking-stability proofs.
- **Multi-version parity**: when kernel impls themselves evolve (v0.2 → v0.3), the same harness can prevent within-kernel regressions.
- **Failure triage tooling**: when a parity test fails, produce a diff report — which specific queries dropped which specific IDs — so the consumer can decide whether the divergence is a regression or an improvement.
