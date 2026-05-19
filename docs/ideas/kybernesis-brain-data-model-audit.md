# Kybernesis Brain Data Model Audit

> **⚠️ SUPERSEDED 2026-05-19 by ADR 007.** The yellow-light verdict below was reversed after the Brain-vs-Convex structural analysis (`docs/audits/brain-structure-vs-convex.md`) showed that 3 of the 5 "misfits" are Convex artifacts, not domain disagreements. KyberBot — same domain, different DB — independently converged on Arcana's shape. Read **`docs/decisions/007-shape-thesis-portable-rules-not-records.md`** and **`docs/strategy/shape-thesis.md`** for the current position.
>
> The content below is preserved for historical context. Do not act on its verdict.
>
> ---
>
> **Status**: ✅ **COMPLETE 2026-05-18.** Audit executed; full output at `docs/audits/kybernesis-brain-data-model-audit.md`.
> **Verdict**: 🟡 ~~**YELLOW-LIGHT.**~~ **REVERSED — see ADR 007.** Arcana ~~cannot serve as Brain's source of truth without contract-level changes (edges, entities, profiles). Naive deprecation would have broken on the edge model.~~ Arcana's shape was right; Brain's three structural misfits are Convex artifacts and stay as adapter concerns. Two genuine domain additions (Memory.status, memory-level supersession) and one shape refinement (ProfileEntry) land in Arcana.
> **Brain repo audited**: `/Users/davidcruwys/dev/kybernesis/kybernesis-brain`
> **Decision authority**: David (solo for now; no Ian share required yet)

## Problem Statement

**HMW** validate that Arcana's data model fits BOTH KyberBot and Kybernesis Brain — before committing to KyberBot table deprecation work that would lock in a shape potentially wrong for Brain?

## Recommended Direction

Audit Brain's actual data model (Convex schema + mutation/query patterns) against Arcana's contracts. Apply ADR 005's audit-consumer-code-before-deciding rule at the architectural level. Same shape as the KyberBot module audits, scaled up.

