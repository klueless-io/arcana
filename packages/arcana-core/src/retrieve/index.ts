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
import { NotImplementedError } from '../errors.js';

export interface HybridSearchInput {
  query: string;
  scopes?: Scopes;
  tier?: Tier;
  topK?: number;
  graphHops?: number;
  rerank?: boolean;
}

export interface HybridSearchResult {
  memory: Memory;
  score: number;
  why?: string;
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

export function createRetrieve(_deps: RetrieveDeps): RetrieveApi {
  return {
    hybridSearch: async () => {
      throw new NotImplementedError(
        'arcana-core/retrieve.hybridSearch is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
    factRetrieval: async () => {
      throw new NotImplementedError(
        'arcana-core/retrieve.factRetrieval is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
    getEntityProfile: async () => {
      throw new NotImplementedError(
        'arcana-core/retrieve.getEntityProfile is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
  };
}
