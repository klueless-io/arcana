import type {
  Fact,
  Contradiction,
  Insight,
  NodeRef,
  AgentSelf,
  Scopes,
  StructuredStore,
  Logger,
  QueryResult,
} from '@kybernesisai/arcana-contracts';
import { NotImplementedError } from '../../errors.js';

export interface QueryStatsResult {
  memoryCount: number;
  entityCount: number;
  factCount: number;
  contradictionCount: number;
  insightCount: number;
}

export interface QueryDeps {
  structured: StructuredStore;
  logger: Logger;
}

export interface QueryApi {
  /** Look up facts for an entity. Optionally narrow by attribute. */
  queryFacts(entity: string, attribute?: string): Promise<QueryResult<Fact[]>>;
  /** Walk the graph N hops out from a node. */
  getNeighbors(node: NodeRef, hops?: number): Promise<QueryResult<NodeRef[]>>;
  /** Aggregate counts across the brain. */
  stats(scopes?: Scopes): Promise<QueryResult<QueryStatsResult>>;
  /** Outstanding or resolved contradictions. */
  listContradictions(status?: Contradiction['status']): Promise<QueryResult<Contradiction[]>>;
  /** Reasoning-derived insights, optionally per entity. */
  listInsights(entityId?: string): Promise<QueryResult<Insight[]>>;
  /** Read one of the agent's own memory blocks (persona, objectives, etc.). */
  readBlock(label: string): Promise<QueryResult<string | null>>;
  /** History of changes to an agent-self block. */
  getBlockHistory(label: string): Promise<QueryResult<AgentSelf['history']>>;
}

export function createQuery(_deps: QueryDeps): QueryApi {
  const stub = (method: string): never => {
    throw new NotImplementedError(
      `arcana-core/access.query.${method} is a v0.1 scaffold stub; real implementation lands in v0.x`,
    );
  };

  return {
    queryFacts: async () => stub('queryFacts'),
    getNeighbors: async () => stub('getNeighbors'),
    stats: async () => stub('stats'),
    listContradictions: async () => stub('listContradictions'),
    listInsights: async () => stub('listInsights'),
    readBlock: async () => stub('readBlock'),
    getBlockHistory: async () => stub('getBlockHistory'),
  };
}
