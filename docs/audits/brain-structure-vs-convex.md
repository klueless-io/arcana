# Brain's structure: domain insight or Convex artifact?

> Generated: 2026-05-19
> Method: read Brain's `apps/convex/convex/schema.ts` + KyberBot's SQLite DDL
> (`packages/cli/src/brain/entity-graph.ts`, `sleep/db.ts`, `fact-store.ts`,
> `timeline.ts`) side-by-side, plus the existing Arcana audit. KyberBot is a
> live natural experiment: same domain, same author, relational DB. What it
> chose to do differently is signal.

## 1. TL;DR

**KyberBot has the smarter brain.** Most of Brain's "interesting" structural
choices — the four-flat-ID edges, the `memoryEntities` shadow rows, the
structured-array `entityProfiles`, the mixed `resolution`/status field on
contradictions — are **Convex-driven coping mechanisms**, not domain insight.
KyberBot, building the same concepts on SQLite, made the cleaner choice every
single time: text-path edges (no entity-shadow needed), CHECK-constrained
entity types matching Arcana's enum exactly, a single narrative TEXT for
profiles, FK constraints with cascade deletes, status-only contradictions.

Two of Brain's five choices *do* survive the database swap as genuine domain
insight: **(a) memory-level supersession** (`isLatest`/`supersededBy` on
`memoryItems`) — Arcana only models this for facts — and **(b) richer fact
temporal model** (`temporalRef` with date/granularity/isExpired vs Arcana's
flat `expiresAt`). The other three are Convex-shaped accidents that Arcana
should not import.

## 2. Feature-by-feature

### Edges as 4-flat-IDs (`fromEntityId/toEntityId` + denormalized `fromMemoryId/toMemoryId`)

- **Convex-driven?** **Yes, heavily.** Convex has no JOIN, no polymorphic
  associations, no FK enforcement. Brain wants graph traversal indexed both
  ways (entity-graph *and* memory-graph), so it denormalizes memory IDs onto
  every edge row to get `by_from_memory` / `by_to_memory` indexes. On
  Postgres a single `nodes` table with `(node_type, node_id)` plus a single
  `edges(from_node_id, to_node_id, ...)` would carry the same load with no
  duplication — JOIN is free.
- **Postgres equivalent** — idiomatic choice is either (a) polymorphic
  `(node_type, node_id)` columns on a single `edges` table, or (b) a unified
  `nodes` view with `UNION ALL` over `memories` + `entities`. KyberBot picked
  effectively option (a) but using a single TEXT `from_path` / `to_path`
  column (URI-encoded node ref) — even simpler and exactly Arcana's `NodeRef`
  serialized.
- **Smart or coping?** **Coping.** The four-column shape only exists because
  Convex can't cheaply join across `memoryItems` and `memoryEntities` from an
  edge row. KyberBot's `memory_edges` doesn't even *have* the problem.

### `memoryEntities` shadow rows (`memory:<id>` / `type='memory_item'`)

- **Convex-driven?** **Yes — this is the cleanest example of the whole pattern.**
  The shadow rows exist *only* to make every edge an entity→entity edge so
  the `by_entities` index keeps working. It's a Convex coping mechanism on
  top of the previous coping mechanism.
- **Postgres equivalent** — none needed. A polymorphic `edges` table or a
  `nodes` view eliminates the problem. KyberBot has no shadow rows; entities
  and timeline events are cleanly separated.
- **Smart or coping?** **Pure coping.** It's an anti-pattern Arcana should
  not adopt under any circumstances. The audit caught it for the right reason.

### `entityProfiles` with structured arrays (`staticFacts[]`, `dynamicContext[]`)

- **Convex-driven?** **Partially.** Convex nudges document-shaped thinking;
  structured arrays inside a row are *idiomatic* Convex. On Postgres the same
  data would naturally normalize into two child tables (`profile_static_facts`,
  `profile_dynamic_context`) with FKs, or live in JSONB. KyberBot picked a
  third option: just a `profile TEXT` narrative + `fact_count INTEGER` — much
  simpler, because the structured arrays are derivable from `facts` on demand.
