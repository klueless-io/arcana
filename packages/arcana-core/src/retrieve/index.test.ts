import { describe, it, expect, beforeEach } from 'vitest';
import {
  createNoopLogger,
  type VectorStore,
  type EmbeddingProvider,
  type RerankerProvider,
  type Memory,
} from '@kybernesis/arcana-contracts';
import { createFakeStructuredStore } from '@kybernesis/arcana-testkit/fakes';
import { createRetrieve, type RetrieveDeps } from './index.js';

let structured: ReturnType<typeof createFakeStructuredStore>;
let deps: RetrieveDeps;

beforeEach(async () => {
  structured = createFakeStructuredStore();
  await structured.connect();
  deps = {
    structured,
    vector: {} as any,
    embed: {} as any,
    logger: createNoopLogger(),
  };
});

// ---------------------------------------------------------------------------
// getEntityProfile
// ---------------------------------------------------------------------------

describe('getEntityProfile', () => {
  it('returns null when entity has no facts', async () => {
    const api = createRetrieve(deps);
    const result = await api.getEntityProfile('ent_unknown');
    expect(result.data).toBeNull();
  });

  it('assembles profile from facts', async () => {
    await structured.storeFact({
      id: 'fact_1',
      fact: 'Alice works at Anthropic',
      entity: 'ent_1',
      confidence: 0.9,
      sourceType: 'chat',
      createdAt: new Date().toISOString(),
      isLatest: true,
    });
    await structured.storeFact({
      id: 'fact_2',
      fact: 'Alice lives in San Francisco',
      entity: 'ent_1',
      confidence: 0.8,
      sourceType: 'chat',
      createdAt: new Date().toISOString(),
      isLatest: true,
    });

    const api = createRetrieve(deps);
    const result = await api.getEntityProfile('ent_1');

    expect(result.data).not.toBeNull();
    expect(result.data!.staticFacts).toHaveLength(2);
    expect(result.data!.entityId).toBe('ent_1');
  });

  it('returns stored profile on second call', async () => {
    await structured.storeFact({
      id: 'fact_3',
      fact: 'Bob is a developer',
      entity: 'ent_2',
      confidence: 0.95,
      sourceType: 'terminal',
      createdAt: new Date().toISOString(),
      isLatest: true,
    });

    const api = createRetrieve(deps);

    // First call assembles and stores the profile
    const first = await api.getEntityProfile('ent_2');
    expect(first.data).not.toBeNull();

    // Verify it was stored by checking the structured store directly
    const stored = await structured.getEntityProfile('ent_2');
    expect(stored).not.toBeNull();
    expect(stored!.entityId).toBe('ent_2');

    // Second call returns from storage
    const second = await api.getEntityProfile('ent_2');
    expect(second.data).toEqual(stored);
  });

  it('wraps result in QueryResult envelope', async () => {
    await structured.storeFact({
      id: 'fact_4',
      fact: 'Carol leads engineering',
      entity: 'ent_3',
      confidence: 0.85,
      sourceType: 'ai-extraction',
      createdAt: new Date().toISOString(),
      isLatest: true,
    });

    const api = createRetrieve(deps);
    const result = await api.getEntityProfile('ent_3');

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('data_age_ms', 0);
    expect(result).toHaveProperty('stale', false);
    expect(typeof result.generated_at).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// factRetrieval
// ---------------------------------------------------------------------------

describe('factRetrieval', () => {
  it('returns empty array when store is empty', async () => {
    const api = createRetrieve(deps);
    const result = await api.factRetrieval({ query: 'anything' });
    expect(result.data).toEqual([]);
  });

  it('matches memories by query words', async () => {
    await structured.storeMemory({
      id: 'mem_1',
      title: 'Anthropic founding',
      summary: 'History of Anthropic',
      content: 'Anthropic was founded by Dario Amodei',
      tags: [],
      priority: 0.5,
      tier: 'warm',
      decayScore: 0,
      accessCount: 0,
      isPinned: false,
      contentHash: 'abc12345',
      source: 'cli',
      status: 'active',
      isLatest: true,
    });

    const api = createRetrieve(deps);
    const result = await api.factRetrieval({ query: 'Anthropic founded' });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]!.score).toBeGreaterThan(0);
    expect(result.data[0]!.memory.id).toBe('mem_1');
  });

  it('scores higher for more word matches', async () => {
    await structured.storeMemory({
      id: 'mem_high',
      title: 'Dario Amodei Anthropic',
      summary: 'Founded Anthropic',
      content: 'Dario Amodei founded Anthropic with his sister',
      tags: [],
      priority: 0.5,
      tier: 'warm',
      decayScore: 0,
      accessCount: 0,
      isPinned: false,
      contentHash: 'aaa11111',
      source: 'cli',
      status: 'active',
      isLatest: true,
    });
    await structured.storeMemory({
      id: 'mem_low',
      title: 'Some company',
      summary: 'Dario is the CEO',
      content: 'Dario runs things here',
      tags: [],
      priority: 0.5,
      tier: 'warm',
      decayScore: 0,
      accessCount: 0,
      isPinned: false,
      contentHash: 'bbb22222',
      source: 'cli',
      status: 'active',
      isLatest: true,
    });

    const api = createRetrieve(deps);
    // Query words with length > 2: "dario", "anthropic", "founded"
    const result = await api.factRetrieval({ query: 'dario anthropic founded' });

    expect(result.data.length).toBeGreaterThanOrEqual(2);
    // mem_high matches all 3 words, mem_low matches only 1 — mem_high should come first
    expect(result.data[0]!.memory.id).toBe('mem_high');
    expect(result.data[0]!.score).toBeGreaterThan(result.data[1]!.score);
  });

  it('result includes why field indicating structured-only path', async () => {
    await structured.storeMemory({
      id: 'mem_2',
      title: 'Test memory',
      summary: 'About testing',
      content: 'This is a testing document for the structured retrieval path',
      tags: [],
      priority: 0.5,
      tier: 'warm',
      decayScore: 0,
      accessCount: 0,
      isPinned: false,
      contentHash: 'ccc33333',
      source: 'cli',
      status: 'active',
      isLatest: true,
    });

    const api = createRetrieve(deps);
    const result = await api.factRetrieval({ query: 'testing document' });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]!.why).toBe('text-match (structured-only, no FTS5)');
  });

  it('wraps result in QueryResult envelope', async () => {
    const api = createRetrieve(deps);
    const result = await api.factRetrieval({ query: 'something' });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('data_age_ms', 0);
    expect(result).toHaveProperty('stale', false);
    expect(typeof result.generated_at).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// hybridSearch — RRF fusion across FTS + vector + graph channels
// ---------------------------------------------------------------------------

const baseMemory = (overrides: Partial<Memory>): Memory => ({
  id: 'mem',
  title: '',
  summary: '',
  content: '',
  tags: [],
  priority: 0.5,
  tier: 'warm',
  decayScore: 0,
  accessCount: 0,
  isPinned: false,
  contentHash: 'h',
  source: 'cli',
  status: 'active',
  isLatest: true,
  ...overrides,
});

function makeVector(matches: Array<{ id: string; memoryId: string; score: number }> = []): VectorStore {
  return {
    connect: async () => {},
    disconnect: async () => {},
    upsert: async () => {},
    query: async () => matches.map((m) => ({ id: m.id, score: m.score, metadata: { memoryId: m.memoryId } })),
    delete: async () => {},
  };
}

function makeEmbed(): EmbeddingProvider {
  return {
    model: 'fake',
    dimensions: 4,
    embed: async () => [0.1, 0.2, 0.3, 0.4],
    embedBatch: async (texts) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
  };
}

describe('hybridSearch', () => {
  it('returns empty array when no channels match', async () => {
    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'nothing-matches' });
    expect(result.data).toEqual([]);
  });

  it('keyword-only match flows through the keyword channel', async () => {
    await structured.storeMemory(baseMemory({ id: 'mem_kw', title: 'hybrid retrieval is great', content: 'kybernesis' }));
    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'kybernesis' });
    expect(result.data.length).toBe(1);
    expect(result.data[0]?.memory.id).toBe('mem_kw');
    expect(result.data[0]?.matchType).toBe('keyword');
    expect(result.data[0]?.keywordScore).toBeGreaterThan(0);
    expect(result.data[0]?.semanticScore).toBe(0);
    expect(result.data[0]?.graphScore).toBe(0);
  });

  it('memory appearing in both keyword and semantic channels is marked multi', async () => {
    await structured.storeMemory(baseMemory({ id: 'mem_both', title: 'matched in both channels', content: 'kybernesis' }));
    await structured.storeMemory(baseMemory({ id: 'mem_kw_only', title: 'kybernesis only matched in keyword', content: 'kybernesis' }));

    const vector = makeVector([{ id: 'chunk_1', memoryId: 'mem_both', score: 0.9 }]);
    const api = createRetrieve({ ...deps, vector, embed: makeEmbed() });

    const result = await api.hybridSearch({ query: 'kybernesis' });
    const both = result.data.find((r) => r.memory.id === 'mem_both');
    const kwOnly = result.data.find((r) => r.memory.id === 'mem_kw_only');
    expect(both?.matchType).toBe('multi');
    expect(both?.keywordScore).toBeGreaterThan(0);
    expect(both?.semanticScore).toBeGreaterThan(0);
    expect(kwOnly?.matchType).toBe('keyword');
    // Multi-channel item should outrank single-channel item under RRF
    expect(both!.score).toBeGreaterThan(kwOnly!.score);
  });

  it('graph channel expands neighbors of seed memories', async () => {
    await structured.storeMemory(baseMemory({ id: 'seed', title: 'sentinel anchor', content: 'sentinel' }));
    await structured.storeMemory(baseMemory({ id: 'neighbor', title: 'unrelated', content: 'cabbage' }));
    await structured.storeEdge({
      id: 'edge_1',
      from: { type: 'memory', id: 'seed' },
      to: { type: 'memory', id: 'neighbor' },
      relation: 'related',
      confidence: 1.0,
      sharedTags: [],
      method: 'manual',
      createdAt: new Date().toISOString(),
    });

    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'sentinel', graphHops: 1 });
    const ids = result.data.map((r) => r.memory.id);
    expect(ids).toContain('seed');
    expect(ids).toContain('neighbor');
    const neighborResult = result.data.find((r) => r.memory.id === 'neighbor');
    expect(neighborResult?.matchType).toBe('graph');
    expect(neighborResult?.graphScore).toBeGreaterThan(0);
  });

  it('respects topK', async () => {
    for (let i = 0; i < 5; i++) {
      await structured.storeMemory(baseMemory({ id: `mem_${i}`, title: `widget ${i}`, content: 'widget' }));
    }
    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'widget', topK: 2 });
    expect(result.data.length).toBe(2);
  });

  it('survives a failing semantic channel (returns keyword-only)', async () => {
    await structured.storeMemory(baseMemory({ id: 'mem_kw', title: 'kybernesis only', content: 'kybernesis' }));
    const brokenVector: VectorStore = {
      connect: async () => {},
      disconnect: async () => {},
      upsert: async () => {},
      query: async () => { throw new Error('vector store offline'); },
      delete: async () => {},
    };
    const api = createRetrieve({ ...deps, vector: brokenVector, embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'kybernesis' });
    expect(result.data.length).toBe(1);
    expect(result.data[0]?.matchType).toBe('keyword');
  });

  it('calls reranker when rerank=true and a reranker is supplied', async () => {
    await structured.storeMemory(baseMemory({ id: 'mem_a', title: 'kybernesis a', content: 'kybernesis' }));
    await structured.storeMemory(baseMemory({ id: 'mem_b', title: 'kybernesis b', content: 'kybernesis' }));
    let rerankCalled = false;
    const reranker: RerankerProvider = {
      model: 'fake-rerank',
      rerank: async (_q, candidates) => {
        rerankCalled = true;
        return candidates.slice().reverse();
      },
    };
    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed(), reranker });
    const result = await api.hybridSearch({ query: 'kybernesis', rerank: true });
    expect(rerankCalled).toBe(true);
    expect(result.data.length).toBe(2);
  });

  it('wraps result in QueryResult envelope', async () => {
    const api = createRetrieve({ ...deps, vector: makeVector(), embed: makeEmbed() });
    const result = await api.hybridSearch({ query: 'anything' });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('data_age_ms', 0);
    expect(result).toHaveProperty('stale', false);
  });
});
