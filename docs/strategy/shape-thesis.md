# The Shape Thesis

> Companion narrative to **ADR 007**. The ADR is the decision; this is the story.
> **Read this first** if you're a new contributor (human or agent) trying to understand why Arcana looks the way it does.

## What Arcana is — and what it isn't

Arcana is a **portable brain library**. It encodes the rules of how brain knowledge behaves — how facts supersede each other, how memories decay, how contradictions get recorded and resolved, how tiers promote, how retrieval composes.

It is **not** a portable database. Two consumers — KyberBot (running on libsql/SQLite) and Kybernesis Brain (running on Convex) — have their own storage with their own native shapes. They will always store records differently because they run on different databases. That is fine, and the right framing.

What Arcana centralises is the **logic that operates on brain knowledge**, expressed via Zod contracts that describe *what brain concepts mean*, plus a `StructuredStore` provider interface that each consumer implements in terms of its own storage.

The slogan: **portable rules, not portable records.**

## How we arrived here

For a while, the framing was looser. We talked about Arcana as "the shared data model" — which suggested both that the contracts captured domain concepts (true) *and* that records could move between consumers (an unexamined corollary). When Brain's data model was audited in May 2026, that second part is what surfaced as a problem.

The audit found five "misfits" between Brain's Convex schema and Arcana's contracts:

1. Brain uses four flat ID columns on edges (`fromMemoryId`/`fromEntityId`/`toMemoryId`/`toEntityId`); Arcana uses a `NodeRef` discriminated union
2. Brain creates a shadow `memoryEntities` row for every memory; Arcana's `Entity` is strictly real-world
3. Brain's `EntityProfile` uses structured arrays with provenance; Arcana uses flat `string[]`
4. Brain has `Memory.status` (active/archived/deleted); Arcana doesn't
5. Brain's `sourceType` and `source` enums have zero overlap with Arcana's — different vocabularies entirely

The audit's verdict was YELLOW-LIGHT: Arcana couldn't serve as Brain's source of truth without contract-level changes. The implication was that Arcana was wrong somewhere, and either Arcana had to grow or one of the consumers had to bend.

That conclusion turned out to be itself premature. The second-order question — **are Brain's choices intrinsically domain-driven, or are they artifacts of Convex?** — wasn't asked in the first audit, and the answer changed the whole picture.

## The natural experiment

KyberBot and Brain solve the same domain on different databases. KyberBot is libsql/SQLite — full FKs, CHECK constraints, JOINs are free, enums are CHECK-enforced. Brain is Convex — no JOIN, no DB-enforced enums, denormalisation is the default. Same problem, two databases.

If KyberBot and Brain made the *same* modelling choices, that would be domain signal: any thoughtful engineer building this would converge here. If they diverged, that's database signal: one or both is shaped by its storage rather than by the domain.

We ran the comparison (`docs/audits/brain-structure-vs-convex.md`). The result was striking:

- **KyberBot's edges**: text-path edges that map cleanly to Arcana's `NodeRef`. Identical concept.
- **KyberBot's entities**: no shadow rows. Same as Arcana.
- **KyberBot's enums**: CHECK-constrained vocabularies that match Arcana's `EntitySchema` enum *exactly*.
- **KyberBot's profile fields**: flat narrative columns. Same as Arcana's `string[]`.
- **KyberBot's `Memory.status`**: present. (Arcana is the outlier here, not KyberBot.)
- **KyberBot's memory supersession**: present. (Arcana is the outlier here too.)

KyberBot — built without consulting Arcana on these decisions, working the same domain on a different database — independently converged on Arcana's shape for **everything except two genuine domain features Arcana was missing.**

That's the strongest possible signal that Arcana's shape was right. The misfits with Brain weren't ontology disagreements; they were Brain's database showing through.

## The two genuine lessons

There are two places Brain teaches Arcana something real:

1. **`Memory.status`** — soft-delete and lifecycle states are load-bearing for any audit-grade system. Both KyberBot and Brain have it; Arcana doesn't. This isn't Convex bleed-through, this is a feature Arcana should add.

2. **Memory-level supersession** — Arcana already has fact-level supersession (`Fact.isLatest` + `Fact.supersededBy` + `markFactSuperseded`). Brain extends the same pattern to memories. Same rule, applied to a parent concept. Natural extension.

Plus one shape-correction:

3. **`ProfileEntry` over `string[]`** — Brain's structured profile arrays have the right *intent* (each entry carries provenance: which fact established it, when, with what confidence). They have the wrong *shape* for a portable library (arrays-in-row is a Convex denormalisation choice). The fix is to formalise a `ProfileEntry` schema: `{ value, factId?, confidence?, recordedAt? }`. KyberBot's current flat strings migrate trivially (`{value}`-wrap); Brain's arrays project naturally.

