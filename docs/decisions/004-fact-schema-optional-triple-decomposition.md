# ADR 004 — Fact schema: sentence required, triple decomposition optional

**Status**: Accepted (supersedes ADR 003)
**Date**: 2026-05-18
**Decider**: David Cruwys (AppyDave)
**Discovered by**: David's challenge to the Fact triple semantic ("what problem does it solve?")

## Context

ADR 003 concluded that KyberBot's facts are sentence-shaped and should mirror to Arcana via `ingest.storeMemory`. That decision was based on the architectural premise that Arcana's `Fact` schema required `(entity, attribute, value)` triples — a shape that didn't fit KyberBot's extractor output.

David pushed back: *"If Arcana's Fact triple doesn't fit the first consumer, is it available for the second? What problem does it solve?"*

That challenge prompted an audit of the actual fact-extraction code in both consumers:

**KyberBot's `facts` table schema** (`packages/cli/src/brain/fact-store.ts`):
```sql
CREATE TABLE facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,              -- the sentence
  source_path TEXT UNIQUE,
  entities_json TEXT DEFAULT '[]',    -- LIST of entities mentioned
  confidence REAL,
  category TEXT,
  is_latest INTEGER, superseded_by INTEGER
);
```
Sentence + entity list. **No entity/attribute/value columns.**

**Kybernesis Brain's `memoryFacts` Convex table**:
```ts
{
  fact: v.string(),                    // REQUIRED — sentence form
  entity: v.string(),                  // REQUIRED — main entity
  attribute: v.optional(v.string()),   // OPTIONAL
  value: v.optional(v.string()),       // OPTIONAL
  confidence, isLatest, supersededBy, ...
}
```
Sentence + entity required; **triple decomposition optional.**

The extractor prompt in `apps/queue-worker/src/pipelines/fact-extraction.ts` confirms: *"identify... an attribute **if applicable**, a value **if applicable**"*.

**Arcana's original `FactSchema` required all three** (`entity`, `attribute`, `value`). That fit neither consumer.

## Decision

**Updated `FactSchema` in `arcana-contracts/src/fact.ts`:**

```ts
FactSchema = z.object({
  id: z.string(),
  fact: z.string().min(1),             // REQUIRED — sentence form
  entity: z.string().min(1),           // REQUIRED — subject
  attribute: z.string().optional(),    // OPTIONAL
  value: z.string().optional(),        // OPTIONAL
  confidence, sourceType,
  isLatest, supersededBy, ...
})
```

The schema now fits both consumers:
- KyberBot's facts populate `fact` and `entity` (picking first/primary entity from the list); attribute/value omitted
- Kybernesis Brain's facts populate `fact` and `entity`; attribute/value populated when decomposition succeeds

## Rationale

### Why have a separate Fact concept at all (the Memory-vs-Fact question)

Even sentence-form facts (no decomposition) provide queryable value that Memories don't:

| Query | With Facts table | With Memories only |
|---|---|---|
| "What do we know about David?" | `WHERE entity='David' AND isLatest=true` — fast indexed lookup | retrieve all memories mentioning David + LLM extract |
| "Has David's role changed recently?" | `WHERE entity='David' AND attribute='role'`; supersededBy chain | impossible without re-extraction |
| "Find contradictions about Acme's location" | structural duplicate detection on (entity, attribute) | semantic similarity + LLM analysis |
| Latest-vs-historical lifecycle | first-class via `isLatest` + `supersededBy` | not modeled |

Per-entity queryability, supersession lifecycle, and contradiction detection are real value-adds. They work even **without** triple decomposition — sentence-form facts with entity attribution suffice for most.

### Why the required-triple version was wrong

It was authored aspirationally from `~/dev/ad/brains/kybernesis/arcana-spec.md` §4, which claimed both KyberBot's and Kybernesis Brain's fact tables share `entity, attribute, value` fields. **The brain doc was over-specified** — it described an idealized triple model that neither real extractor produces. Reality is sentences-with-entity, sometimes with decomposition.

### Why this supersedes ADR 003

