# Kybernesis Brain Data Model Audit

> Generated: 2026-05-18
> Brain repo: /Users/davidcruwys/dev/kybernesis/kybernesis-brain
> Arcana contracts: arcana-contracts/src/
> Primary source: `apps/convex/convex/schema.ts`, `mutations/memory.ts`, `queries/memory.ts`

## Executive summary

- **Overall fit**: **moderate**, leaning toward **structurally-different in two specific zones** (edges + entity table). The four core memory-shaped concepts (memory item, chunk, fact, contradiction, insight, entity profile) line up well at the **field** level; the major divergence is at the **shape** level for edges/entities.
- **Headline misfits**:
  1. **Edge shape mismatch (structural, high severity)** — Brain's `memoryEdges` are always entity→entity (`fromEntityId` / `toEntityId`) with denormalized `fromMemoryId` / `toMemoryId` strings as a fast-path. Arcana's `EdgeSchema` uses a clean discriminated-union `NodeRef` (`{type: 'memory'|'entity', id}`) — *the exact "four-flat-optional-fields trap" the contract was designed to avoid* (per the comment in `edge.ts`).
  2. **`memoryEntities` is dual-purpose (structural, high severity)** — Brain stores **shadow rows** in `memoryEntities` (one per memory item, `name = "memory:<id>"`, `type = "memory_item"`, `salience = 0.5`) so that all edges can be normalized to entity→entity. Arcana's `EntitySchema` is strictly real-world entities (`person|company|project|place|topic`). Brain's "entity" table is half graph-node-registry, half real-entity-catalog.
  3. **`entityProfiles.staticFacts` / `dynamicContext` shape mismatch (structural, medium)** — Brain stores them as **arrays of structured objects** (`{key, value, confidence, factId, updatedAt}` / `{key, value, lastUpdated, source}`). Arcana's `EntityProfileSchema` stores them as **arrays of strings** + a single `dynamicContext: string`. Lossy in both directions.
  4. **No `Memory.summary` / `Memory.accessCount` / `Memory.isPinned` / `Memory.lastAccessedAt` on Brain (missing producer, medium)** — Brain has `description`, no summary column; no access counter; no pin flag; no lastAccessedAt. Brain instead has tier+decayScore+priority+status doing similar work via a different mechanism.
  5. **`Memory.source` enum mismatch (semantic, medium)** — Brain's `source` is a free `v.string()` (real values: `'manual'`, `'connector'`, etc.) and additionally has `itemType: v.string()`. Arcana's `MemorySourceSchema` is a strict 6-value enum (`upload|chat|connector|watched-folder|cli|channel`). No `chat`, no `cli`, no `channel`, no `watched-folder` observed as producers in Brain.
- **Go/no-go signal**: **YELLOW.** Arcana's *contracts* can serve Brain at the field level for memory/fact/chunk/contradiction/insight, but Brain's *edge model* and *entity model* are structurally different enough that "Arcana as Brain's source of truth" is not a drop-in replacement. The deprecation roadmap should not proceed until Ian decides whether Arcana grows a Brain-compatible edge model (entity-shadow + denormalized memoryId fast-path) or Brain refactors away from it. The required Arcana flex points are real but bounded.

## Brain table inventory

Brain's Convex schema defines **34 tables**. Grouped by data-model significance:

