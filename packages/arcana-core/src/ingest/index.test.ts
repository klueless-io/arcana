import { describe, it, expect, beforeEach } from 'vitest';
import { createNoopLogger } from '@kybernesisai/arcana-contracts';
import {
  createFakeStructuredStore,
  createFakeVectorStore,
  createFakeEmbeddingProvider,
  createFakeLLMProvider,
} from '@kybernesisai/arcana-testkit/fakes';
import { createIngest, type IngestApi, type IngestDeps } from './index.js';
import { NotImplementedError } from '../errors.js';

let deps: IngestDeps;
let api: IngestApi;
let structured: ReturnType<typeof createFakeStructuredStore>;

beforeEach(async () => {
  structured = createFakeStructuredStore();
  await structured.connect();
  deps = {
    structured,
    vector: createFakeVectorStore(),
    embed: createFakeEmbeddingProvider(),
    llm: createFakeLLMProvider(),
    logger: createNoopLogger(),
  };
  api = createIngest(deps);
});

describe('ingest.storeMemory', () => {
  it('persists a memory and returns its id', async () => {
    const id = await api.storeMemory({
      content: 'Some test content',
      title: 'Test',
      source: 'cli',
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID

    const stored = await structured.getMemory(id);
    expect(stored).not.toBeNull();
    expect(stored?.content).toBe('Some test content');
    expect(stored?.title).toBe('Test');
    expect(stored?.source).toBe('cli');
  });

  it('fills defaults for unspecified fields', async () => {
    const id = await api.storeMemory({ content: 'just content', source: 'chat' });
    const m = await structured.getMemory(id);
    expect(m?.title).toBe('');
    expect(m?.summary).toBe('');
    expect(m?.tags).toEqual([]);
    expect(m?.priority).toBe(0.5);
    expect(m?.tier).toBe('warm');
    expect(m?.decayScore).toBe(0);
    expect(m?.accessCount).toBe(0);
    expect(m?.isPinned).toBe(false);
    expect(m?.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('computes deterministic contentHash for the same content', async () => {
    const id1 = await api.storeMemory({ content: 'same content', source: 'cli' });
    const id2 = await api.storeMemory({ content: 'same content', source: 'cli' });
    const m1 = await structured.getMemory(id1);
    const m2 = await structured.getMemory(id2);
    expect(m1?.contentHash).toBe(m2?.contentHash);
    // IDs are still different (UUID per call); dedup is the consumer's choice
    expect(id1).not.toBe(id2);
  });

  it('preserves caller-supplied tags + scopes', async () => {
    const id = await api.storeMemory({
      content: 'x',
      tags: ['type:conversation', 'entity:Alice'],
      source: 'channel',
      scopes: { project_id: 'proj_1', classification: 'internal' },
    });
    const m = await structured.getMemory(id);
    expect(m?.tags).toEqual(['type:conversation', 'entity:Alice']);
    expect(m?.scopes).toEqual({
      project_id: 'proj_1',
      classification: 'internal',
    });
  });

  it('rejects invalid source enum at validate time', async () => {
    await expect(
      api.storeMemory({ content: 'x', source: 'invalid-source' as never }),
    ).rejects.toThrow();
  });
});

describe('ingest.ingestDocument', () => {
  it('still throws NotImplementedError at this milestone', async () => {
    await expect(
      api.ingestDocument({ format: 'markdown', content: '# hi' }),
    ).rejects.toThrow(NotImplementedError);
  });
});