ADR 003's conclusion (KyberBot facts → `ingest.storeMemory` because they don't fit Arcana's Fact triple) was correct **only under the original (wrong) FactSchema**. With the corrected schema, KyberBot's sentence-shaped facts fit Arcana's Fact perfectly — they just leave attribute/value empty.

The architectural smell ADR 003 noticed (KyberBot's facts becoming Memories alongside conversations) is resolved: facts stay as Facts (with the sentence form preserved), Memories stay as content (conversations, documents). The semantic distinction is restored.

## Consequences

### Contract changes (already landed)

- `FactSchema.fact: z.string().min(1)` — new required field (sentence form)
- `FactSchema.attribute: z.string().optional()` — was required, now optional
- `FactSchema.value: z.string().optional()` — was required, now optional
- `RecordFactInput` interface updated to match (in `arcana-core/access/command`)

### Kernel methods now implemented

- `command.recordFact(input)` — was stub, now persists with defaults + validates via FactSchema
- `query.queryFacts(entity, attribute?)` — was stub, now reads via structured.getFactsForEntity, wraps in QueryResult envelope

### Documentation changes

- ADR 003 marked Superseded by ADR 004
- `docs/adoption/kyberbot.md` migration table row 4 reverted to `command.recordFact` (correctly this time)
- CHANGELOG.md notes the contract change
- `.mochaccino/data/06-kernel-methods.json` — `recordFact` + `queryFacts` move from stubbed → implemented

### Downstream impact on KyberBot

KyberBot's module #4 work (if done following ADR 003's now-superseded direction, using `ingest.storeMemory`) needs to flip to `command.recordFact`. Their dual-write wrapper changes one call site; tests update accordingly. The integration test stays the same shape. Schema migration columns (`arcana_memory_ids`) become `arcana_fact_id` (singular, since facts have a 1:1 mapping now, not 1:N).

If KyberBot hasn't started module #4 yet, this just changes which Arcana method they call — no rework.

### Downstream impact on Kybernesis Brain

Ian's adoption is unblocked and unambiguous: his fact-extraction pipeline produces the corrected shape natively. He calls `command.recordFact` directly with the full (entity, attribute, value, fact) payload.

## Process learning

This is the third time consumer-code audit corrected my upfront specification. The pattern is now severe enough to call out:

1. **ADR 001**: rename triggered by consumer question (`linkMemories` had a signature mismatch nobody had read)
2. **ADR 002**: contract addition (`deleteEntity`) — gap nobody had verified
3. **ADR 003 → ADR 004**: this one. My spec for Arcana's `Fact` table was based on the brain doc, which was based on what I *thought* both extractors produced, without ever reading either extractor's actual output.

**The corrective is: stop trusting derived analyses (brain doc) for primary architectural decisions. Read actual code.**

Specifically:
- The brain doc remains useful as a synthesized analysis
- But contracts in `arcana-contracts` must be grounded in actual consumer code, not the brain doc's interpretation of it
- When a consumer asks "does this fit my data?", the answer comes from reading their code, not from re-citing the brain doc

For future contract decisions:
- Before defining or modifying a schema in `arcana-contracts`, **read the corresponding code in at least one real consumer** (KyberBot's brain dir, Kybernesis Brain's queue-worker pipelines, or both)
- Treat the brain doc as a *map*, not the *territory*
- When in doubt, ask David to verify the claim against actual code before locking it

## References

- Commits:
  - `<HEAD>` — feat(arcana-core): record + query fact implementations, FactSchema corrected
- Comms exchange: `~/dev/kybernesis/.comms/arcana-kyberbot.md` — David's challenge "what does Arcana Fact triple solve?" (2026-05-18 ~15:00)
- Superseded: [ADR 003 — Facts as memories vs facts as triples](./003-facts-as-memories-vs-facts-as-triples.md)
- Code grounding:
  - `kyberbot/packages/cli/src/brain/fact-store.ts` (libsql schema)
  - `kybernesis-brain/apps/convex/convex/schema.ts` (memoryFacts table)
  - `kybernesis-brain/apps/queue-worker/src/pipelines/fact-extraction.ts` (extractor prompt + ExtractedFact interface)
- `~/dev/ad/brains/kybernesis/arcana-spec.md` §4 (the data-model claim that didn't survive audit) and §5.3 (fact extraction comparison)