**Memory-shaped (8 tables, in scope for this audit):**
- `memoryItems` — canonical memory record (the equivalent of `Memory`).
- `memoryChunks` — text chunks of a memory + vector pointer + layer.
- `memorySummaries` — multi-scope summaries (item / sub-chunk) per memory.
- `memoryEntities` — dual-purpose: real entities AND shadow-rows for memory items (see misfit #2).
- `memoryEdges` — entity→entity edges with denormalized memory IDs.
- `memoryFacts` — entity-attributed facts with supersession + temporal-ref.
- `memoryInsights` — reasoning-derived insights (deduction/induction/pattern).
- `entityProfiles` — compiled per-entity profile (static facts + dynamic context + narrative).
- `contradictions` — first-class contradiction tracking between two facts.
- `memoryPromotions` — log of tier promotions (audit table for moveToTier).

**Operational / orchestration (data-model-agnostic):**
- `connectors`, `connectorCredentials`, `connectorSyncs` — Pipedream/connector OAuth state and sync runs.
- `ingestionJobs`, `vectorCleanupJobs`, `sleepTasks`, `sleepRuns` — job queues + sleep-pipeline runs.
- `workflowExecutions` — generic workflow execution log.
- `auditLogs`, `telemetryEvents` — audit/observability.
- `tagPreferences` — per-org tag color preferences.

**Multi-tenant / auth / billing (legitimately Brain-only):**
- `userSettings`, `organizations`, `organizationMembers`, `organizationInvitations`.
- `mcpApiKeys`.
- `oauthClients`, `oauthCodes`, `oauthTokens` — OAuth 2.1 (MCP server authentication).

**Agent system (Letta-inspired, partial Arcana overlap):**
- `agents` — agents bound to workspaces, with **memoryBlocks** + **memoryBlockHistory** + technical config + permissions.
- `agentWorkspaces` — agent ↔ workspace junction.
- `agentConversations` — persistent chat threads (recall memory).
- `agentMessages` — individual chat messages.
- `agentUsage` — daily aggregated usage metrics per agent.

**Motus workflow automation (legitimately Brain-only):**
- `motusWorkflows`, `motusWorkflowWorkspaces`, `motusExecutions`, `motusConnections`.
- `pipedreamActions`, `pipedreamSupportedApps`.

## Side-by-side: Brain ↔ Arcana

### `memoryItems` vs `MemorySchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` (Convex Id) | `id: string` | high | Both string-ish; Convex Id stringifies cleanly. |
| `orgId: string` | `scopes.org_id` | medium | Brain treats `orgId` as a required top-level column; Arcana folds it into optional `scopes`. Translation is mechanical but **Arcana's `scopes` is optional** — Brain would need to enforce required at the wrapper layer. |
| `title: string` | `title: string` | high | Direct. |
| `description: optional<string>` | `summary: string` | **low/semantic** | Arcana requires `summary`; Brain has optional `description`. Different field name, similar role. Required-vs-optional matters. |
| *(no equivalent — content lives on chunk #0)* | `content: string` | **structural** | Arcana puts `content` on the Memory record; Brain puts it on `memoryChunks[chunkIndex=0]`. Translatable but write/read paths differ. |
| `tags: optional<string[]>` (+ `autoTags`, `manualTags`) | `tags: string[]` | medium | Brain tracks **three tag fields** (combined, auto, manual); Arcana has one. The auto/manual split is Brain-specific provenance — would be lost in a flat write to Arcana. |
| `priority: number` | `priority: number 0..1` | high | Same shape; same range used in code (`0.5` default). |
| `tier: optional<string>` | `tier: enum('hot','warm','archive')` | medium | Brain treats `tier` as `v.string()` and optional; values observed: `hot|warm|archive`. Arcana is a strict enum. Brain has a separate `layer` on chunk that should mirror tier. |
| `decayScore: number` | `decayScore: number 0..1` | high | Same. |
| `status: string` | — | **missing in Arcana** | Brain has a lifecycle (`ingested|deleted|…`). Arcana has no `status` field. Brain depends on `status='deleted'` for soft-delete filtering. |
| `source: string` | `source: enum(upload\|chat\|connector\|watched-folder\|cli\|channel)` | medium | Brain values are free strings (`manual`, `connector`, …). No producer in Brain emits `chat`, `cli`, `channel`, `watched-folder`. |
| `sourceRef: optional<string>` | — | **missing in Arcana** | Brain uses for connector dedup. No Arcana home. |
| `itemType: string` | — | **missing in Arcana** | Brain's secondary type (`manual` default). No Arcana equivalent. |
| `inferredEntities: optional<string[]>` | — | **missing in Arcana** | Per-memory cache of mentioned entity names. |
| `contentHash: optional<string>` | `contentHash: string` | high | Both present. Brain marks optional but always populates. |
| `ingestedAt: number` (epoch ms) | — | missing | Arcana has no creation timestamp on Memory. |
| `updatedAt: number` | — | missing | Same. |
| `isLatest`, `supersededBy` | — | missing | Brain supports memory-level supersession; Arcana only supports fact-level. |
| `totalEdgeCount`, `recentEdgeCount`, `lastEdgeComputedAt` | — | missing | Denormalized counters; purely an optimization layer. Not contract-significant. |
| `lastTaggedAt`, `lastRelationshipAuditAt`, `metadata`, `ingestMetadata` | — | missing | Operational/diagnostic. Not contract-significant. |
| `descriptiveTitle` | — | missing | Legacy/no-longer-populated per schema comment. Ignorable. |
| — | `accessCount: number` | **no producer in Brain** | Brain does not track read counts on memories. |
| — | `lastAccessedAt: datetime` | **no producer in Brain** | Same. |
| — | `isPinned: boolean` | **no producer in Brain** | Brain has no pin concept on memories. |

### `memoryChunks` vs `ChunkSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `memoryId: Id<memoryItems>` | `memoryId: string` | high | |
| `content: string` | `text: string` | medium/semantic | Different name, same role. |
| `vectorId: optional<string>` | `vectorId: optional<string>` | high | |
| `layer: string` | `layer: enum(hot,warm,archive)` | medium | Same as memory.tier mismatch. |
| `chunkIndex`, `summary`, `hotKey`, `embeddingVersion`, `metadata`, `createdAt`, `updatedAt`, `orgId` | — | missing | Brain carries operational fields per chunk. Notably `hotKey` is Brain's hot-tier address (`org:<id>:memory:<id>`). Not contract-significant. |

### `memoryFacts` vs `FactSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `fact` | `fact` | high | Both require sentence form. |
| `entity` | `entity` | high | |
| `attribute: optional<string>` | `attribute: optional<string>` | high | Matches ADR 004 explicitly. |
| `value: optional<string>` | `value: optional<string>` | high | Matches ADR 004 explicitly. |
| `confidence: number` | `confidence: number 0..1` | high | |
| `isLatest: boolean` | `isLatest: boolean` | high | |
| `supersededBy: optional<Id<memoryFacts>>` | `supersededBy: optional<string>` | high | |
| `surprisalScore: optional<number>` | `surprisalScore: optional<number 0..1>` | high | |
| `lastReinforcedAt: optional<number>` | `lastReinforcedAt: optional<datetime>` | medium | Epoch ms vs ISO datetime — encoding-level mismatch, mechanical to translate. |
| `source: string` | — | **missing in Arcana** | Brain has both `source` (free string) and `sourceType` (enum). Arcana only has `sourceType`. |
| `sourceType: optional<string>` | `sourceType: enum(terminal,chat,ai-extraction,upload,connector)` | medium | Brain values observed: `user_correction`, `user_input`, `agent_chat`, `connector_sync`, `extraction`. **None overlap with the Arcana enum** literally. Significant semantic mapping required. |
| `correctedFromId: optional<Id<memoryFacts>>` | — | **missing in Arcana** | Brain tracks the original fact that a correction replaces; Arcana relies on `supersededBy` going the other direction. |
| `temporalRef: optional<{date, absoluteDate, granularity, isExpired}>` | `expiresAt: optional<datetime>` | **structural** | Brain stores a richer temporal model (date+granularity+isExpired); Arcana stores a single `expiresAt`. Brain → Arcana loses granularity and the date narrative; Arcana → Brain leaves the structured fields empty. |
| `memoryId` (back-pointer to source memory) | — | missing | Arcana facts do not back-reference their originating memory. |
| `extractedAt`, `updatedAt`, `orgId` | `createdAt` | medium | Encoding mismatch; otherwise present. |

### `memoryEntities` vs `EntitySchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `name: string` | `name: string` | **structural** | Brain stores BOTH real names AND `memory:<id>` shadow keys. Arcana expects only real names. See misfit #2. |
| `type: string` | `type: enum(person,company,project,place,topic)` | **structural** | Brain values include `memory_item` (shadow) and other free strings. Arcana enum is closed. |
| `salience: number` | — | **missing in Arcana** | Brain ranks entities by salience (defaults `0.5`). |
| `embeddingVersion: string` | — | missing | Operational. |
| — | `mentionCount: number` | **no producer in Brain** | Brain does not track per-entity mention counts on this table. |

### `memoryEdges` vs `EdgeSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `fromEntityId: Id<memoryEntities>` + `toEntityId: Id<memoryEntities>` + `fromMemoryId: optional<string>` + `toMemoryId: optional<string>` | `from: NodeRef` + `to: NodeRef` | **structural — high severity** | Brain has **four flat optional/required ID columns** — exactly the pattern Arcana's `edge.ts` comment cites as the trap to avoid. Translation requires reading Brain's entity row and inferring `type=memory|entity` from `name` prefix or `type='memory_item'`. |
| `relation: string` | `relation: string` (permissive v0.1) | high | Brain values observed: `related`, plus whatever `linkMemories` callers pass. Acceptable under v0.1 permissive vocab. |
| `weight: number` | — | **missing in Arcana** | Brain has both `weight` and `confidence`; Arcana only `confidence`. |
| `confidence: optional<number>` | `confidence: number 0..1` | medium | Required-vs-optional flip. |
| `metadata` (contains `sharedTags`, `method`) | `sharedTags: string[]` + `method: string` | medium | Arcana **promotes** these to first-class columns; Brain stores them inside `metadata`. Read-path needs to unpack. |
| `source: optional<string>` | — | missing | Brain audits the producer (`eager_ingest`, etc.). Could map to `method`. |
| `createdByJobId: optional<string>` | — | missing | Brain operational. |
| `lastVerifiedAt: optional<number>` | `lastVerifiedAt: optional<datetime>` | medium | Encoding-only mismatch. |
| `contextChunkId: optional<Id<memoryChunks>>` | — | missing | Brain links an edge to the chunk that produced it. |
| `updatedAt: number` | `createdAt: datetime` | medium | Different temporal semantics — Brain tracks last touch, Arcana tracks creation. |
| — | `rationale: optional<string>` | no producer in Brain | Free-text rationale field absent. |

### `contradictions` vs `ContradictionSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `factAId`, `factBId` | `factAId`, `factBId` | high | |
| `resolution: string` (`auto_superseded|pending|user_resolved`) | `status: enum(pending,auto-resolved,user-resolved)` | medium | Naming/casing mismatch. **Brain mixes `resolution` (what happened) and `status` (current state) into one field** — Arcana ADR 006 separates them. |
| — | `resolution: optional<string>` (how resolved) | **no producer in Brain (as distinct field)** | Brain has no separate `resolution` text. |
| — | `rationale: optional<string>` | no producer in Brain | |
| `entity`, `attribute`, `valueA`, `valueB`, `confidenceGap` | — | **missing in Arcana** | Brain pre-computes and stores the contradiction context inline; Arcana would have to derive it via the two factIds. |
| `resolvedAt`, `resolvedBy`, `metadata`, `createdAt`, `updatedAt`, `orgId` | `createdAt` | medium | Encoding mismatch. |

### `memoryInsights` vs `InsightSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `insightType: string` (`deduction|induction|pattern`) | `type: enum(deduction,induction)` | medium | Brain adds `pattern`; Arcana does not. |
| `conclusion: string` | `statement: string` | medium/semantic | Different name, same role. |
| `premises: Id<memoryFacts>[]` | `supportingFactIds: string[]` | medium/semantic | |
| `confidence: number` | `confidence: number 0..1` | high | |
| `isActive: boolean` | — | **missing in Arcana** | Brain can deactivate insights; Arcana has no lifecycle field. |
| `createdAt`, `updatedAt`, `orgId` | `createdAt: datetime` | medium | Encoding mismatch. |
| — | `entityId: optional<string>` | **no producer in Brain** | Brain insights are not entity-bound; Arcana allows optional entity attribution. |

### `entityProfiles` vs `EntityProfileSchema`

| Brain field | Arcana field | Fit | Notes |
|---|---|---|---|
| `_id` | `id` | high | |
| `entityName: string` | `entityId: string` | medium/semantic | Brain keys by **name** within an org; Arcana keys by **entityId**. Real difference — Brain has no entity-id stability across renames. |
| `staticFacts: Array<{key, value, confidence, factId, updatedAt}>` | `staticFacts: string[]` | **structural** | Brain is structured; Arcana is flat strings. Brain → Arcana loses key/value/confidence/factId provenance. |
| `dynamicContext: Array<{key, value, lastUpdated, source}>` | `dynamicContext: string` | **structural** | Same — Brain structured, Arcana single string. |
| `relatedEntities: Array<{name, relation}>` | `relatedEntityIds: string[]` | medium | Brain stores `(name, relation)` pairs; Arcana stores just IDs. Loses relation labels. |
| `narrativeProfile: optional<string>` | `narrativeProse: optional<string>` | high | Name mismatch only. |
| `profileType: string`, `version: number`, `narrativeGeneratedAt`, `lastComputedAt`, `updatedAt`, `orgId` | — | missing | Operational. |

## Brain-only tables (no Arcana equivalent)

### Memory-shaped (Arcana could plausibly grow these)

- **`memorySummaries`** — multi-scope summaries (`scope`, `summary`, `model`, `tokens`) per memory or per chunk. **Data-model-significant.** Arcana currently puts `summary` directly on Memory; Brain models it as a separate table that can hold multiple summaries per item (different scopes / models). **Recommendation**: open question for Ian. If Arcana wants to support multi-scope summarisation it needs a `Summary` schema; otherwise Brain → Arcana writes just `memorySummaries[scope='item']` to `Memory.summary`.

- **`memoryPromotions`** — audit log of tier moves. **Operational-leaning, low contract significance.** Recommendation: Brain-only; not part of Arcana's data model.

### Operational (legitimately Brain-only)

- `connectors`, `connectorCredentials`, `connectorSyncs`, `ingestionJobs`, `vectorCleanupJobs`, `sleepTasks`, `sleepRuns`, `workflowExecutions`, `auditLogs`, `telemetryEvents`, `tagPreferences` — all orchestration / observability / job queues. **Operational.** Recommendation: stay Brain-only (these are the kinds of capabilities Arcana surfaces via the `Scheduler` / `JobQueue` provider interfaces, not via the kernel data model).

### Multi-tenant / auth / billing (legitimately Brain-only)

- `userSettings`, `organizations`, `organizationMembers`, `organizationInvitations`, `mcpApiKeys`, `oauthClients`, `oauthCodes`, `oauthTokens`. **Operational.** Recommendation: Brain-only — Arcana's `scopes.org_id` references these but does not own them.

### Agent system (partial overlap)

- `agents` — partially overlaps Arcana's `AgentSelfSchema`. Brain's `memoryBlocks` field is a structured `Array<{label, description, value, limit, isSystem}>` vs Arcana's `Array<{label, content, updatedAt}>`. Brain's `memoryBlockHistory` is `Array<{blockLabel, previousValue, newValue, changedAt, changedVia, tool}>` vs Arcana's `Array<{label, previousContent, changedAt, changedBy}>`. **Data-model-significant.** Recommendation: Arcana's `AgentSelfSchema` is too thin for Brain's agent table — Brain carries identity, model config, permissions, archival memory config, and stats that Arcana does not represent. Ian needs to decide whether `AgentSelfSchema` is meant to model "just the memory blocks" (in which case Brain extends with non-Arcana fields) or "the whole agent" (in which case Arcana needs growth).
- `agentWorkspaces`, `agentConversations`, `agentMessages`, `agentUsage` — **no Arcana equivalent.** Recommendation: Conversations and messages are *recall memory* — this is arguably a gap in Arcana if it intends to be the source of truth across the family. Worth flagging to Ian.

### Motus + Pipedream (legitimately Brain-only)

- `motusWorkflows`, `motusWorkflowWorkspaces`, `motusExecutions`, `motusConnections`, `pipedreamActions`, `pipedreamSupportedApps`. **Operational / product-specific.** Recommendation: stay Brain-only.

## Arcana-only fields (Brain produces no equivalent)

- **`Memory.summary`** — required in Arcana, absent in Brain's `memoryItems` (Brain uses `description` + separate `memorySummaries` table). **Gap in Brain.** Producer would need to land in `createMemory`.
- **`Memory.accessCount`**, **`Memory.lastAccessedAt`**, **`Memory.isPinned`** — KyberBot-style fields. No Brain producer. *Likely KyberBot-specific concepts that Brain genuinely doesn't model.* Recommendation: candidates for the "KyberBot-specific in Arcana" tag — Brain would always emit defaults (`0`, undefined, `false`).
- **`Entity.mentionCount`** — Brain has `salience` (a 0..1 score) but not a count. No Brain producer.
- **`Edge.rationale`** — no Brain producer; Brain stores comparable signal inside `metadata.method` / `metadata.sharedTags`.
- **`Contradiction.rationale`** — no Brain producer.
- **`Insight.entityId`** — no Brain producer.
- **`Fact.expiresAt`** — Brain stores expiry inside `temporalRef.isExpired` instead, no flat datetime.
- **`FactSourceType` enum values** (`terminal`, `chat`, `ai-extraction`, `upload`, `connector`) — Brain's producers emit `user_correction`, `user_input`, `agent_chat`, `connector_sync`, `extraction`. **Zero overlap by literal value.** Mapping table needed.

## Misfit catalog (ordered by severity)

### 1. Structural mismatches

1. **Edge node-reference shape** (high confidence) — Brain: four ID columns (`fromEntityId` / `toEntityId` required + `fromMemoryId` / `toMemoryId` denormalized strings). Arcana: `NodeRef` discriminated union. **Resolution direction**: either Arcana grows an "entity-shadow + denormalized fast-path" provider option, or Brain refactors to emit `NodeRef` shape from a Convex adapter. Brain's denormalization is for index-driven graph traversal (`by_from_memory`, `by_to_memory`) — performance-load-bearing, not cosmetic. *Needs Ian.*
2. **`memoryEntities` is half-graph-node-registry, half-real-entity-catalog** (high confidence) — `ensureMemoryEntity` (mutations/memory.ts:31) creates `{name: "memory:<id>", type: "memory_item"}` rows for every memory so edges can be entity→entity. Arcana's `EntitySchema` is closed-enum over real-world entity types. **Resolution direction**: same as #1 — they're the same architectural decision. *Needs Ian.*
3. **`entityProfiles.staticFacts` / `dynamicContext` are structured arrays, not strings** (high confidence) — see table above. **Resolution direction**: Arcana's current schema is too lossy for Brain's profile data. *Needs Ian.*
4. **`Fact.temporalRef` vs `Fact.expiresAt`** (high confidence) — Brain has a richer 4-field temporal model. **Resolution direction**: either Arcana adopts `temporalRef`, or Brain accepts that only `isExpired → expiresAt` survives the round-trip.
5. **`Contradiction` carries inline context in Brain (`entity`, `attribute`, `valueA`, `valueB`, `confidenceGap`)** (high confidence) — Arcana relies on joining via factAId/factBId. **Resolution direction**: probably keep Brain's denormalization as a Brain-only optimization; the Arcana shape is sufficient if join is cheap.

### 2. Semantic mismatches

1. **`Memory.source` enum** (high confidence) — Brain producer values don't match Arcana enum. Mapping table required. Low cost.
2. **`Fact.sourceType` enum** (high confidence) — zero literal overlap. Mapping table required. Low cost but every consumer needs it.
3. **`Insight.type` enum** (high confidence) — Brain has `pattern`, Arcana doesn't.
4. **`Memory.description` vs `Memory.summary`** (medium confidence) — same role, different name + required-vs-optional. Trivial mapping; flag the optional→required flip.
5. **`Chunk.content` vs `Chunk.text`** (high confidence) — same role, different name. Trivial.
6. **`entityProfiles.entityName` vs `EntityProfile.entityId`** (high confidence) — keying difference matters for rename-stability.

### 3. Missing producers (Arcana field, no Brain producer)

- `Memory.summary` (required) — Brain emits `description` only; the canonical summary lives on `memorySummaries`. **Producer needed if Brain adopts Arcana.**
- `Memory.accessCount`, `Memory.lastAccessedAt`, `Memory.isPinned` — likely fine to default; KyberBot-specific concepts. *Confirm with Ian.*
- `Entity.mentionCount` — Brain has salience but not count. *Confirm with Ian whether these are interchangeable or both needed.*
- `Edge.rationale`, `Contradiction.rationale`, `Insight.entityId` — all optional Arcana fields, no Brain producer. Defaultable.

### 4. Missing consumers (Brain field, no Arcana home)

- `Memory.status` (Brain uses for soft delete + lifecycle) — **load-bearing**. Read paths filter `status !== 'deleted'`. Without an Arcana equivalent, Brain cannot adopt Arcana's `Memory` directly without losing soft-delete capability.
- `Memory.isLatest` / `Memory.supersededBy` — Brain supports memory-level supersession, not just fact-level.
- `Memory.itemType` — used as a sub-type discriminator.
- `Memory.autoTags` / `Memory.manualTags` — tag provenance, lost in a flat write.
- `Memory.inferredEntities` — per-memory entity mention cache.
- `Fact.source` (free string) — separate from `sourceType`.
- `Fact.correctedFromId` — distinct from `supersededBy` (corrected-from points back, superseded-by points forward).
- `Fact.memoryId` (back-pointer) — Arcana facts don't back-reference origin memory.
- `Edge.weight` (distinct from `confidence`), `Edge.contextChunkId`, `Edge.createdByJobId`, `Edge.source`.
- `Entity.salience`, `Entity.embeddingVersion`.
- `Insight.isActive`.
- `entityProfiles.profileType`, `entityProfiles.version`.

## Confidence-low items requiring Ian's input

1. **Is Arcana meant to model the graph-shadow pattern, or push providers to translate?** Brain's edge+entity model is the same architectural decision (graph-node registry); Arcana cannot serve Brain without choosing a stance.
2. **`EntityProfile.staticFacts` / `dynamicContext` shape**: Arcana currently models them as strings — was that intentional v0.1 sparseness, or a final shape? Brain's structured shape is concrete and used in production.
3. **`AgentSelfSchema` scope**: Just "memory blocks" or "the whole agent"? Brain's `agents` table is far richer (model config, permissions, archival memory config). If Arcana intends agent identity to be the source of truth, the schema needs growth.
4. **Agent conversations + messages** (recall memory): Should Arcana model these? They're absent from contracts. Brain treats them as first-class.
5. **Multi-scope memory summaries** (`memorySummaries`): keep Brain-only, or grow an Arcana schema?
6. **`Memory.status` field**: Should Arcana grow a lifecycle field? Soft-delete is load-bearing for Brain reads.
7. **`Memory.isLatest` / `supersededBy`**: Should Arcana support memory-level supersession (it currently supports it for facts only)?
8. **`Fact.sourceType` enum unification**: Brain's values vs Arcana's values share zero overlap. Which side is canonical? Is the right answer a wider enum, or per-provider value sets?
9. **`Fact.temporalRef` vs `expiresAt`**: Adopt Brain's richer model, or accept the lossiness?
10. **`Entity.type` vocabulary**: Brain has `memory_item` (shadow) plus free strings; Arcana has 5 enums. Should Arcana widen, or should Brain map?

## Recommendation

**Overall verdict**: Arcana's current contracts can serve Brain at the **field level** for `memoryFacts`, `memoryChunks`, `memoryInsights`, and `contradictions` with minor flex. They **cannot** serve Brain at the **shape level** for edges, entities, and entity profiles without either Arcana growth or Brain refactor.

**If proceeding "yes, with flex"**, the minor flex points Arcana needs:

- `Memory.summary` → optional, or accept a `null`/empty-string default from Brain.
- `Memory.source` → wider/permissive enum, or per-app source vocabulary.
- `Memory.status` → add a lifecycle field (or accept Brain layers it externally and pays the cost).
- `Memory.autoTags` / `Memory.manualTags` / `Memory.itemType` → accept as `scopes` or first-class optional fields.
- `Fact.sourceType` → wider enum or mapping convention; **plus** keep an optional `source` free string.
- `Fact.expiresAt` → either widen to `temporalRef` or accept lossiness.
- `Entity.type` → widen vocabulary or formalize "shadow node" type.
- `EntityProfile.staticFacts` / `dynamicContext` → adopt Brain's structured shape (the string-only shape is too sparse for production data).
- `Insight.type` → add `pattern`.
- `Edge` — *no minor flex available*. Either Arcana adopts entity-shadow + denormalized memoryId fast-path (becomes a shape choice the kernel exposes), or Brain refactors edges to a `NodeRef`-shaped column.

**Nature of the misfit (if "no")**: **shape disagreement** at the edge/entity layer, plus **scope disagreement** at the entity-profile and agent layer. Field-level disagreements are minor and resolvable; the structural disagreements are not minor.

**Implication for the KyberBot deprecation roadmap**: **YELLOW-LIGHT.** Do not deprecate KyberBot's dual-write wrappers until:

1. Ian decides Arcana's stance on edges (entity-shadow vs `NodeRef`).
2. Ian decides whether `EntityProfile` grows to Brain's structured shape.
3. The `Fact.sourceType` and `Memory.source` enum unification is locked.
4. A decision lands on whether recall memory (agent conversations/messages) is in or out of Arcana's scope.

These are real architectural decisions, not cosmetic. The ADR 005 rule applied at the architectural level: **the audit caught a structural mismatch (the four-flat-ID edge anti-pattern is still alive in Brain's production code, even though Arcana's `edge.ts` was explicitly written to avoid it)** — which would have broken a naive "Arcana as source of truth" rollout. Deprecation should remain blocked until the edge/entity stance is decided.
