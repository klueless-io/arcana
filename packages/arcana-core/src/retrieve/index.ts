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
  graphHops?: number;
  rerank?: boolean;
}

/**
 * Wave-1 parity shape — mirrors KyberBot's existing hybrid-search result so
 * downstream callers can swap providers with minimal adaptation. A future
 * wave-2 evolution may switch to a nested `channels` object once consumers
 * are stable. See docs/plans/2026-05-20-fts-and-hybridsearch.md §4.
 */
export interface HybridSearchResult {
  memory: Memory;
  /** Fused RRF score across all channels this memory appears in. */
  score: number;
  /** Per-channel scores. 0 when the memory wasn't returned by that channel. */
  semanticScore: number;
  keywordScore: number;
  graphScore: number;
  matchType: 'semantic' | 'keyword' | 'graph' | 'multi';
  why?: string;
}

/** RRF smoothing constant (de-facto standard). */
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
      const graphHops = input.graphHops ?? 1;
      const channelTopK = topK * 3;

      // Per-channel ranked lists of memory ids. Empty arrays when a channel
      // is unavailable or errors — fusion still works with one channel.
      let keywordIds: string[] = [];
      let semanticIds: string[] = [];

      // ── Keyword channel (FTS via StructuredStore) ─────────────────────
      try {
        const matches = await deps.structured.searchFulltext(input.query, {
          scopes: input.scopes,
          tier: input.tier,
          topK: channelTopK,
        });
        keywordIds = matches.map((m) => m.memoryId);
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
        // VectorStore returns chunk ids; metadata SHOULD carry memoryId.
        // Fall back: skip entries without one (cannot route to a memory).
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

      // ── Graph channel (BFS over neighbors of top keyword+semantic hits) ─
      const graphIds: string[] = [];
      if (graphHops > 0) {
        const seeds = Array.from(new Set([...keywordIds.slice(0, 5), ...semanticIds.slice(0, 5)]));
        const seenInGraph = new Set<string>([...keywordIds, ...semanticIds]);
        let frontier = seeds;
        for (let hop = 0; hop < graphHops; hop++) {
          const nextFrontier: string[] = [];
          for (const seedId of frontier) {
            try {
              const neighbors = await deps.structured.getNeighbors({
                type: 'memory',
                id: seedId,
              });
              for (const n of neighbors) {
                if (n.type !== 'memory') continue;
                if (seenInGraph.has(n.id)) continue;
                seenInGraph.add(n.id);
                graphIds.push(n.id);
                nextFrontier.push(n.id);
              }
            } catch (err) {
              deps.logger.debug('arcana.retrieve.hybridSearch.graph-hop-failed', {
                seedId,
                error: (err as Error).message,
              });
            }
          }
          frontier = nextFrontier;
          if (frontier.length === 0) break;
        }
      }

      // ── RRF fusion ───────────────────────────────────────────────────
      type Fused = {
        memoryId: string;
        score: number;
        semanticScore: number;
        keywordScore: number;
        graphScore: number;
      };
      const fused = new Map<string, Fused>();

      const addChannel = (
        ids: string[],
        channel: 'semantic' | 'keyword' | 'graph',
      ): void => {
        ids.forEach((id, rank) => {
          const contribution = rrfContribution(rank);
          const existing = fused.get(id) ?? {
            memoryId: id,
            score: 0,
            semanticScore: 0,
            keywordScore: 0,
            graphScore: 0,
          };
          existing.score += contribution;
          if (channel === 'semantic') existing.semanticScore = contribution;
          if (channel === 'keyword') existing.keywordScore = contribution;
          if (channel === 'graph') existing.graphScore = contribution;
          fused.set(id, existing);
        });
      };
      addChannel(keywordIds, 'keyword');
      addChannel(semanticIds, 'semantic');
      addChannel(graphIds, 'graph');

      const ranked = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, topK);

      // ── Enrich to Memory + assign matchType ──────────────────────────
      const enriched: HybridSearchResult[] = [];
      for (const f of ranked) {
        const memory = await deps.structured.getMemory(f.memoryId);
        if (!memory) continue;
        const channelCount =
          (f.keywordScore > 0 ? 1 : 0) +
          (f.semanticScore > 0 ? 1 : 0) +
          (f.graphScore > 0 ? 1 : 0);
        let matchType: HybridSearchResult['matchType'];
        if (channelCount > 1) matchType = 'multi';
        else if (f.keywordScore > 0) matchType = 'keyword';
        else if (f.semanticScore > 0) matchType = 'semantic';
        else matchType = 'graph';
        enriched.push({
          memory,
          score: f.score,
          semanticScore: f.semanticScore,
          keywordScore: f.keywordScore,
          graphScore: f.graphScore,
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
      const results: HybridSearchResult[] = topResults.map((s) => ({
        memory: s.memory,
        score: s.score,
        keywordScore: s.viaGraph ? 0 : s.score,
        semanticScore: 0,
        graphScore: s.viaGraph ? s.score : 0,
        matchType: s.viaGraph ? 'graph' : 'keyword',
        why: 'text-match (structured-only, no FTS5)',
      }));

      return makeEnvelope(results);
    },
  };
}
