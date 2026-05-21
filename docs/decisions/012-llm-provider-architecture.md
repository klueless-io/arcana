# ADR 012: LLM Provider Architecture — Subprocess + Multi-Backend HTTP

**Date:** 2026-05-21
**Status:** Accepted
**Deciders:** David Cruwys
**Related:**
- [ADR 011](./011-port-first-improve-later.md) — port-first principle (this ADR is a clean application)
- [ADR 009](./009-parity-gate-for-consumer-swaps.md) — parity-gate methodology
- `kyberbot/packages/cli/src/claude.ts` — empirical LLM client in KyberBot
- `kyberbot/packages/cli/src/brain/hybrid-search.ts:166–230` — `haikusRerank` (reranker as an LLM call)

---

## Context

Arcana's `LLMProvider` interface (declared in `arcana-contracts`) has no concrete implementation yet. The sleep pipeline (when it ships) will need one; the reranker pattern in `hybridSearch` already calls for one. Two adjacent design questions had been left open across earlier sessions:

1. **What does an LLM provider package look like in practice?** Earlier framings drifted between "API-key-based provider" (OpenRouter / Ollama / direct Anthropic SDK), "Claude Code subscription wrapper", and "separate `RerankerProvider` interface for the reranker." None of these stuck because none were verified against actual consumer behaviour.
2. **Do we need a separate `RerankerProvider` interface?** ADR 009 records the parity-gate methodology, but the reranker itself is just an LLM call with a specific prompt shape — not a structurally different concern.

KyberBot has shipped working LLM-client code (`claude.ts`). The reranker call lives in `hybrid-search.ts:194-200` and uses `subprocess: true`. **In production, KyberBot's reranker does not use an API key** — it spawns the Claude Code CLI as a subprocess, and that binary handles whatever auth the local install has (subscription, typically). The `ANTHROPIC_API_KEY` path exists as a fallback (SDK mode) but is not the primary.

ADR 011 governs the decision: port KyberBot's working pattern first; speculative redesigns go to v2 or to greenfield packages with a clear successor path.

---

## Decision

### Two LLM provider packages, split by transport (not by vendor)

The clean axis is **how you talk to the LLM**, not **which company owns it**. Vendors (Anthropic, Gemini, OpenAI, Ollama, OpenRouter) are variations within a transport, not separate categories.

#### Package 1 — `arcana-provider-llm-claude-code` (port-first v1)

**Transport:** subprocess. Spawns the Claude Code CLI (`claude -p` today; whatever replaces it after deprecation) and pipes prompt to stdin / reads stdout.

**Auth:** whatever the local `claude` binary uses — typically a Claude Code subscription. No `ANTHROPIC_API_KEY` required.

**Why:** literal port of KyberBot's `claude.ts → completeSubprocess` path. Lifts the empirical implementation, preserves the memory-isolation discipline (`claude.ts:91–96` documents why subprocess is preferred over in-process Agent SDK for long-lived processes).

