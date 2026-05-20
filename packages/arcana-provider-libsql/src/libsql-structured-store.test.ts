import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Memory, Entity, Fact, Contradiction, Edge, Insight, EntityProfile, AgentSelf, Chunk } from '@kybernesis/arcana-contracts';
import { createLibsqlStructuredStore } from './libsql-structured-store.js';

const baseMemory = (): Memory => ({
  id: 'mem_1',
  title: 'Test memory',
  summary: 'short',
  content: 'hello world',
  tags: ['a', 'b'],
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

const baseEntity = (): Entity => ({
  id: 'ent_1',
  name: 'Anthropic',
  type: 'company',
  mentionCount: 3,
});

const baseFact = (): Fact => ({
  id: 'fact_1',
  fact: 'Anthropic was founded in 2021',
  entity: 'ent_1',
  confidence: 0.9,
  sourceType: 'ai-extraction',
  createdAt: '2026-05-19T00:00:00.000Z',
  isLatest: true,
});

describe('LibsqlStructuredStore (in-memory SQLite)', () => {
  const store = createLibsqlStructuredStore(':memory:');

  beforeEach(async () => { await store.connect(); });
  afterEach(async () => { await store.disconnect(); });

  // ── lifecycle ─────────────────────────────────────────────────────────────

  it('connect + disconnect do not throw', async () => {
    // beforeEach/afterEach cover this; just assert we got here
    expect(true).toBe(true);
  });

  it('throws when not connected', async () => {
    const cold = createLibsqlStructuredStore(':memory:');
    await expect(cold.getMemory('x')).rejects.toThrow('not connected');
  });

  it('connect() creates missing parent directories for file-based paths', async () => {
    const base = mkdtempSync(join(tmpdir(), 'arcana-test-'));
    const dbPath = join(base, 'nested', 'deep', 'arcana.db');
    const fileStore = createLibsqlStructuredStore(dbPath);
    await expect(fileStore.connect()).resolves.not.toThrow();
    await fileStore.disconnect();
    rmSync(base, { recursive: true, force: true });
  });

  // ── Memory ────────────────────────────────────────────────────────────────

  it('storeMemory then getMemory round-trips', async () => {
    const mem = baseMemory();
    await store.storeMemory(mem);
    expect(await store.getMemory('mem_1')).toEqual(mem);
  });

  it('getMemory returns null for unknown id', async () => {
    expect(await store.getMemory('nope')).toBeNull();
  });

  it('storeMemory round-trips optional fields', async () => {
    const mem: Memory = {
      ...baseMemory(),
      id: 'mem_opt',
      lastAccessedAt: '2026-05-19T00:00:00.000Z',
      supersededBy: 'mem_new',
      isLatest: false,
      scopes: { org_id: 'org_1' },
    };
    await store.storeMemory(mem);
    expect(await store.getMemory('mem_opt')).toEqual(mem);
  });

  it('listMemories returns all stored memories', async () => {
    await store.storeMemory(baseMemory());
    await store.storeMemory({ ...baseMemory(), id: 'mem_2', tier: 'cold' });
    const all = await store.listMemories();
    expect(all).toHaveLength(2);
  });

  it('listMemories filters by tier', async () => {
    await store.storeMemory(baseMemory());
    await store.storeMemory({ ...baseMemory(), id: 'mem_2', tier: 'cold' });
    const cold = await store.listMemories({ tier: 'cold' });
    expect(cold).toHaveLength(1);
    expect(cold[0].id).toBe('mem_2');
  });

  it('listMemories filters by isPinned', async () => {
    await store.storeMemory(baseMemory());
    await store.storeMemory({ ...baseMemory(), id: 'mem_pinned', isPinned: true });
    const pinned = await store.listMemories({ isPinned: true });
    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe('mem_pinned');
  });

  it('updateMemory partial-updates fields', async () => {
    await store.storeMemory(baseMemory());
    await store.updateMemory('mem_1', { isPinned: true, tier: 'hot' });
    const updated = await store.getMemory('mem_1');
    expect(updated?.isPinned).toBe(true);
    expect(updated?.tier).toBe('hot');
    expect(updated?.content).toBe('hello world'); // unchanged
  });

  it('updateMemory throws for unknown id', async () => {
    await expect(store.updateMemory('ghost', { isPinned: true })).rejects.toThrow('unknown id');
  });

  it('markMemorySuperseded sets isLatest=false and supersededBy', async () => {
    await store.storeMemory(baseMemory());
    await store.storeMemory({ ...baseMemory(), id: 'mem_new' });
    await store.markMemorySuperseded('mem_1', 'mem_new');
    const old = await store.getMemory('mem_1');
    expect(old?.isLatest).toBe(false);
    expect(old?.supersededBy).toBe('mem_new');
  });

  it('markMemorySuperseded throws for unknown id', async () => {
    await expect(store.markMemorySuperseded('ghost', 'mem_new')).rejects.toThrow('unknown id');
  });

  it('deleteMemory removes the row', async () => {
    await store.storeMemory(baseMemory());
    await store.deleteMemory('mem_1');
    expect(await store.getMemory('mem_1')).toBeNull();
  });

  // ── Chunk ─────────────────────────────────────────────────────────────────

  it('storeChunks then getChunksForMemory round-trips', async () => {
    const chunk: Chunk = { id: 'chunk_1', memoryId: 'mem_1', text: 'part', layer: 'warm' };
    await store.storeChunks([chunk]);
    const got = await store.getChunksForMemory('mem_1');
    expect(got).toHaveLength(1);
    expect(got[0].text).toBe('part');
  });

  // ── Entity ────────────────────────────────────────────────────────────────

  it('upsertEntity then getEntity round-trips', async () => {
    const ent = baseEntity();
    await store.upsertEntity(ent);
    expect(await store.getEntity('ent_1')).toEqual(ent);
  });

  it('getEntity returns null for unknown id', async () => {
    expect(await store.getEntity('nope')).toBeNull();
  });

  it('deleteEntity removes the row', async () => {
    await store.upsertEntity(baseEntity());
    await store.deleteEntity('ent_1');
    expect(await store.getEntity('ent_1')).toBeNull();
  });

  // ── Edge ──────────────────────────────────────────────────────────────────

  it('storeEdge then getNeighbors returns the other node', async () => {
    const edge: Edge = {
      id: 'edge_1',
      from: { type: 'memory', id: 'mem_1' },
      to: { type: 'entity', id: 'ent_1' },
      relation: 'mentions',
      confidence: 0.8,
      sharedTags: [],
      method: 'extraction',
      createdAt: '2026-05-19T00:00:00.000Z',
    };
    await store.storeEdge(edge);
    const neighbors = await store.getNeighbors({ type: 'memory', id: 'mem_1' });
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]).toEqual({ type: 'entity', id: 'ent_1' });
  });

  // ── Fact ──────────────────────────────────────────────────────────────────

  it('storeFact then getFactsForEntity round-trips', async () => {
    const fact = baseFact();
    await store.storeFact(fact);
    const got = await store.getFactsForEntity('ent_1');
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(fact);
  });

  it('getFactsForEntity filters by attribute', async () => {
    await store.storeFact({ ...baseFact(), attribute: 'founded' });
    await store.storeFact({ ...baseFact(), id: 'fact_2', attribute: 'ceo' });
    const got = await store.getFactsForEntity('ent_1', 'founded');
    expect(got).toHaveLength(1);
    expect(got[0].attribute).toBe('founded');
  });

  it('markFactSuperseded sets isLatest=false and supersededBy', async () => {
    await store.storeFact(baseFact());
    await store.storeFact({ ...baseFact(), id: 'fact_new' });
    await store.markFactSuperseded('fact_1', 'fact_new');
    const facts = await store.getFactsForEntity('ent_1');
    const old = facts.find((f) => f.id === 'fact_1');
    expect(old?.isLatest).toBe(false);
    expect(old?.supersededBy).toBe('fact_new');
  });

  it('markFactSuperseded throws for unknown id', async () => {
    await expect(store.markFactSuperseded('ghost', 'fact_new')).rejects.toThrow('unknown id');
  });

  // ── Contradiction ─────────────────────────────────────────────────────────

  it('storeContradiction then listContradictions round-trips', async () => {
    const c: Contradiction = {
      id: 'con_1',
      factAId: 'fact_1',
      factBId: 'fact_2',
      status: 'pending',
      createdAt: '2026-05-19T00:00:00.000Z',
    };
    await store.storeContradiction(c);
    const all = await store.listContradictions();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(c);
  });

  it('listContradictions filters by status', async () => {
    await store.storeContradiction({ id: 'c1', factAId: 'f1', factBId: 'f2', status: 'pending', createdAt: '2026-05-19T00:00:00.000Z' });
    await store.storeContradiction({ id: 'c2', factAId: 'f3', factBId: 'f4', status: 'auto-resolved', createdAt: '2026-05-19T00:00:00.000Z' });
    expect(await store.listContradictions('pending')).toHaveLength(1);
    expect(await store.listContradictions('auto-resolved')).toHaveLength(1);
  });

  // ── Insight ───────────────────────────────────────────────────────────────

  it('storeInsight then listInsights round-trips', async () => {
    const insight: Insight = {
      id: 'ins_1',
      entityId: 'ent_1',
      type: 'deduction',
      statement: 'Anthropic focuses on safety',
      supportingFactIds: ['fact_1'],
      confidence: 0.8,
      createdAt: '2026-05-19T00:00:00.000Z',
    };
    await store.storeInsight(insight);
    const all = await store.listInsights('ent_1');
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(insight);
  });

  // ── EntityProfile ─────────────────────────────────────────────────────────

  it('storeEntityProfile then getEntityProfile round-trips', async () => {
    const profile: EntityProfile = {
      id: 'prof_1',
      entityId: 'ent_1',
      staticFacts: [{ value: 'type=company', confidence: 0.95 }],
      dynamicContext: 'Recent: Opus 4.7 release',
      relatedEntityIds: [],
    };
    await store.storeEntityProfile(profile);
    expect(await store.getEntityProfile('ent_1')).toEqual(profile);
  });

  it('getEntityProfile returns null for unknown entityId', async () => {
    expect(await store.getEntityProfile('nope')).toBeNull();
  });

  // ── AgentSelf ─────────────────────────────────────────────────────────────

  it('getAgentSelf returns null before any write', async () => {
    expect(await store.getAgentSelf()).toBeNull();
  });

  it('updateAgentSelf then getAgentSelf round-trips', async () => {
    const self: AgentSelf = {
      memoryBlocks: [{ label: 'role', content: 'assistant', updatedAt: '2026-05-19T00:00:00.000Z' }],
      history: [],
    };
    await store.updateAgentSelf(self);
    expect(await store.getAgentSelf()).toEqual(self);
  });

  // ── searchFulltext (FTS5) ─────────────────────────────────────────────────

  it('searchFulltext returns matches ranked by relevance', async () => {
    await store.storeMemory({ ...baseMemory(), id: 'mem_a', title: 'Anthropic releases Claude', content: 'machine learning company' });
    await store.storeMemory({ ...baseMemory(), id: 'mem_b', title: 'Unrelated topic', content: 'something about gardening' });
    await store.storeMemory({ ...baseMemory(), id: 'mem_c', title: 'Anthropic and Claude', content: 'AI assistant by Anthropic' });

    const matches = await store.searchFulltext('anthropic claude');
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const ids = matches.map((m) => m.memoryId);
    expect(ids).toContain('mem_a');
    expect(ids).toContain('mem_c');
    expect(ids).not.toContain('mem_b');
    // Scores normalized to 0..1
    for (const m of matches) {
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThanOrEqual(1);
    }
  });

  it('searchFulltext reports matchedFields per result', async () => {
    await store.storeMemory({ ...baseMemory(), id: 'mem_title', title: 'kybernesis architecture', content: 'unrelated body' });
    await store.storeMemory({ ...baseMemory(), id: 'mem_content', title: 'unrelated header', content: 'kybernesis everywhere in the body text' });

    const titleMatch = (await store.searchFulltext('kybernesis')).find((m) => m.memoryId === 'mem_title');
    const contentMatch = (await store.searchFulltext('kybernesis')).find((m) => m.memoryId === 'mem_content');
    expect(titleMatch?.matchedFields).toContain('title');
    expect(titleMatch?.matchedFields).not.toContain('content');
    expect(contentMatch?.matchedFields).toContain('content');
    expect(contentMatch?.matchedFields).not.toContain('title');
  });

  it('searchFulltext filters by tier', async () => {
    await store.storeMemory({ ...baseMemory(), id: 'mem_hot', title: 'arcana fts', tier: 'hot' });
    await store.storeMemory({ ...baseMemory(), id: 'mem_cold', title: 'arcana fts', tier: 'archive' });

    const hot = await store.searchFulltext('arcana fts', { tier: 'hot' });
    expect(hot.map((m) => m.memoryId)).toEqual(['mem_hot']);
  });

  it('searchFulltext filters by scopes', async () => {
    await store.storeMemory({
      ...baseMemory(), id: 'mem_org_a', title: 'gizmo widget',
      scopes: { org_id: 'org_a' },
    });
    await store.storeMemory({
      ...baseMemory(), id: 'mem_org_b', title: 'gizmo widget',
      scopes: { org_id: 'org_b' },
    });

    const orgA = await store.searchFulltext('gizmo', { scopes: { org_id: 'org_a' } });
    expect(orgA.map((m) => m.memoryId)).toEqual(['mem_org_a']);
  });

  it('searchFulltext returns empty for whitespace-only query', async () => {
    await store.storeMemory({ ...baseMemory(), id: 'mem_x', title: 'something' });
    expect(await store.searchFulltext('')).toEqual([]);
    expect(await store.searchFulltext('   ')).toEqual([]);
  });

  it('searchFulltext respects topK', async () => {
    for (let i = 0; i < 5; i++) {
      await store.storeMemory({ ...baseMemory(), id: `mem_t${i}`, title: `widget number ${i}`, content: 'widget body' });
    }
    const limited = await store.searchFulltext('widget', { topK: 2 });
    expect(limited.length).toBe(2);
  });

  it('searchFulltext index stays in sync with updates and deletes', async () => {
    await store.storeMemory({ ...baseMemory(), id: 'mem_sync', title: 'pebble' });
    expect((await store.searchFulltext('pebble')).map((m) => m.memoryId)).toContain('mem_sync');

    await store.updateMemory('mem_sync', { title: 'cobblestone' });
    expect((await store.searchFulltext('pebble')).map((m) => m.memoryId)).not.toContain('mem_sync');
    expect((await store.searchFulltext('cobblestone')).map((m) => m.memoryId)).toContain('mem_sync');

    await store.deleteMemory('mem_sync');
    expect((await store.searchFulltext('cobblestone')).map((m) => m.memoryId)).not.toContain('mem_sync');
  });

  // ── getFactsForEntity asOf filter ─────────────────────────────────────────

  it('getFactsForEntity filters out expired facts when asOf is supplied', async () => {
    await store.upsertEntity(baseEntity());
    await store.storeFact({
      ...baseFact(), id: 'f_active', fact: 'active fact', expiresAt: '2027-01-01T00:00:00.000Z',
    });
    await store.storeFact({
      ...baseFact(), id: 'f_expired', fact: 'expired fact', expiresAt: '2025-01-01T00:00:00.000Z',
    });
    await store.storeFact({
      ...baseFact(), id: 'f_perpetual', fact: 'perpetual fact',
    });

    const asOfMid = '2026-06-01T00:00:00.000Z';
    const ids = (await store.getFactsForEntity('ent_1', undefined, asOfMid)).map((f) => f.id).sort();
    expect(ids).toEqual(['f_active', 'f_perpetual']);

    // No asOf preserves legacy behavior — returns everything
    const all = (await store.getFactsForEntity('ent_1')).map((f) => f.id).sort();
    expect(all).toEqual(['f_active', 'f_expired', 'f_perpetual']);
  });
});
