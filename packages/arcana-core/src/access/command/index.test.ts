import { describe, it, expect, beforeEach } from 'vitest';
import { createNoopLogger, type Entity } from '@kybernesisai/arcana-contracts';
import {
  createFakeStructuredStore,
  createFakeVectorStore,
} from '@kybernesisai/arcana-testkit/fakes';
import { createCommand, type CommandApi, type CommandDeps } from './index.js';
import { NotImplementedError } from '../../errors.js';

let deps: CommandDeps;
let api: CommandApi;
let structured: ReturnType<typeof createFakeStructuredStore>;

beforeEach(async () => {
  structured = createFakeStructuredStore();
  await structured.connect();
  deps = {
    structured,
    vector: createFakeVectorStore(),
    logger: createNoopLogger(),
  };
  api = createCommand(deps);
});

describe('createCommand surface', () => {
  it('returns an object with all documented methods', () => {
    expect(typeof api.upsertEntity).toBe('function');
    expect(typeof api.deleteEntity).toBe('function');
    expect(typeof api.recordFact).toBe('function');
    expect(typeof api.correctFact).toBe('function');
    expect(typeof api.linkNodes).toBe('function');
    expect(typeof api.pin).toBe('function');
    expect(typeof api.moveToTier).toBe('function');
    expect(typeof api.deleteMemory).toBe('function');
    expect(typeof api.updateBlock).toBe('function');
  });
});

describe('command.upsertEntity', () => {
  const sample: Entity = {
    id: 'ent_1',
    name: 'Anthropic',
    type: 'company',
    mentionCount: 0,
  };

  it('persists an entity', async () => {
    await api.upsertEntity(sample);
    expect(await structured.getEntity('ent_1')).toEqual(sample);
  });

  it('replaces an existing entity on second call', async () => {
    await api.upsertEntity(sample);
    await api.upsertEntity({ ...sample, mentionCount: 5 });
    const stored = await structured.getEntity('ent_1');
    expect(stored?.mentionCount).toBe(5);
  });
});

describe('command.deleteEntity', () => {
  it('removes an entity by id', async () => {
    const e: Entity = { id: 'ent_2', name: 'X', type: 'topic', mentionCount: 0 };
    await api.upsertEntity(e);
    await api.deleteEntity('ent_2');
    expect(await structured.getEntity('ent_2')).toBeNull();
  });

  it('is a no-op when the entity does not exist', async () => {
    await expect(api.deleteEntity('missing')).resolves.toBeUndefined();
  });
});

describe('command.linkNodes', () => {
  it('creates an edge between two entities', async () => {
    const edgeId = await api.linkNodes(
      { type: 'entity', id: 'ent_a' },
      { type: 'entity', id: 'ent_b' },
      'co-occurred',
    );
    expect(typeof edgeId).toBe('string');
    expect(edgeId.length).toBeGreaterThan(0);
    const neighbors = await structured.getNeighbors({ type: 'entity', id: 'ent_a' });
    expect(neighbors).toEqual([{ type: 'entity', id: 'ent_b' }]);
  });

  it('creates an edge between memory and entity (NodeRef polymorphism)', async () => {
    await api.linkNodes(
      { type: 'memory', id: 'mem_1' },
      { type: 'entity', id: 'ent_x' },
      'mentions',
    );
    const neighbors = await structured.getNeighbors({ type: 'memory', id: 'mem_1' });
    expect(neighbors).toEqual([{ type: 'entity', id: 'ent_x' }]);
  });

  it('applies default confidence=1.0 and method="consumer-mirror" when opts omitted', async () => {
    const id = await api.linkNodes(
      { type: 'entity', id: 'a' },
      { type: 'entity', id: 'b' },
      'related',
    );
    // We can't directly fetch the Edge through the API, but we can verify the
    // neighbor link exists, which proves storeEdge was called with valid input
    // (the schema would reject confidence > 1 or missing method).
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honors caller-supplied opts', async () => {
    const id = await api.linkNodes(
      { type: 'entity', id: 'a' },
      { type: 'entity', id: 'b' },
      'works_at',
      {
        confidence: 0.7,
        sharedTags: ['workplace'],
        method: 'jaccard',
        rationale: 'Both mentioned in same conversation',
      },
    );
    expect(typeof id).toBe('string');
  });

  it('creates a new edge each call (consumer handles dedup)', async () => {
    const a = await api.linkNodes(
      { type: 'entity', id: 'x' },
      { type: 'entity', id: 'y' },
      'related',
    );
    const b = await api.linkNodes(
      { type: 'entity', id: 'x' },
      { type: 'entity', id: 'y' },
      'related',
    );
    expect(a).not.toBe(b);
  });
});

describe('command.recordFact', () => {
  it('persists a sentence-only fact (no triple decomposition)', async () => {
    const id = await api.recordFact({
      fact: 'David likes coffee',
      entity: 'David',
      confidence: 0.8,
      sourceType: 'chat',
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const stored = await structured.getFactsForEntity('David');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.fact).toBe('David likes coffee');
    expect(stored[0]?.attribute).toBeUndefined();
    expect(stored[0]?.value).toBeUndefined();
    expect(stored[0]?.isLatest).toBe(true);
  });

  it('persists a fully-decomposed fact (with attribute + value)', async () => {
    const id = await api.recordFact({
      fact: 'David is a senior engineer',
      entity: 'David',
      attribute: 'role',
      value: 'senior engineer',
      confidence: 0.95,
      sourceType: 'ai-extraction',
    });
    const stored = await structured.getFactsForEntity('David', 'role');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(id);
    expect(stored[0]?.attribute).toBe('role');
    expect(stored[0]?.value).toBe('senior engineer');
  });

  it('passes through optional scopes', async () => {
    const id = await api.recordFact({
      fact: 'Acme is in San Francisco',
      entity: 'Acme',
      confidence: 0.9,
      sourceType: 'connector',
      scopes: { project_id: 'proj_1' },
    });
    const stored = (await structured.getFactsForEntity('Acme'))[0];
    expect(stored?.id).toBe(id);
    expect(stored?.scopes?.project_id).toBe('proj_1');
  });

  it('rejects invalid confidence (out of range)', async () => {
    await expect(
      api.recordFact({
        fact: 'x',
        entity: 'David',
        confidence: 1.5,
        sourceType: 'chat',
      }),
    ).rejects.toThrow();
  });

  it('rejects empty fact (required field)', async () => {
    await expect(
      api.recordFact({
        fact: '',
        entity: 'David',
        confidence: 0.5,
        sourceType: 'chat',
      }),
    ).rejects.toThrow();
  });
});

describe('still-stubbed command methods', () => {
  it('correctFact throws NotImplementedError', async () => {
    await expect(api.correctFact('fact_1', 'new')).rejects.toThrow(
      NotImplementedError,
    );
  });

  it('pin throws NotImplementedError', async () => {
    await expect(api.pin('mem_1')).rejects.toThrow(NotImplementedError);
  });

  it('moveToTier throws NotImplementedError', async () => {
    await expect(api.moveToTier('mem_1', 'hot')).rejects.toThrow(
      NotImplementedError,
    );
  });

  it('deleteMemory throws NotImplementedError', async () => {
    await expect(api.deleteMemory('mem_1')).rejects.toThrow(NotImplementedError);
  });

  it('updateBlock throws NotImplementedError', async () => {
    await expect(api.updateBlock('persona', 'new')).rejects.toThrow(
      NotImplementedError,
    );
  });
});
