# ADR 013: Deepen the Fact Schema Before Building the Sleep Pipeline

**Date:** 2026-05-22
**Status:** Accepted
**Deciders:** David Cruwys
**Related:**
- [ADR 011](./011-port-first-improve-later.md) — port-first principle (this ADR is its application to facts)
- [ADR 004](./004-fact-schema-optional-triple-decomposition.md) — fact schema rationale (now superseded in scope by this ADR)
- [ADR 010](./010-sleep-pipeline-step-reconciliation.md) — sleep pipeline step set (depends on the schema chosen here)
- `kyberbot/packages/cli/src/brain/fact-store.ts` — empirical source of truth
- v0.4.1 plan Findings appendix — schema-depth divergence inventory

---

## Context

v0.4.1 ported KyberBot's 4-layer `factRetrieval` algorithm but kept the existing thin `Fact` schema. The Findings appendix documented a divergence: KyberBot's `facts` table carries `source_path`, `source_conversation_id`, `entities_json` (multi-entity), `category`, and a fact-level FTS5 index. Arcana's `Fact` carries a single `entity`, no source backlink, no category, and has no fact-level full-text search.

Two facts pull this into the critical path now (not "someday"):

1. **KyberBot is both the consumer AND the empirical source.** The original argument for deferring v2 — "wait for a consumer to demand it" — was wrong. ADR 011 (port-first) runs on the existence of a working empirical impl, which KyberBot already has in `fact-store.ts`. There is nothing to wait for; the shape is known. Deferring v2 doesn't make the eventual port cheaper, just later.

2. **The sleep pipeline produces facts.** If sleep ships against today's thin schema, it generates a corpus of thin facts. Deepening the schema later forces a corpus migration. Deepening the schema first means sleep produces rich facts from day one — no migration debt, no schema-evolution-mid-corpus problem.

The mission of Arcana is parity-via-swap: KyberBot eventually drops its local `fact-store.ts` and consumes Arcana. That swap is blocked until Arcana's facts can carry the data KyberBot's retrieval depends on. Permanently parking facts is a real option, but it would amount to "Arcana is everything except facts," changing the parity story. That trade-off should be a deliberate decision, not a side-effect of sequencing.

---

## Decision

**Deepen the `Fact` schema and the fact-retrieval pipeline before building the sleep pipeline.**

Concretely, the next sprint after v0.5.0 (LLM Claude Code provider) is v2 factRetrieval, shipped as a coherent five-piece change in a single major-version bump.

### The five pieces, shipped together

1. **`FactSchema` widening** in `arcana-contracts`:
   - `entities: string[]` replaces single `entity` (denormalised entity list per fact)
   - `sourceMemoryId?: string` — backlink to the memory the fact was extracted from
   - `sourcePath?: string` — file/note origin (when applicable)
   - `sourceConversationId?: string` — conversation/session origin (when applicable)
   - `category?: FactCategory` — `'biographical' | 'preference' | 'general' | …` (enum ported from KB)

2. **Provider contract**: `StructuredStore.searchFactsFulltext(...)` (new method, sibling to existing `searchFulltext` on memories). Returns fact rows with normalised 0..1 score and matched-field metadata. Same shape conventions as the memory FTS method.

3. **libsql migration**: `facts_fts` FTS5 virtual table over `content` and `entities`, with INSERT/UPDATE/DELETE triggers mirroring the existing memory pattern. Auto-runs on provider `connect()` for forward compatibility.

4. **Ingest layer**: `ingest.extractFacts` populates the new fields. LLM extraction prompt change — ask for entity list (not single entity), category classification, and pass through the source memory id automatically.

5. **`factRetrieval` algorithm**: gains a 5th layer "direct fact-FTS" that runs first, ahead of the existing 4 (direct memory FTS → entity expansion → graph expansion → bridge). Returns the rich bundle shape — `supporting_context`, `assembled_context`, `token_estimate`, `stats` — ported from KB.

You cannot ship a subset and have anything useful. Schema-only without retrieval is a wider contract for zero benefit. Retrieval-only without schema is impossible — there's nothing to retrieve over. Hence one sprint.

### Sequencing

1. ✓ v0.5.0 — LLM Claude Code provider (shipped 2026-05-21)
2. **v1.0.0** — v2 factRetrieval (this ADR). Major bump: `FactSchema` widens, `StructuredStore` gains a method, default fields change. All breaking on paper; no consumer has Arcana facts in production yet so the practical break cost is near zero.
3. v1.1.0+ — sleep pipeline. Produces rich facts from day one against the new schema. Ports KB's 10 steps per ADR 011; Arcana's 4 additional steps queued for v2 sleep.
4. KB factRetrieval swap unblocks naturally once #2 lands. Parity expectation: 100% on KB's existing factRetrieval test fixtures.

### Portability impact (explicit)

Deepening facts raises the floor for any provider implementation:

| Backend | What v2 demands | Feasible? |
|---|---|---|
| libsql | FTS5 virtual table on facts | Yes — same pattern as memories |
| Postgres | `tsvector` GIN index on facts.content + entities array column | Yes — standard Postgres |
| Convex | Convex full-text index on facts | Yes — native feature |
| In-memory testkit | naive substring scan | Yes — trivial |

Arcana stops being "any backend works" and becomes "any backend with full-text search works." This excludes pure DynamoDB / pure Redis / KV-only candidates. Given that every realistic consumer (KyberBot via libsql, Kyber in Cloud via Convex, future Brain via Postgres) has full-text search, this is the right trade-off. Not making fact-FTS optional — mandatory keeps the parity story clean.

---

## What this does NOT decide

- **The exact `FactCategory` enum members.** Ported from KB's `fact-store.ts` at sprint time, not pre-frozen here.
- **Whether `sourceMemoryId` is required or optional.** Optional in v1.0.0 (back-compat with existing thin facts in tests); may become required in a later major bump.
- **Rich-bundle field names.** Ported verbatim from KB's return shape; not designed here.
- **When sleep pipeline ships.** This ADR only fixes the ordering relative to v2 factRetrieval.

---

## Consequences

**Positive**

- Sleep pipeline produces rich facts from day one — no corpus migration debt.
- KyberBot's eventual `factRetrieval` swap is unblocked. Arcana's parity-via-swap story stays coherent.
- ADR 011 is honoured: KB's working impl is the source, not a speculative redesign.
- One major bump consolidates all fact-related breaking changes — clean changelog story.

**Negative**

- v1.0.0 lands sooner than otherwise planned. Calls for honest "major version means breaking" communication even though no consumer is actually broken in practice.
- Postgres / Convex / future providers now MUST implement fact-FTS. Higher floor for new backends.
- Pushes the sleep pipeline one sprint further out.

**Mitigations**

- All existing test fixtures backfill the new optional fields automatically via testkit helpers.
- Migration path documented in the v1.0.0 changelog with a working diff example.
- KB swap parity-test fixtures land alongside the sprint so the swap can be verified immediately on KB's side.

---

## Supersession

This ADR narrows ADR 004's "make attribute/value optional, keep Fact minimal" decision. ADR 004's rationale was that consumers vary in how much structure they produce; the new rationale is that consumers (KyberBot specifically) need richer metadata than the minimum, and the original minimum has become an obstacle to parity. ADR 004 still governs the `attribute`/`value` optionality within the now-deeper schema.
