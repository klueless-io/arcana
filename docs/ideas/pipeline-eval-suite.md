# Arcana Pipeline Eval Suite

> **Status**: Idea — refined via `/agent-skills:idea-refine` on 2026-05-18. Awaiting decision on the open questions before scaffold work begins.

## Problem Statement

**HMW** validate that Arcana's brain+memory pipeline produces the artifacts we expect from a known input — surfacing both what works today and what's still stubbed — so we catch parity gaps and architectural drift early, while the pipeline is still being implemented?

## Recommended Direction

**Direction Z: golden eval suite with negative-trace markup.**

A small, growing set of human-comprehensible documents (fox sentence + a realistic conversation + a paragraph of structured prose) each paired with a hand-specified *expected output graph*. Tests run the pipeline against each document and compare the actual produced graph to the expected one — with the critical refinement that **every expected artifact is marked as either currently produced (by an implemented step) or aspirational (will be produced when stub X lands).** The diff view doesn't just report pass/fail; it reports *out of N expected artifacts, K are produced today, K-N are blocked on these specific stubs.*

This makes every test run a defensive audit: "we still produce everything we used to" + "here's the visible roadmap of what's left to build." The Mocha-rendered view doubles as a public artifact — anyone reading the repo (Ian, Martin, a future Claude session) sees what Arcana does end-to-end, today, and what it will do tomorrow.

Building blocks already exist: `.mochaccino/` data format is established, Mocha renders HTML views, Vitest is wired. The scaffolding cost is ~3-4 hours; ongoing cost is ~30 minutes per added trace.

## Key Assumptions to Validate

- [ ] **Expected outputs can be hand-specified in reasonable time** — test by drafting the fox example and one realistic conversation; if either takes >30 min, scope back to even smaller documents.
- [ ] **Graph-shape parity (memories/entities/facts/edges with right relationships) is sufficient defensive bar** — confirm explicitly that we're NOT measuring LLM extraction quality (precision/recall) at this layer; that's a separate, later eval concern.
- [ ] **The "currently real vs aspirational" distinction empties gracefully as Arcana matures** — revisit at v0.5 milestone; by v1.0 the aspirational column should be near-empty (which is the goal state, not a flaw).
- [ ] **Diff readability survives complexity** — when a document produces 12 expected artifacts and 4 are missing because step #7 is stubbed, the rendered diff stays scannable, not a wall of red.

## MVP Scope

**In**:
- 2-3 starter trace data files in `.mochaccino/data/07-pipeline-traces/` (one per document, lowercase-kebab filenames)
- Each trace specifies: input document, expected pipeline stages with `status: implemented|stubbed`, expected graph delta per stage, expected final state (counts + key relationships)
- A Vitest harness (`packages/arcana-core/src/__evals__/pipeline-trace.test.ts` or similar) that reads each trace, executes implemented steps for real, simulates stubbed steps from the trace's `simulated_output`, asserts the final graph state matches
- A Mocha renderer that produces an HTML view per trace showing: input, stage-by-stage execution, actual vs expected diff, implemented/stubbed legend
- Two example traces written upfront: `fox-jumps-over-dog` (illustrative, trivial) + one real conversation (your call on the content)

**Out**:
- Quality scoring (precision, recall, F1 on extraction)
- Latency benchmarks
- Cross-repo integration tests against KyberBot's brain code
- LLM-driven expected-output generation (we hand-spec on purpose)

## Not Doing (and Why)

- **Direction Y — live comparison against KyberBot baseline** — operationally heavy (LLM cost per run, version drift, slow CI). Reserve for when both pipelines are real and the diff is worth measuring. Today's parity check is structural via Z; behavioral parity is for v1.0+.
- **Quality eval framework (precision/recall on extraction)** — different concern, different tool, different domain. Z measures "did the pipeline produce the expected shape;" quality evals measure "did extraction produce the *right* content." Mixing them muddies both.
- **Auto-generation of expected outputs from test runs** — fights the goal. The point of Z is *the human predicts what should happen, then the test verifies*. Auto-gen would make the test self-consistent but lose the prediction-validation dimension that drives the defensive value.
- **A trace DSL or custom format beyond JSON** — Mochaccino data files are already JSON; staying in that idiom keeps Mocha integration trivial and the format learnable in 5 minutes.

## Open Questions

1. **Trace file layout**: one big `07-pipeline-traces.json` array, or one file per trace in `07-pipeline-traces/<slug>.json`? *(Lean: per file — discoverable in `ls`, easier to add to, Mocha can iterate the directory.)*
2. **Where does the Vitest harness live**: `packages/arcana-core/src/__evals__/` (co-located with code) or top-level `evals/` directory (signals "this is special")? *(Lean: co-located — keeps tests close to the code under test.)*
3. **What are the 2-3 starter documents?** Fox sentence is locked. Need one real conversation (yours to pick — a Slack snippet, a Telegram log, a short blog draft?) and possibly a paragraph of prose with clear entity-relation structure (e.g., a Wikipedia-style "X is the CEO of Y, founded in Z" passage).
4. **Stubbed-stage representation in the trace JSON** — flag per stage (`status: 'stubbed'`) plus a `simulated_output` field the test uses? Or a separate `expected_when_implemented` array? *(Lean: flag + simulated_output — keeps each stage's record self-contained.)*

---

## Process notes (from the idea-refine session)

- Original sketch (proposal γ in the dialogue) was Mochaccino data + Vitest test sharing a single source. Direction Z extends that with the negative-trace markup — every expected artifact is explicitly *implemented today* or *aspirational*, making each test run a defensive audit.
- David's three constraints anchored the refinement: triple-audience (public artifact polish bar), coupled (one source drives view + test), defensive-weighted (catch architectural drift before it lands).
- Direction Y (cross-repo comparison against KyberBot baseline) is explicitly deferred — too operationally heavy until both pipelines are real.

## Related

- `~/dev/kybernesis/arcana/SPEC.md` — Arcana build contract
- `~/dev/kybernesis/arcana/docs/adoption/kyberbot.md` — adoption playbook (eval-suite will reference this for live-method baselines)
- `~/dev/ad/brains/kybernesis/arcana-spec.md` §6 — the 13-step sleep pipeline whose stages this suite traces
- Mocha + Peter + Shelly skills — the rendering side of the build-as-documented discipline this suite extends
