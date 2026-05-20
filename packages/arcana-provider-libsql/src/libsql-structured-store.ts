import Database from 'libsql';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  StructuredStore,
  Memory,
  Chunk,
  Entity,
  Edge,
  Fact,
  Contradiction,
  Insight,
  EntityProfile,
  AgentSelf,
  NodeRef,
  MemoryFilter,
  FulltextSearchOpts,
  FulltextMatch,
  FulltextField,
} from '@kybernesis/arcana-contracts';
import { DDL } from './schema.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function j(v: unknown): string {
  return JSON.stringify(v);
}

function p<T>(v: string | null | undefined): T {
  return JSON.parse(v ?? 'null') as T;
}

function bool(v: number | null | undefined): boolean {
  return v === 1;
}

function int(v: boolean): number {
  return v ? 1 : 0;
}

function assertConnected(
  db: Database.Database | null,
): asserts db is Database.Database {
  if (!db) {
    throw new Error(
      'LibsqlStructuredStore: not connected — call connect() first',
    );
  }
}

// ─── fulltext helpers ────────────────────────────────────────────────────────

const FTS_FIELDS: readonly FulltextField[] = ['title', 'summary', 'content', 'tags'] as const;

/**
 * Build an FTS5 MATCH query from a natural-language string. Words are
 * lowercased, double-quote-escaped, and OR'd together. Returns null when
 * the input has no usable tokens.
 */
function buildFtsQuery(query: string): { ftsQuery: string; tokens: string[] } | null {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0);
  if (tokens.length === 0) return null;
  const ftsQuery = tokens.map((w) => `"${w.replace(/"/g, '""')}"`).join(' OR ');
  return { ftsQuery, tokens };
}

/**
 * FTS5 `rank` is a real number; lower (more negative) = better match.
 * Normalize to 0..1 where higher = better, monotonic in |rank|.
 */
function normalizeRank(rank: number): number {
  return 1 / (1 + Math.abs(rank));
}

/**
 * Cheaply detect which fields contain at least one query token. Avoids
 * an extra per-column FTS query.
 */
function detectMatchedFields(
  row: Row,
  tokens: string[],
  selected: readonly FulltextField[],
): FulltextField[] {
  const matched: FulltextField[] = [];
  for (const field of selected) {
    const haystack = String(row[field] ?? '').toLowerCase();
    if (tokens.some((t) => haystack.includes(t))) matched.push(field);
  }
  return matched;
}

// ─── row mappers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function rowToMemory(row: Row): Memory {
  return {
    id: row.id as string,
    title: row.title as string,
    summary: row.summary as string,
    content: row.content as string,
    tags: p<string[]>(row.tags as string),
    priority: row.priority as number,
    tier: row.tier as Memory['tier'],
    decayScore: row.decay_score as number,
    accessCount: row.access_count as number,
    lastAccessedAt: (row.last_accessed_at as string | null) ?? undefined,
    isPinned: bool(row.is_pinned as number),
    contentHash: row.content_hash as string,
    source: row.source as Memory['source'],
    status: row.status as Memory['status'],
    isLatest: bool(row.is_latest as number),
    supersededBy: (row.superseded_by as string | null) ?? undefined,
    scopes: row.scopes ? p(row.scopes as string) : undefined,
  };
}

function memoryToRow(m: Memory): Row {
  return {
    id: m.id,
    title: m.title,
    summary: m.summary,
    content: m.content,
    tags: j(m.tags),
    priority: m.priority,
    tier: m.tier,
    decay_score: m.decayScore,
    access_count: m.accessCount,
    last_accessed_at: m.lastAccessedAt ?? null,
    is_pinned: int(m.isPinned),
    content_hash: m.contentHash,
    source: m.source,
    status: m.status,
    is_latest: int(m.isLatest),
    superseded_by: m.supersededBy ?? null,
    scopes: m.scopes ? j(m.scopes) : null,
  };
}

function rowToChunk(row: Row): Chunk {
  return {
    id: row.id as string,
    memoryId: row.memory_id as string,
    text: row.text as string,
    vectorId: (row.vector_id as string | null) ?? undefined,
    layer: row.layer as Chunk['layer'],
  };
}

