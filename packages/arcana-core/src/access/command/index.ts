import { randomUUID } from 'node:crypto';
import {
  FactSchema,
  type Fact,
  type Tier,
  type NodeRef,
  type Entity,
  type Edge,
  type Scopes,
  type FactSourceType,
  type StructuredStore,
  type VectorStore,
  type Logger,
} from '@kybernesisai/arcana-contracts';
import { NotImplementedError } from '../../errors.js';

/**
 * Input for `command.recordFact`. Mirrors the corrected `Fact` schema:
 * - `fact` (sentence form) and `entity` (subject) are required.
 * - `attribute` and `value` (triple decomposition) are optional and only
 *   populated when the upstream extractor produced them.
 *
 * See ADR 004 for the rationale.
 */
export interface RecordFactInput {
  fact: string;
  entity: string;
  attribute?: string;
  value?: string;
  confidence: number;
  sourceType: FactSourceType;
  expiresAt?: string;
  scopes?: Scopes;
}

export interface LinkNodesOptions {
  /** 0..1 confidence in the relation. Defaults to 1.0. */
  confidence?: number;
  /** Tags shared between the two nodes (drives some retrieval scoring). */
  sharedTags?: string[];
  /** How this edge was produced (jaccard | llm-derived | manual | consumer-mirror | ...). Defaults to 'consumer-mirror'. */
  method?: string;
  /** Optional human-readable justification. */
  rationale?: string;
}

export interface CommandDeps {
  structured: StructuredStore;
  vector: VectorStore;
  logger: Logger;
}

export interface CommandApi {
  /** Upsert an entity (insert or replace by id). */
  upsertEntity(entity: Entity): Promise<void>;
  /** Delete an entity by id. */
  deleteEntity(id: string): Promise<void>;
  /**
   * Record a fact. `fact` (sentence form) and `entity` are required;
   * `attribute`/`value` triple decomposition is optional.
   *
   * v0.x scope: validates + persists the Fact with defaults
   * (`id = randomUUID()`, `createdAt = now`, `isLatest = true`). Does NOT
   * auto-supersede existing facts with matching (entity, attribute) — that
   * comes later (sleep pipeline). Returns the new fact id.
   */
  recordFact(input: RecordFactInput): Promise<string>;
  /** Supersede an existing fact with a new value. */
  correctFact(oldFactId: string, newValue: string): Promise<string>;
  /**
   * Create a typed edge between two nodes (memory↔memory, memory↔entity,
   * or entity↔entity). Returns the edge id.
   */
  linkNodes(
    from: NodeRef,
    to: NodeRef,
    relation: string,
    opts?: LinkNodesOptions,
  ): Promise<string>;
  /** Pin a memory so decay/tier transitions skip it. */
  pin(memoryId: string): Promise<void>;
  /** Force-move a memory to a specific tier. */
  moveToTier(memoryId: string, tier: Tier): Promise<void>;
  /** Permanently delete a memory and its associated chunks/edges/facts. */
  deleteMemory(id: string): Promise<void>;
  /** Update one of the agent's own memory blocks. */
  updateBlock(label: string, content: string, changedBy?: string): Promise<void>;
}

export function createCommand(deps: CommandDeps): CommandApi {
  const stub = (method: string): never => {
    throw new NotImplementedError(
      `arcana-core/access.command.${method} is a v0.1 scaffold stub; real implementation lands in v0.x`,
    );
  };

  return {
    upsertEntity: async (entity: Entity) => {
      await deps.structured.upsertEntity(entity);
      deps.logger.debug('arcana.command.upsertEntity', {
        id: entity.id,
        name: entity.name,
      });
    },

    deleteEntity: async (id: string) => {
      await deps.structured.deleteEntity(id);
      deps.logger.debug('arcana.command.deleteEntity', { id });
    },

    recordFact: async (input: RecordFactInput): Promise<string> => {
      const candidate: Fact = {
        id: randomUUID(),
        fact: input.fact,
        entity: input.entity,
        attribute: input.attribute,
        value: input.value,
        confidence: input.confidence,
        sourceType: input.sourceType,
        createdAt: new Date().toISOString(),
        isLatest: true,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
      };
      const validated = FactSchema.parse(candidate);
      await deps.structured.storeFact(validated);
      deps.logger.debug('arcana.command.recordFact', {
        id: validated.id,
        entity: validated.entity,
        hasTripleDecomposition:
          validated.attribute !== undefined && validated.value !== undefined,
      });
      return validated.id;
    },

    linkNodes: async (
      from: NodeRef,
      to: NodeRef,
      relation: string,
      opts?: LinkNodesOptions,
    ): Promise<string> => {
      const edge: Edge = {
        id: randomUUID(),
        from,
        to,
        relation,
        confidence: opts?.confidence ?? 1.0,
        sharedTags: opts?.sharedTags ?? [],
        rationale: opts?.rationale,
        method: opts?.method ?? 'consumer-mirror',
        createdAt: new Date().toISOString(),
      };
      await deps.structured.storeEdge(edge);
      deps.logger.debug('arcana.command.linkNodes', {
        id: edge.id,
        relation,
        from: `${from.type}:${from.id}`,
        to: `${to.type}:${to.id}`,
      });
      return edge.id;
    },

    correctFact: async () => stub('correctFact'),
    pin: async () => stub('pin'),
    moveToTier: async () => stub('moveToTier'),
    deleteMemory: async () => stub('deleteMemory'),
    updateBlock: async () => stub('updateBlock'),
  };
}
