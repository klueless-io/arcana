import type {
  Memory,
  EntityProfile,
  Scopes,
  Tier,
  StructuredStore,
  VectorStore,
  EmbeddingProvider,
  RerankerProvider,
  Logger,
  QueryResult,
} from '@kybernesis/arcana-contracts';
export interface HybridSearchInput {
  query: string;
  scopes?: Scopes;
  tier?: Tier;
  topK?: number;
  /**
   * @deprecated Since v0.4.0 (ADR 011 — port-first principle). Accepted for
   * shape stability but silently ignored at runtime; the graph-BFS retrieval
   * channel will return as v2 hybridSearch after parity is proven.
   */
  graphHops?: number;
  rerank?: boolean;
}

/**
 * Result shape — KyberBot-faithful (v0.4.0 rebase per ADR 011). Three channels
 * collapse onto two exposed score fields: `semanticScore` carries the semantic
 * channel's RRF contribution; `keywordScore` collapses the keyword (FTS),
 * temporal, and entity-name-filter channels' contributions. `matchType` is
 * `'semantic' | 'keyword' | 'both'` mirroring KyberBot's vocabulary.
 *
 * `graphScore` is retained as a deprecated zero-emitting field for shape
 * stability — graph-BFS retrieval returns in a future v2 hybridSearch.
 */
export interface HybridSearchResult {
  memory: Memory;
  /** Fused RRF score across all channels this memory appears in. */
  score: number;
  /** Semantic channel RRF contribution. 0 when absent from this channel. */
  semanticScore: number;
  /** Collapsed RRF contribution from keyword + temporal + entity channels. 0 when absent. */
  keywordScore: number;
  /** @deprecated Since v0.4.0. Always 0; graph-BFS retrieval returns in v2. */
  graphScore: number;
  matchType: 'semantic' | 'keyword' | 'both';
  why?: string;
}

/** RRF smoothing constant (de-facto standard; matches KyberBot hybrid-search.ts:70). */
const RRF_K = 60;

/** Reciprocal Rank Fusion contribution for an item at zero-based rank. */
function rrfContribution(rank: number): number {
  return 1 / (RRF_K + rank + 1);
}

export interface FactRetrievalInput {
  query: string;
  depth?: number;
  scopes?: Scopes;
  tokenBudget?: number;
}

export interface RetrieveDeps {
  structured: StructuredStore;
  vector: VectorStore;
  embed: EmbeddingProvider;
  reranker?: RerankerProvider;
  logger: Logger;
}

export interface RetrieveApi {
  /** Hybrid retrieval: semantic + keyword + graph-expansion, fused via RRF. */
  hybridSearch(input: HybridSearchInput): Promise<QueryResult<HybridSearchResult[]>>;
  /** Multi-stage fact-aware retrieval: FTS → entity → graph → bridge. */
  factRetrieval(input: FactRetrievalInput): Promise<QueryResult<HybridSearchResult[]>>;
  /** Compiled dossier for an entity. */
  getEntityProfile(entityId: string): Promise<QueryResult<EntityProfile | null>>;
}

function makeEnvelope<T>(data: T): QueryResult<T> {
  return {
    data,
    generated_at: new Date().toISOString(),
    data_age_ms: 0,
    stale: false,
  };
}