- **Postgres equivalent** — best is child tables with FK + `factId` reference
  (which is what Brain's structured shape is *trying* to express, badly).
  JSONB is acceptable but pays the same provenance-loss cost as Brain's
  arrays.
- **Smart or coping?** **Mostly coping, but with a real provenance instinct
  inside it.** The instinct ("static facts should carry confidence + factId
  provenance") is good and would survive Postgres. The shape (arrays of
  objects rather than child tables) is Convex-flavored. Arcana's current
  string-only shape is *too* sparse and KyberBot's narrative-only shape is
  *also* too sparse — Arcana's choice point is whether to formalize the
  provenance via a Summary/Profile-Entry child schema.

### `Memory.status` soft-delete + `isLatest` / `supersededBy`

- **Convex-driven?** **No.** Soft-delete is database-independent — Postgres
  apps reach for `deleted_at` columns or status enums constantly. KyberBot
  doesn't have a `status` on its facts/entities currently (it deletes rows),
  but that's a KyberBot choice, not a relational-DB constraint. The
  *memory-level supersession* (`isLatest` + `supersededBy` on `memoryItems`,
  not just facts) is a domain decision Brain made independently and Arcana
  doesn't currently model.
- **Postgres equivalent** — same shape. `status` enum + nullable
  `superseded_by` FK. Trivial. PostgreSQL would actually enforce the FK,
  which Brain can't.
- **Smart or coping?** **Genuinely smart.** Memory-level supersession is a
  real domain feature Arcana lacks. Soft-delete is load-bearing for any
  knowledge system that needs auditability. Both survive any DB choice and
  Arcana should grow them.

### Rich enum vocabularies (`source`, `sourceType`, `itemType`)

- **Convex-driven?** **Mixed.** Convex has no native enum, only TypeScript
  `v.union` validators — so Brain often falls back to `v.string()` with a
  comment listing values (e.g. `source: v.string()` with inline doc
  "manual | connector | …"). That's why Brain's enums drift: there's no DB
  enforcement to keep producers honest. KyberBot's SQLite uses
  `CHECK(type IN ('person','company','project','place','topic'))` — and that
  enum matches Arcana's `EntitySchema` exactly, suggesting the *vocabulary*
  is the natural one when the DB enforces it.
- **Postgres equivalent** — first-class `CREATE TYPE … AS ENUM` or
  CHECK constraints or lookup tables. All enforce. Brain's drift
  (`user_correction`, `agent_chat`, `connector_sync` for fact sourceType vs
  Arcana's `terminal|chat|ai-extraction|upload|connector`) is *exactly* the
  drift you get when the DB doesn't enforce.
- **Smart or coping?** **The content of Brain's vocabulary is fine; the
  shape (free strings) is coping.** On Postgres these would be enforced
  enums and would have stayed canonical. The mismatch with Arcana is a
  symptom of Convex's enum-weakness, not a deliberate semantic divergence.

## 3. Counterfactual: Brain on Postgres

If Brain had been built on Postgres/Supabase, the Arcana misfit catalog
shrinks substantially:

- **Misfit #1 (edges 4-flat-IDs)** — **gone.** Postgres-Brain would have
  either polymorphic `(node_type, node_id)` columns (one-step from Arcana's
  `NodeRef`) or a `nodes` view. Arcana's `NodeRef` would map directly.
- **Misfit #2 (`memoryEntities` shadow rows)** — **gone.** No reason to exist
  on Postgres. `memoryEntities` would be a clean real-entity catalog and
  match Arcana's `EntitySchema` enum almost word-for-word (because KyberBot
  shows that's the natural choice).
- **Misfit #3 (structured `entityProfiles`)** — **partially survives.** A
  thoughtful Postgres engineer would still want per-fact provenance on a
  profile entry, but they'd model it as child tables with FK, not as
  arrays-of-objects-inside-a-row. The *intent* (provenance) survives; the
  *shape* changes. Arcana would still need to widen its schema to capture
  the provenance — but as a `ProfileEntry` schema, not as inline arrays.
- **Misfit #4 (`Memory.status`)** — **stays the same.** This is a real
  domain feature regardless of DB. Arcana needs it either way.
- **Misfit #5 (`source`/`sourceType` enum drift)** — **gone or much
  smaller.** Postgres enums would have prevented the drift in the first
  place; Brain's values would have converged with Arcana's, not diverged.

Net: of the 5 misfits, **3 are Convex artifacts that disappear on
Postgres**, 1 stays the same (status), and 1 survives in modified form
(profile provenance). The "structural disagreement" the audit called
high-severity is almost entirely a Convex disagreement.

## 4. Honest takeaway

**Arcana should not import Brain's structural choices.** The
four-flat-ID edges, the shadow-row pattern, the structured-array profiles,
and the loose enum strings are *not* concepts that Arcana lacks — they are
Convex's footprint on Brain's body. KyberBot, working the same domain on a
relational substrate, made every one of those calls the way Arcana already
makes them. That's the strongest possible signal that Arcana's current
`NodeRef`, closed-enum `Entity.type`, and clean source/sourceType
vocabularies are the *domain-correct* shapes — not just one possible taste.

**Where Brain *does* teach Arcana** (the parts that survive the database
swap):

1. **Memory-level supersession** (`isLatest` + `supersededBy` on memories,
   not just facts) — real domain insight. Arcana should add this.
2. **`Memory.status` lifecycle field** — load-bearing for any audit-grade
   memory system. Arcana should add this.
3. **Per-entry provenance on entity profiles** — the *intent* behind
   `staticFacts[]` (each entry knowing its source factId + confidence) is
   right. Arcana should formalize a `ProfileEntry` schema rather than the
   current opaque `string[]`.
4. **Richer fact temporal model** — `temporalRef` (date + granularity +
   isExpired) captures things Arcana's flat `expiresAt` can't. Worth
   adopting as an optional structured replacement.

**Implication for the deprecation roadmap.** The "Arcana must adopt
entity-shadow + denormalized memoryId fast-path" question in the audit was
the wrong question to ask. The right framing: **Brain has a Convex-imposed
edge shape that no Postgres-backed adopter would carry, and Arcana is
already shaped for the Postgres-natural answer.** Brain's Convex adapter
should translate its 4-flat-IDs → `NodeRef` on the way out; Arcana should
not grow toward Brain's shape. The structural mismatch is real but the
asymmetry resolution is "Brain refactors at its Convex boundary," not
"Arcana grows a Convex-shaped concession."