Outputs: documented misfits (Brain field with no Arcana equivalent / Arcana field Brain doesn't produce / structural shape difference), confidence level per mapping (high/medium/low), and a clear go/no-go signal for the broader KyberBot deprecation work.

This is a **precursor** for deprecation planning, not a substitute. Once Brain's shape is in hand, the deprecation idea-refine can run with both consumers visible.

## Key Assumptions to Validate

- [ ] Brain has enough implemented Convex schema + code to audit meaningfully — test by reading the Brain repo's `convex/schema.ts` (or equivalent) before committing the audit session
- [ ] The audit surfaces decidable misfits, not just ambiguous "could go either way" — test by running the gap-analysis through the first table; if we can't make calls without Ian, we'd need him in the loop
- [ ] Ian's adoption timeline allows for this audit before he starts — confirm with Ian or accept that Arcana may flex post-Ian-adoption
- [ ] Brain's current schema reflects intended shape (not provisional) — confirm during audit by checking for TODOs / migration intent comments

## MVP Scope

**In:**
- Read Brain's Convex schema definitions
- Read Brain's main write paths (memory creation, fact extraction, entity tracking)
- Read Brain's main read paths (what queries Brain runs against its own data)
- Column-by-column gap analysis against Arcana's `MemorySchema` / `FactSchema` / `EntitySchema` / `EdgeSchema` / `ContradictionSchema` / `EntityProfileSchema`
- Misfit catalog with confidence labels: high (clean match), medium (translatable), low (genuine misfit needing decision)
- Output doc at `docs/audits/kybernesis-brain-data-model-audit.md` in the Arcana repo

**Out:**
- No code changes to Arcana
- No deprecation planning (that's the next idea-refine after audit results)
- No Brain code changes
- No Ian-blocking — open questions become async items for Ian, not session blockers
- Brain's sleep pipeline / LLM usage / retrieval logic — data model only this round

## Not Doing (and Why)

- **Brain's processing-side audit (sleep pipeline, LLM, scheduler)** — interesting but scope creep. Data model first; processing audit comes later, when Brain demands `LLMProvider` / `Scheduler` / `JobQueue` etc.
- **Speculative Arcana schema flex during the audit** — wait for the full picture before designing changes. Drafting flex while reading is exactly the "expand before knowing" anti-pattern ADR 003 fell into.
- **Direct Brain ↔ KyberBot comparison** — Brain ↔ Arcana is the comparison that matters; KyberBot ↔ Arcana is already documented. Triangulating through Arcana keeps the contract central.
- **Pulling Ian into this session** — the audit is read-only on his code. Open questions become items he can answer async; that's how the comms protocol works.
- **Bundling with `LibsqlStructuredStore` build** — independent work, but conflating them muddies the audit goal. Could run in parallel as a separate session.

## Open Questions

- ✅ **Brain repo location**: `/Users/davidcruwys/dev/kybernesis/kybernesis-brain` (resolved 2026-05-18)
- ✅ **Decision authority post-audit**: David alone for now (resolved 2026-05-18)
- ✅ **Share with Ian**: Not yet (resolved 2026-05-18)
- ✅ **Audit executed**: 2026-05-18, output at `docs/audits/kybernesis-brain-data-model-audit.md`
- 🔓 **Ian's adoption timeline** — still unresolved; deferred since audit verdict makes near-term deprecation moot regardless
- 🔓 **Audit scope: planned or implemented?** — audit covered implemented code only; planned-but-unimplemented Brain shape not surveyed

## Audit findings — top 5 misfits

1. **Edge shape (structural, high)** — Brain uses the four-flat-ID pattern Arcana's `NodeRef` was explicitly designed to avoid
2. **`memoryEntities` dual-purpose (structural, high)** — Brain creates shadow entity rows for every memory; Arcana's Entity is strictly real-world
3. **`entityProfiles` structured arrays vs flat strings** (structural, medium) — lossy in both directions; provenance lost
4. **`Memory.status` + memory-level supersession missing from Arcana** (load-bearing) — Brain's soft-delete + supersession patterns have no Arcana home
5. **Enum collisions with zero overlap** — `Fact.sourceType` and `Memory.source` need translation tables at every boundary

## Strategic context (added 2026-05-18 post-audit)

David may take over **all** Kybernesis brain projects, not just KyberBot's memory. If that happens:
- The four Ian-blocking decisions from the audit become unilateral
- Two migration-system shapes were surfaced as design candidates:
  - **Central**: Arcana converts on consumer connect (single migration runner inside Arcana)
  - **Distributed**: each consumer owns its own migration (current KyberBot pattern)
- Both shapes still require both systems to migrate; the difference is where the migration code lives

This context doesn't change the audit verdict but affects what happens AFTER the audit. The deprecation idea-refine is parked indefinitely; resuming it requires either Ian's input on the four decisions OR the brain-takeover scenario landing.

## Next steps (post-audit)

- ⏸️ **KyberBot table deprecation idea-refine** — was the planned follow-on. **Park indefinitely** — wrong premise given audit findings. KyberBot's 15-module dual-write is now confirmed as the architecture (not transitional) until/unless contract reconciliation happens.
- ⏸️ **Bring Ian in** — held by David's call (not yet) and possibly moot if brain-takeover happens
- ⏸️ **Contract-level changes to Arcana** — possible directions surfaced (grow `NodeRef`, grow `EntityProfile`, unify enums) but premature to design until decision-authority is settled

## Related

- `~/dev/kybernesis/arcana/CHANGELOG.md` — Arcana contract evolution trail (ADRs 001-006)
- `~/dev/kybernesis/arcana/docs/decisions/005-memory-is-not-append-only.md` — codifies the audit-consumer-code rule this idea applies at the architectural level
- `~/dev/kybernesis/arcana/docs/ideas/pipeline-eval-suite.md` — sibling parked idea using the same refinement pattern
- KyberBot adoption transcript (cross-session comms at `~/dev/kybernesis/.comms/arcana-kyberbot.md`) — the 15-module migration that prompted this audit question
