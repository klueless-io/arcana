import { describe, it, expect, beforeEach } from 'vitest';
import { createNoopLogger, type Fact } from '@kybernesis/arcana-contracts';
import { createFakeStructuredStore } from '@kybernesis/arcana-testkit/fakes';
import { createQuery, type QueryApi, type QueryDeps } from './index.js';
import { NotImplementedError } from '../../errors.js';

let deps: QueryDeps;
let api: QueryApi;
let structured: ReturnType<typeof createFakeStructuredStore>;

beforeEach(async () => {
  structured = createFakeStructuredStore();
  await structured.connect();
  deps = { structured, logger: createNoopLogger() };
  api = createQuery(deps);
});

describe('createQuery surface', () => {
  it('returns an object with the documented API surface', () => {
    expect(typeof api.queryFacts).toBe('function');
    expect(typeof api.getNeighbors).toBe('function');
    expect(typeof api.stats).toBe('function');
    expect(typeof api.listContradictions).toBe('function');
    expect(typeof api.listInsights).toBe('function');
    expect(typeof api.readBlock).toBe('function');
    expect(typeof api.getBlockHistory).toBe('function');
  });
});

describe('query.queryFacts', () => {
  const sampleSentenceFact: Fact = {
    id: 'f_1',
    fact: 'David likes coffee',
    entity: 'David',
    confidence: 0.8,
    sourceType: 'chat',
    createdAt: '2026-05-18T08:00:00.000Z',
    isLatest: true,
  };

  const sampleTripleFact: Fact = {
    id: 'f_2',
    fact: 'David lives in Sydney',
    entity: 'David',
    attribute: 'location',
    value: 'Sydney',
    confidence: 0.9,
    sourceType: 'ai-extraction',
    createdAt: '2026-05-18T08:00:00.000Z',
    isLatest: true,
  };

  beforeEach(async () => {
    await structured.storeFact(sampleSentenceFact);
    await structured.storeFact(sampleTripleFact);
  });

  it('returns all facts for an entity (no attribute filter)', async () => {
    const result = await api.queryFacts('David');
    expect(result.data).toHaveLength(2);
    expect(result.data.map((f) => f.id).sort()).toEqual(['f_1', 'f_2']);
  });

  it('filters by attribute when provided', async () => {
    const result = await api.queryFacts('David', 'location');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('f_2');
  });

  it('returns an empty array for unknown entity (still QueryResult shape)', async () => {
    const result = await api.queryFacts('Unknown');
    expect(result.data).toEqual([]);
    expect(typeof result.generated_at).toBe('string');
    expect(result.stale).toBe(false);
  });

  it('wraps results in a fresh QueryResult envelope', async () => {
    const result = await api.queryFacts('David');
    expect(result.generated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(result.data_age_ms).toBe(0);
    expect(result.stale).toBe(false);
  });
});

describe('still-stubbed query methods', () => {
  it('getNeighbors throws NotImplementedError', async () => {
    await expect(
      api.getNeighbors({ type: 'memory', id: 'mem_1' }),
    ).rejects.toThrow(NotImplementedError);
  });

  it('stats throws NotImplementedError', async () => {
    await expect(api.stats()).rejects.toThrow(NotImplementedError);
  });

  it('listContradictions throws NotImplementedError', async () => {
    await expect(api.listContradictions()).rejects.toThrow(NotImplementedError);
  });

  it('listInsights throws NotImplementedError', async () => {
    await expect(api.listInsights()).rejects.toThrow(NotImplementedError);
  });

  it('readBlock throws NotImplementedError', async () => {
    await expect(api.readBlock('persona')).rejects.toThrow(NotImplementedError);
  });

  it('getBlockHistory throws NotImplementedError', async () => {
    await expect(api.getBlockHistory('persona')).rejects.toThrow(
      NotImplementedError,
    );
  });
});