**Configuration surface:** model (`'haiku' | 'sonnet' | 'opus'`), maxTokens, system prompt, optional cwd for fleet scenarios (matches KyberBot's options shape).

**Sunset note:** `claude -p` is scheduled for deprecation (mid-2026). When the replacement invocation pattern lands, this provider's *internals* update; the `LLMProvider` interface stays stable; consumers do not change.

#### Package 2 — `arcana-provider-llm-http` (multi-backend, greenfield with retroactive port discipline)

**Transport:** HTTP. POSTs to a backend-specific endpoint with a backend-specific JSON body, parses the response.

**Backends supported (config-driven, single package):**

| Backend | Endpoint default | Auth | Model format |
|---|---|---|---|
| anthropic | `https://api.anthropic.com/v1/messages` | `x-api-key` header | `claude-haiku-4-5`, etc. |
| openai | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer` | `gpt-4`, etc. |
| gemini | `https://generativelanguage.googleapis.com/v1beta/...` | API key query param | `gemini-pro`, etc. |
| ollama | configurable (typically `http://localhost:11434/api/chat`) | none | `llama3.2:3b`, etc. |
| openrouter | `https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` (OpenRouter key) | `anthropic/claude-haiku-4-5`, etc. |

**Why one package, not five:** these are variations of the same transport. Adding a new backend = one adapter file inside the package (`anthropic-adapter.ts`, `openai-adapter.ts`, …), not a new published package. Consumers swap backends via config, not via dependency change. This pattern is well-trodden (LiteLLM, LangChain, others all use it).

**Configuration shape (sketch — final shape ports from the first consumer's working impl):**

```ts
interface HttpLLMConfig {
  backend: 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openrouter';
  endpoint?: string;   // override the backend's default URL
  apiKey?: string;     // required for cloud backends; omitted for Ollama
  model: string;       // backend-specific model identifier
}
```

**Why greenfield is acceptable here:** no current consumer code in the Kybernesis family uses an HTTP LLM provider (KyberBot is subprocess, Kyber in Cloud is Convex-based with no LLM yet, KyberAgent Desktop has no LLM usage we've seen). ADR 011's "port first" defaults to "follow the first working consumer impl" — when none exists, building greenfield is the only option. The discipline still applies retroactively: when a consumer ships HTTP LLM code, Arcana's `arcana-provider-llm-http` aligns to that working impl, not vice versa.

### No separate `RerankerProvider` interface

`RerankerProvider` currently exists in `arcana-contracts/src/providers.ts` as a TS interface, but it is **not retained as a separate provider package** in this architecture.

**Rationale:** a reranker is just an LLM call with a specific prompt shape. KyberBot's `haikusRerank` (`hybrid-search.ts:169-230`) confirms this — it's a single `client.complete(prompt, { model: 'haiku', ... })` call. There is no structural concern that warrants its own provider interface.

**Resolution:** when LLMProvider implementations land, the reranker becomes a **kernel utility** in `arcana-core` that takes any `LLMProvider`, formats the standard rerank prompt, calls `complete()`, parses the result. Consumers wire whichever `LLMProvider` they want.

The existing `RerankerProvider` TS interface in `arcana-contracts` is preserved as an *optional* contract surface for consumers that want to plug in a non-LLM reranker (e.g. Cohere Rerank, a local cross-encoder model) without going through the kernel utility. It is no longer an *expected* provider that every Arcana wiring needs to supply.

---

## What this means

### For consumers

- Subscription-based agents (KyberBot, KyberAgent Desktop if it adopts Claude Code): wire `arcana-provider-llm-claude-code`. No API key needed.
- Server-side / production deployments where subprocess spawning is too heavy: wire `arcana-provider-llm-http` with `backend: 'anthropic'` (or any other cloud backend). API key required.
- Local-dev / cost-controlled scenarios: wire `arcana-provider-llm-http` with `backend: 'ollama'`. No API key; needs a local Ollama server.
- Multi-vendor experimentation: wire `arcana-provider-llm-http` with `backend: 'openrouter'`. Single API key, any model.

### For the reranker

- Default path: kernel utility on top of `LLMProvider`. Standard rerank prompt. Works with any of the above.
- Specialised path (rare): consumer supplies a custom `RerankerProvider` impl (Cohere, local cross-encoder, etc.) via `createArcana({ reranker })`. Kernel utility steps aside if a `reranker` is supplied.

### For future packages

- New cloud LLM vendors → add an adapter to `arcana-provider-llm-http`. One file. No new package.
- New transport (e.g. gRPC, websocket-streaming) → new package, sibling to the existing two.
- `arcana-provider-reranker-*` packages: discouraged. If you have an LLM, use the kernel utility; if you have a non-LLM reranker, ship it as your own `RerankerProvider` impl in your consumer code rather than a separate Arcana package.

---

## What this does NOT decide

- **When** LLM provider implementations ship. Currently no sprint is queued for this; sleep pipeline implementation will demand it.
- **Which backend** Arcana's tests run against. The contract is provider-agnostic; tests use the testkit fake LLMProvider.
- **The exact API key environment variable names** — left to per-backend convention (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.). Documented in each adapter when written.
- **Streaming support.** The `LLMProvider.complete()` method is single-shot today. Streaming may be added as a separate method or interface later; subprocess and HTTP both support it, but the design is deferred.

---

## Consequences

**Positive**

- Two packages instead of five (or eight). Consumers have a clear choice: subprocess vs HTTP. Within HTTP, vendor is config.
- KyberBot's existing pattern ports cleanly; no architectural awkwardness around its CLI-subscription auth.
- New cloud vendors integrate via single-file adapters in the HTTP package — no per-vendor publish cycle.
- The reranker no longer needs its own provider package; one less interface to maintain.
- Aligns with ADR 011 — subprocess is a direct port; HTTP is greenfield with retroactive port-discipline applied as consumers adopt.

**Negative**

- The HTTP package couples all backends. A bug in one adapter ships with patches for others. Mitigation: backend adapters are isolated internally; tests cover each adapter independently.
- The Claude Code subprocess provider has a known sunset path (`-p` deprecation). Internals will need to migrate when that happens. Contract stays stable so consumers are insulated.
- Greenfield HTTP impl risks divergence from a future consumer's preferred shape. Mitigation: ship adapter scaffolding minimal; align to first consumer impl when it lands.

**Mitigations / future evolution**

- When sleep pipeline implementation begins, build `arcana-provider-llm-claude-code` first (KB-faithful) and verify the parity harness can swap KyberBot's reranker call to it without behavioural change.
- Build `arcana-provider-llm-http` with one backend initially (whichever a real consumer demands first — likely Anthropic for Kyber in Cloud production). Other backends added on demand.
- Reconsider this ADR if a non-LLM reranker (Cohere, local model) becomes a high-traffic consumer concern; the `RerankerProvider` contract is preserved precisely to allow that.

---

## Sequencing under existing roadmap

This ADR does not start LLM provider work today. The work begins when sleep pipeline implementation begins, because sleep needs an LLM for `extractFacts`, `tag`, `summarize`, `reason`, `buildEntityProfiles`. Until then this is recorded architecture, not in-flight code.

When sleep work starts, the order is:
1. Build `arcana-provider-llm-claude-code` (port from KB)
2. Wire the sleep steps that need LLM
3. Add `arcana-provider-llm-http` with the first backend a consumer needs (probably Anthropic, for KIC production)
4. Add more HTTP adapters on demand