export function createRetrieve(deps: RetrieveDeps): RetrieveApi {
  return {
    async hybridSearch(
      input: HybridSearchInput,
    ): Promise<QueryResult<HybridSearchResult[]>> {
      const topK = input.topK ?? 10;
      // `graphHops` is deprecated since v0.4.0 (ADR 011). Accepted for shape
      // stability; intentionally not destructured. Graph-BFS retrieval returns
      // in v2 hybridSearch.
      const channelTopK = topK * 3;

      let keywordIds: string[] = [];
      let semanticIds: string[] = [];
      let temporalIds: string[] = [];
      let entityIds: string[] = [];

      // ── Keyword channel (FTS via StructuredStore.searchFulltext) ─────
      let keywordMemories: Memory[] = [];
      try {
        const matches = await deps.structured.searchFulltext(input.query, {
          scopes: input.scopes,
          tier: input.tier,
          topK: channelTopK,
        });
        keywordIds = matches.map((m) => m.memoryId);
        // Fetch memories once; reused by the temporal channel.
        const fetched = await Promise.all(
          keywordIds.map((id) => deps.structured.getMemory(id)),
        );
        keywordMemories = fetched.filter((m): m is Memory => m !== null);
      } catch (err) {
        deps.logger.debug('arcana.retrieve.hybridSearch.keyword-channel-failed', {
          error: (err as Error).message,
        });
      }

      // ── Semantic channel (vector via EmbeddingProvider + VectorStore) ─
      try {
        const embedding = await deps.embed.embed(input.query);
        const vectorMatches = await deps.vector.query(embedding, {
          topK: channelTopK,
        });
        const ids: string[] = [];
        for (const m of vectorMatches) {
          const memId =
            (m.metadata?.memoryId as string | undefined) ??
            (m.metadata?.memory_id as string | undefined);
          if (memId && !ids.includes(memId)) ids.push(memId);
        }
        semanticIds = ids;
      } catch (err) {
        deps.logger.debug('arcana.retrieve.hybridSearch.semantic-channel-failed', {
          error: (err as Error).message,
        });
      }

      // ── Temporal channel (same memories as keyword, ordered by createdAt DESC) ─
      // KyberBot-faithful: temporal results are FTS keyword matches re-sorted
      // by recency. Same memory ids, different RRF rank positions, contributing
      // a second RRF vote to recent matches.
      try {
        temporalIds = [...keywordMemories]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((m) => m.id)
          .slice(0, channelTopK);
      } catch (err) {
        deps.logger.debug('arcana.retrieve.hybridSearch.temporal-channel-failed', {
          error: (err as Error).message,
        });
      }

      // ── Entity-name-filter channel ───────────────────────────────────
      // Tokenize the query; for each token, find entities whose name contains
      // it; collect memory ids linked to those entities via the edges graph.
      try {
        const tokens = input.query
          .toLowerCase()
          .split(/\s+/)
          .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
          .filter((t) => t.length >= 3);

        const seen = new Set<string>();
        for (const token of tokens) {
          const entities = await deps.structured.listEntities({
            nameContains: token,
            scopes: input.scopes,
            limit: 20,
          });
          for (const e of entities) {
            const neighbors = await deps.structured.getNeighbors({
              type: 'entity',
              id: e.id,
            });
            for (const n of neighbors) {
              if (n.type !== 'memory') continue;
              if (seen.has(n.id)) continue;
              seen.add(n.id);
              entityIds.push(n.id);
            }
          }
        }
        entityIds = entityIds.slice(0, channelTopK);
      } catch (err) {
        deps.logger.debug('arcana.retrieve.hybridSearch.entity-channel-failed', {
          error: (err as Error).message,
        });
      }

      // ── RRF fusion (4 channels, but exposed as 2 score fields per KB) ──
      // KyberBot collapses keyword + temporal + entity contributions into a
      // single `keywordScore` field (KB hybrid-search.ts:471–472). Semantic
      // stays separate. `score` is the sum of all channel contributions.
      type Fused = {
        memoryId: string;
        score: number;
        semanticScore: number;
        keywordScore: number;
      };
      const fused = new Map<string, Fused>();

      const addChannel = (
        ids: string[],
        bucket: 'semantic' | 'keyword',
      ): void => {
        ids.forEach((id, rank) => {
          const contribution = rrfContribution(rank);
          const existing = fused.get(id) ?? {
            memoryId: id,
            score: 0,
            semanticScore: 0,
            keywordScore: 0,
          };
          existing.score += contribution;
          if (bucket === 'semantic') {
            // semantic channel exclusive
            existing.semanticScore = Math.max(existing.semanticScore, contribution);
          } else {
            // keyword bucket: keyword + temporal + entity all funnel here
            existing.keywordScore = Math.max(existing.keywordScore, contribution);
          }
          fused.set(id, existing);
        });
      };
      addChannel(keywordIds, 'keyword');
      addChannel(semanticIds, 'semantic');
      addChannel(temporalIds, 'keyword');
      addChannel(entityIds, 'keyword');

      const ranked = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, topK);

      // ── Enrich to Memory + assign matchType ──────────────────────────
      const enriched: HybridSearchResult[] = [];
      for (const f of ranked) {
        const memory = await deps.structured.getMemory(f.memoryId);
        if (!memory) continue;
        const inSemantic = f.semanticScore > 0;
        const inKeywordBucket = f.keywordScore > 0;
        const matchType: HybridSearchResult['matchType'] =
          inSemantic && inKeywordBucket
            ? 'both'
            : inSemantic
              ? 'semantic'
              : 'keyword';
        enriched.push({
          memory,
          score: f.score,
          semanticScore: f.semanticScore,
          keywordScore: f.keywordScore,
          graphScore: 0,
          matchType,
        });
      }

      // ── Optional reranker ────────────────────────────────────────────
      if (input.rerank && deps.reranker) {
        try {
          const reranked = await deps.reranker.rerank(
            input.query,
            enriched.map((r) => ({ ...r, text: r.memory.content })),
            { topK },
          );
          deps.logger.debug('arcana.retrieve.hybridSearch.reranked', { count: reranked.length });
          return makeEnvelope(reranked.map(({ text: _ignored, ...rest }) => rest));
        } catch (err) {
          deps.logger.debug('arcana.retrieve.hybridSearch.rerank-failed', {
            error: (err as Error).message,
          });
        }
      }

      return makeEnvelope(enriched);
    },

    async getEntityProfile(entityId: string): Promise<QueryResult<EntityProfile | null>> {
      // 1. Check for a stored profile first
      const stored = await deps.structured.getEntityProfile(entityId);
      if (stored !== null) {
        return makeEnvelope(stored);
      }

      // 2. Assemble from live data
      const now = new Date().toISOString();

      // a. Get facts — filter to isLatest and not expired
      const allFacts = await deps.structured.getFactsForEntity(entityId);
      const liveFacts = allFacts.filter(
        (f) => f.isLatest === true && (!f.expiresAt || f.expiresAt > now),
      );

      // b. Get insights
      const insights = await deps.structured.listInsights(entityId);

      // c. Get neighbor entity IDs
      const neighbors = await deps.structured.getNeighbors({ type: 'entity', id: entityId });
      const relatedEntityIds = neighbors
        .filter((n) => n.type === 'entity')
        .map((n) => n.id);

      // If no facts and no entity data, return null
      if (liveFacts.length === 0 && insights.length === 0 && relatedEntityIds.length === 0) {
        return makeEnvelope(null);
      }

      // d. Build staticFacts from live facts
      const staticFacts = liveFacts.map((f) => ({
        value: f.fact,
        factId: f.id,
        confidence: f.confidence,
      }));

      // e. Build dynamicContext from insights
      const dynamicContext =
        insights.length > 0
          ? insights
              .slice(0, 3)
              .map((i) => i.statement)
              .join('; ')
          : '';

      // f. Mint an EntityProfile
      const profile: EntityProfile = {
        id: 'prof_' + entityId,
        entityId,
        staticFacts,
        dynamicContext,
        relatedEntityIds,
      };

      // g. Store it
      await deps.structured.storeEntityProfile(profile);

      // h. Return wrapped
      return makeEnvelope(profile);
    },

    async factRetrieval(
      input: FactRetrievalInput,
    ): Promise<QueryResult<HybridSearchResult[]>> {
      // 1. Parse query words (length > 2)
      const words = input.query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);

      // 2. Get all memories, filter to active + isLatest
      const allMemories = await deps.structured.listMemories();
      const activeMemories = allMemories.filter(
        (m) => m.status === 'active' && m.isLatest === true,
      );

      // 3. Score each memory
      type ScoredMemory = { memory: Memory; score: number; viaGraph: boolean };
      const scored: ScoredMemory[] = [];

      for (const memory of activeMemories) {
        if (words.length === 0) {
          scored.push({ memory, score: 0, viaGraph: false });
          continue;
        }
        const haystack =
          (memory.title ?? '').toLowerCase() +
          ' ' +
          (memory.summary ?? '').toLowerCase() +
          ' ' +
          (memory.content ?? '').toLowerCase();
        const matchCount = words.filter((w) => haystack.includes(w)).length;
        const score = matchCount / words.length;
        if (score > 0) {
          scored.push({ memory, score, viaGraph: false });
        }
      }

      // 4. If depth > 0, expand matched memories via graph neighbors
      const depth = input.depth ?? 1;
      if (depth > 0 && scored.length > 0) {
        const seenIds = new Set(scored.map((s) => s.memory.id));
        const expansions: ScoredMemory[] = [];

        for (const { memory } of scored) {
          const neighbors = await deps.structured.getNeighbors({
            type: 'memory',
            id: memory.id,
          });
          for (const neighbor of neighbors) {
            if (neighbor.type === 'memory' && !seenIds.has(neighbor.id)) {
              const neighborMemory = activeMemories.find((m) => m.id === neighbor.id);
              if (neighborMemory) {
                seenIds.add(neighbor.id);
                expansions.push({ memory: neighborMemory, score: 0, viaGraph: true });
              }
            }
          }
        }

        scored.push(...expansions);
      }

      // 5. Sort by score desc, take topK
      scored.sort((a, b) => b.score - a.score);
      const topK = input.tokenBudget ? Math.floor(input.tokenBudget / 200) : 10;
      const topResults = scored.slice(0, topK);

      // 6. Return as QueryResult<HybridSearchResult[]>
      // Note: factRetrieval's internal logic still uses getNeighbors for
      // graph expansion (KyberBot's fact-retrieval.ts doesn't). This is a
      // known divergence flagged by ADR 011; factRetrieval rebase to KB
      // parity is a separate future sprint. For shape consistency in v0.4.0:
      // graph-expanded hits collapse to 'keyword' matchType (no longer a
      // distinct 'graph' value), graphScore is always 0.
      const results: HybridSearchResult[] = topResults.map((s) => ({
        memory: s.memory,
        score: s.score,
        keywordScore: s.score,
        semanticScore: 0,
        graphScore: 0,
        matchType: 'keyword',
        why: s.viaGraph
          ? 'text-match + graph expansion (structured-only)'
          : 'text-match (structured-only, no FTS5)',
      }));

      return makeEnvelope(results);
    },
  };
}