function rowToEntity(row: Row): Entity {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Entity['type'],
    mentionCount: row.mention_count as number,
    scopes: row.scopes ? p(row.scopes as string) : undefined,
  };
}


function rowToFact(row: Row): Fact {
  return {
    id: row.id as string,
    fact: row.fact as string,
    entity: row.entity as string,
    attribute: (row.attribute as string | null) ?? undefined,
    value: (row.value as string | null) ?? undefined,
    confidence: row.confidence as number,
    sourceType: row.source_type as Fact['sourceType'],
    createdAt: row.created_at as string,
    lastReinforcedAt: (row.last_reinforced_at as string | null) ?? undefined,
    expiresAt: (row.expires_at as string | null) ?? undefined,
    isLatest: bool(row.is_latest as number),
    supersededBy: (row.superseded_by as string | null) ?? undefined,
    surprisalScore: (row.surprisal_score as number | null) ?? undefined,
    scopes: row.scopes ? p(row.scopes as string) : undefined,
  };
}

function rowToContradiction(row: Row): Contradiction {
  return {
    id: row.id as string,
    factAId: row.fact_a_id as string,
    factBId: row.fact_b_id as string,
    status: row.status as Contradiction['status'],
    rationale: (row.rationale as string | null) ?? undefined,
    resolution: (row.resolution as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToInsight(row: Row): Insight {
  return {
    id: row.id as string,
    entityId: (row.entity_id as string | null) ?? undefined,
    type: row.type as Insight['type'],
    statement: row.statement as string,
    supportingFactIds: p<string[]>(row.supporting_fact_ids as string),
    confidence: row.confidence as number,
    createdAt: row.created_at as string,
  };
}

function rowToEntityProfile(row: Row): EntityProfile {
  return {
    id: row.id as string,
    entityId: row.entity_id as string,
    staticFacts: p(row.static_facts as string),
    dynamicContext: row.dynamic_context as string,
    narrativeProse: (row.narrative_prose as string | null) ?? undefined,
    relatedEntityIds: p<string[]>(row.related_entity_ids as string),
  };
}

// ─── factory ─────────────────────────────────────────────────────────────────

export function createLibsqlStructuredStore(dbPath: string): StructuredStore {
  let db: Database.Database | null = null;

  return {
    // ── lifecycle ─────────────────────────────────────────────────────────

    connect: async () => {
      if (dbPath !== ':memory:') {
        mkdirSync(dirname(dbPath), { recursive: true });
      }
      db = new Database(dbPath);
      db.exec(DDL);
    },

    disconnect: async () => {
      db?.close();
      db = null;
    },

    // ── Memory ────────────────────────────────────────────────────────────

    storeMemory: async (memory: Memory) => {
      assertConnected(db);
      const row = memoryToRow(memory);
      db.prepare(`
        INSERT OR REPLACE INTO memories
          (id, title, summary, content, tags, priority, tier, decay_score,
           access_count, last_accessed_at, is_pinned, content_hash, source,
           status, is_latest, superseded_by, scopes)
        VALUES
          (@id, @title, @summary, @content, @tags, @priority, @tier, @decay_score,
           @access_count, @last_accessed_at, @is_pinned, @content_hash, @source,
           @status, @is_latest, @superseded_by, @scopes)
      `).run(row);
    },

    getMemory: async (id: string) => {
      assertConnected(db);
      const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Row | undefined;
      return row ? rowToMemory(row) : null;
    },

    listMemories: async (filter?: MemoryFilter) => {
      assertConnected(db);
      let sql = 'SELECT * FROM memories WHERE 1=1';
      const params: unknown[] = [];
      if (filter?.tier) { sql += ' AND tier = ?'; params.push(filter.tier); }
      if (filter?.isPinned !== undefined) { sql += ' AND is_pinned = ?'; params.push(int(filter.isPinned)); }
      if (filter?.limit !== undefined) { sql += ' LIMIT ?'; params.push(filter.limit); }
      const rows = db.prepare(sql).all(...params) as Row[];
      let results = rows.map(rowToMemory);
      if (filter?.scopes) {
        const wanted = filter.scopes;
        results = results.filter((m) => {
          const ms = m.scopes ?? {};
          if (wanted.org_id !== undefined && ms.org_id !== wanted.org_id) return false;
          if (wanted.project_id !== undefined && ms.project_id !== wanted.project_id) return false;
          return true;
        });
      }
      return results;
    },

    updateMemory: async (id: string, fields: Partial<Omit<Memory, 'id'>>) => {
      assertConnected(db);
      const existing = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Row | undefined;
      if (!existing) throw new Error(`LibsqlStructuredStore: updateMemory — unknown id ${id}`);
      const merged = { ...rowToMemory(existing), ...fields };
      const row = memoryToRow(merged);
      db.prepare(`
        UPDATE memories SET
          title=@title, summary=@summary, content=@content, tags=@tags,
          priority=@priority, tier=@tier, decay_score=@decay_score,
          access_count=@access_count, last_accessed_at=@last_accessed_at,
          is_pinned=@is_pinned, content_hash=@content_hash, source=@source,
          status=@status, is_latest=@is_latest, superseded_by=@superseded_by, scopes=@scopes
        WHERE id=@id
      `).run(row);
    },

    markMemorySuperseded: async (oldMemoryId: string, newMemoryId: string) => {
      assertConnected(db);
      const info = db.prepare(
        'UPDATE memories SET is_latest=0, superseded_by=? WHERE id=?',
      ).run(newMemoryId, oldMemoryId);
      if ((info as { changes: number }).changes === 0) {
        throw new Error(`LibsqlStructuredStore: markMemorySuperseded — unknown id ${oldMemoryId}`);
      }
    },

    deleteMemory: async (id: string) => {
      assertConnected(db);
      db.prepare('DELETE FROM memories WHERE id=?').run(id);
      db.prepare('DELETE FROM chunks WHERE memory_id=?').run(id);
    },

    // ── Chunk ─────────────────────────────────────────────────────────────

    storeChunks: async (chunks: Chunk[]) => {
      assertConnected(db);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO chunks (id, memory_id, text, vector_id, layer)
        VALUES (@id, @memory_id, @text, @vector_id, @layer)
      `);
      for (const chunk of chunks) {
        stmt.run({
          id: chunk.id,
          memory_id: chunk.memoryId,
          text: chunk.text,
          vector_id: chunk.vectorId ?? null,
          layer: chunk.layer,
        });
      }
    },

    getChunksForMemory: async (memoryId: string) => {
      assertConnected(db);
      const rows = db.prepare('SELECT * FROM chunks WHERE memory_id=?').all(memoryId) as Row[];
      return rows.map(rowToChunk);
    },

    // ── Entity ────────────────────────────────────────────────────────────

    upsertEntity: async (entity: Entity) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO entities (id, name, type, mention_count, scopes)
        VALUES (@id, @name, @type, @mention_count, @scopes)
      `).run({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        mention_count: entity.mentionCount,
        scopes: entity.scopes ? j(entity.scopes) : null,
      });
    },

    getEntity: async (id: string) => {
      assertConnected(db);
      const row = db.prepare('SELECT * FROM entities WHERE id=?').get(id) as Row | undefined;
      return row ? rowToEntity(row) : null;
    },

    deleteEntity: async (id: string) => {
      assertConnected(db);
      db.prepare('DELETE FROM entities WHERE id=?').run(id);
    },

    // ── Edge ──────────────────────────────────────────────────────────────

    storeEdge: async (edge: Edge) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO edges
          (id, from_type, from_id, to_type, to_id, relation, confidence,
           shared_tags, rationale, method, created_at, last_verified_at)
        VALUES
          (@id, @from_type, @from_id, @to_type, @to_id, @relation, @confidence,
           @shared_tags, @rationale, @method, @created_at, @last_verified_at)
      `).run({
        id: edge.id,
        from_type: edge.from.type,
        from_id: edge.from.id,
        to_type: edge.to.type,
        to_id: edge.to.id,
        relation: edge.relation,
        confidence: edge.confidence,
        shared_tags: j(edge.sharedTags),
        rationale: edge.rationale ?? null,
        method: edge.method,
        created_at: edge.createdAt,
        last_verified_at: edge.lastVerifiedAt ?? null,
      });
    },

    getNeighbors: async (node: NodeRef, _hops?: number) => {
      assertConnected(db);
      const rows = db.prepare(`
        SELECT from_type, from_id, to_type, to_id FROM edges
        WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?)
      `).all(node.type, node.id, node.type, node.id) as Row[];
      const out: NodeRef[] = [];
      for (const row of rows) {
        if (row.from_type === node.type && row.from_id === node.id) {
          out.push({ type: row.to_type as NodeRef['type'], id: row.to_id as string });
        } else {
          out.push({ type: row.from_type as NodeRef['type'], id: row.from_id as string });
        }
      }
      return out;
    },

    // ── Fact ──────────────────────────────────────────────────────────────

    storeFact: async (fact: Fact) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO facts
          (id, fact, entity, attribute, value, confidence, source_type,
           created_at, last_reinforced_at, expires_at, is_latest, superseded_by,
           surprisal_score, scopes)
        VALUES
          (@id, @fact, @entity, @attribute, @value, @confidence, @source_type,
           @created_at, @last_reinforced_at, @expires_at, @is_latest, @superseded_by,
           @surprisal_score, @scopes)
      `).run({
        id: fact.id,
        fact: fact.fact,
        entity: fact.entity,
        attribute: fact.attribute ?? null,
        value: fact.value ?? null,
        confidence: fact.confidence,
        source_type: fact.sourceType,
        created_at: fact.createdAt,
        last_reinforced_at: fact.lastReinforcedAt ?? null,
        expires_at: fact.expiresAt ?? null,
        is_latest: int(fact.isLatest),
        superseded_by: fact.supersededBy ?? null,
        surprisal_score: fact.surprisalScore ?? null,
        scopes: fact.scopes ? j(fact.scopes) : null,
      });
    },

    getFactsForEntity: async (
      entity: string,
      attribute?: string,
      asOf?: string,
    ) => {
      assertConnected(db);
      let sql = 'SELECT * FROM facts WHERE entity=?';
      const params: unknown[] = [entity];
      if (attribute !== undefined) {
        sql += ' AND attribute=?';
        params.push(attribute);
      }
      if (asOf !== undefined) {
        sql += ' AND (expires_at IS NULL OR expires_at > ?)';
        params.push(asOf);
      }
      const rows = db.prepare(sql).all(...params) as Row[];
      return rows.map(rowToFact);
    },

    markFactSuperseded: async (oldFactId: string, newFactId: string) => {
      assertConnected(db);
      const info = db.prepare(
        'UPDATE facts SET is_latest=0, superseded_by=? WHERE id=?',
      ).run(newFactId, oldFactId);
      if ((info as { changes: number }).changes === 0) {
        throw new Error(`LibsqlStructuredStore: markFactSuperseded — unknown id ${oldFactId}`);
      }
    },

    // ── Fulltext ──────────────────────────────────────────────────────────

    searchFulltext: async (
      query: string,
      opts?: FulltextSearchOpts,
    ): Promise<FulltextMatch[]> => {
      assertConnected(db);
      const built = buildFtsQuery(query);
      if (!built) return [];
      const { ftsQuery, tokens } = built;
      const topK = opts?.topK ?? 50;
      const selectedFields = (opts?.fields ?? FTS_FIELDS) as readonly FulltextField[];

      // Build a join against memories for tier + scope filters. FTS5
      // matching stays purely on the virtual table.
      const where: string[] = ['memories_fts MATCH ?'];
      const params: unknown[] = [ftsQuery];
      if (opts?.tier) {
        where.push('m.tier = ?');
        params.push(opts.tier);
      }
      const sql = `
        SELECT f.memory_id AS memory_id,
               f.title    AS title,
               f.summary  AS summary,
               f.content  AS content,
               f.tags     AS tags,
               f.rank     AS rank,
               m.scopes   AS scopes
        FROM memories_fts f
        JOIN memories m ON m.id = f.memory_id
        WHERE ${where.join(' AND ')}
        ORDER BY f.rank
        LIMIT ?
      `;
      params.push(topK);
      const rows = db.prepare(sql).all(...params) as Row[];

      // Scope filter (JSON comparison can't be pushed into SQL portably).
      let filteredRows = rows;
      if (opts?.scopes) {
        const wanted = opts.scopes;
        filteredRows = rows.filter((row) => {
          if (!row.scopes) return false;
          const ms = p<Record<string, unknown>>(row.scopes as string) ?? {};
          if (wanted.org_id !== undefined && ms.org_id !== wanted.org_id) return false;
          if (wanted.project_id !== undefined && ms.project_id !== wanted.project_id) return false;
          return true;
        });
      }

      return filteredRows.map<FulltextMatch>((row) => ({
        memoryId: row.memory_id as string,
        score: normalizeRank(row.rank as number),
        matchedFields: detectMatchedFields(row, tokens, selectedFields),
      }));
    },

    // ── Contradiction ─────────────────────────────────────────────────────

    storeContradiction: async (contradiction: Contradiction) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO contradictions
          (id, fact_a_id, fact_b_id, status, rationale, resolution, created_at)
        VALUES (@id, @fact_a_id, @fact_b_id, @status, @rationale, @resolution, @created_at)
      `).run({
        id: contradiction.id,
        fact_a_id: contradiction.factAId,
        fact_b_id: contradiction.factBId,
        status: contradiction.status,
        rationale: contradiction.rationale ?? null,
        resolution: contradiction.resolution ?? null,
        created_at: contradiction.createdAt,
      });
    },

    listContradictions: async (status?: Contradiction['status']) => {
      assertConnected(db);
      if (status !== undefined) {
        const rows = db.prepare(
          'SELECT * FROM contradictions WHERE status=?',
        ).all(status) as Row[];
        return rows.map(rowToContradiction);
      }
      const rows = db.prepare('SELECT * FROM contradictions').all() as Row[];
      return rows.map(rowToContradiction);
    },

    // ── Insight ───────────────────────────────────────────────────────────

    storeInsight: async (insight: Insight) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO insights
          (id, entity_id, type, statement, supporting_fact_ids, confidence, created_at)
        VALUES (@id, @entity_id, @type, @statement, @supporting_fact_ids, @confidence, @created_at)
      `).run({
        id: insight.id,
        entity_id: insight.entityId ?? null,
        type: insight.type,
        statement: insight.statement,
        supporting_fact_ids: j(insight.supportingFactIds),
        confidence: insight.confidence,
        created_at: insight.createdAt,
      });
    },

    listInsights: async (entityId?: string) => {
      assertConnected(db);
      if (entityId !== undefined) {
        const rows = db.prepare(
          'SELECT * FROM insights WHERE entity_id=?',
        ).all(entityId) as Row[];
        return rows.map(rowToInsight);
      }
      const rows = db.prepare('SELECT * FROM insights').all() as Row[];
      return rows.map(rowToInsight);
    },

    // ── EntityProfile ─────────────────────────────────────────────────────

    storeEntityProfile: async (profile: EntityProfile) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO entity_profiles
          (id, entity_id, static_facts, dynamic_context, narrative_prose, related_entity_ids)
        VALUES (@id, @entity_id, @static_facts, @dynamic_context, @narrative_prose, @related_entity_ids)
      `).run({
        id: profile.id,
        entity_id: profile.entityId,
        static_facts: j(profile.staticFacts),
        dynamic_context: profile.dynamicContext,
        narrative_prose: profile.narrativeProse ?? null,
        related_entity_ids: j(profile.relatedEntityIds),
      });
    },

    getEntityProfile: async (entityId: string) => {
      assertConnected(db);
      const row = db.prepare(
        'SELECT * FROM entity_profiles WHERE entity_id=?',
      ).get(entityId) as Row | undefined;
      return row ? rowToEntityProfile(row) : null;
    },

    // ── AgentSelf ─────────────────────────────────────────────────────────

    getAgentSelf: async () => {
      assertConnected(db);
      const row = db.prepare("SELECT * FROM agent_self WHERE id='self'").get() as Row | undefined;
      if (!row) return null;
      return {
        memoryBlocks: p(row.memory_blocks as string),
        history: p(row.history as string),
      } satisfies AgentSelf;
    },

    updateAgentSelf: async (self: AgentSelf) => {
      assertConnected(db);
      db.prepare(`
        INSERT OR REPLACE INTO agent_self (id, memory_blocks, history)
        VALUES ('self', @memory_blocks, @history)
      `).run({
        memory_blocks: j(self.memoryBlocks),
        history: j(self.history),
      });
    },
  };
}