## What stays the same

- `NodeRef` (discriminated union for edge endpoints) — vindicated by KyberBot
- `Entity` (strictly real-world, no shadow rows) — vindicated by KyberBot
- Enum vocabularies for `sourceType`, `source`, `entity.type` — vindicated by KyberBot's matching CHECK constraints
- `FactSchema`, `ContradictionSchema` (with the additions from ADRs 003–006) — already validated through KyberBot's 15-module dual-write

The audit's five misfits, after correction: two contract additions, one shape refinement, two adapter concerns. That's the headline.

## The provider model, doing its job

Arcana has always had a `StructuredStore` provider interface. The intent was that each consumer's adapter would translate between the consumer's native storage shape and Arcana's contract shape. That intent was right; we just hadn't fully internalised what it meant.

The three "Brain misfits" that aren't being absorbed into Arcana — 4-flat-ID edges, shadow entities, loose enum vocab — are exactly what the adapter is for. When Brain's adapter ships, it'll:

- Read 4-flat-ID rows from Brain's `edges` table; project them as `NodeRef`-shaped `Edge` objects on the way out; do the reverse translation on writes
- Filter out shadow `memoryEntities` rows when projecting `Entity` for callers expecting real-world entities only
- Map Brain's loose `sourceType` strings to/from Arcana's tight enum on read/write, with explicit fallback policy for unknown values

That's just adapter work — local, encapsulated, doesn't leak upward.

## What this thesis means for callers

If you're writing code that depends on Arcana:

- You can rely on the contracts as the canonical shape of brain concepts. They won't deform to fit any single consumer's storage.
- You can't assume records will be byte-identical across consumers. Brain's stored row for memory `mem_123` won't look like KyberBot's stored row for memory `mem_123` — they're different storage shapes — but the projected `Memory` object via `StructuredStore` will be the same contract.
- New schema additions happen when consumer code demonstrates a genuine need (ADR 005's process rule). They don't happen because one consumer's storage has a convenient field.
- Adapter complexity grows with each new consumer; contract complexity does not. This is the right asymmetry.

## What this thesis means for ADRs going forward

When a future audit surfaces a "misfit" between Arcana and a consumer, the first question to ask is **not** "should we change the contract?" The first question is **"is this misfit domain-shaped or storage-shaped?"** Run the counterfactual: would a thoughtful engineer building this domain on a different database also have produced this shape? If yes, it's domain; the contract may genuinely need to evolve. If no, it's storage; the adapter handles it.

ADR 007 codifies this question as the canonical decision lens for shape conflicts. Future ADRs should reference back to it whenever a shape question is in play.

## For agents picking this up cold

If you're an LLM agent (a Claude session, a teammate agent, anything else) reading this for the first time and trying to orient:

- The load-bearing decision doc is **ADR 007** (`docs/decisions/007-shape-thesis-portable-rules-not-records.md`). This narrative summarises it; the ADR is authoritative.
- The audit chain is: `docs/audits/kybernesis-brain-data-model-audit.md` (initial, yellow-light, superseded) → `docs/audits/brain-structure-vs-convex.md` (second-order, the analysis that flipped the verdict) → ADR 007 (decision).
- The parked idea doc at `docs/ideas/kybernesis-brain-data-model-audit.md` is the historical precursor. Its yellow-light verdict is no longer accurate; ADR 007 is the current position.
- The ADR sequence 001–007 tells the full evolution story of Arcana's contracts. Read them in order if you're trying to understand why any given schema looks the way it does.
- KyberBot's adoption playbook (`~/dev/kybernesis/.comms/arcana-kyberbot.md`) is the per-module audit trail that produced ADRs 004–006 and confirmed Arcana's shape on the KyberBot side. The five-instance lineage of ADR 005's "audit consumer code before deciding" rule is documented in ADR 006 and 007.

## What's next

Three additive schema changes to land:

1. `Memory.status` field (ADR 007 §3.1)
2. `Memory.isLatest` + `Memory.supersededBy` + `markMemorySuperseded` kernel/provider methods (ADR 007 §3.2)
3. `ProfileEntry` schema replacing `EntityProfile`'s `string[]` fields (ADR 007 §4)

Each is small and independently shippable. None requires changes to consumer storage; all are forward-incompatible only in the sense that consumers re-pin to the new Arcana version.

The work that's *not* happening: no contract changes for edges, entities, or enums. No deprecation of KyberBot's dual-write. No blocking on Ian. No grand redesign. Two additions and a refinement. That's it.
