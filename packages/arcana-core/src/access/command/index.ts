import type {
  Tier,
  NodeRef,
  StructuredStore,
  VectorStore,
  Logger,
} from '@kybernesisai/arcana-contracts';
import { NotImplementedError } from '../../errors.js';

export interface RecordFactInput {
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
  sourceType: 'terminal' | 'chat' | 'ai-extraction' | 'upload' | 'connector';
}

export interface CommandDeps {
  structured: StructuredStore;
  vector: VectorStore;
  logger: Logger;
}

export interface CommandApi {
  /** Record a fact (without going through full ingest). */
  recordFact(input: RecordFactInput): Promise<string>;
  /** Supersede an existing fact with a new value. */
  correctFact(oldFactId: string, newValue: string): Promise<string>;
  /** Manually create a typed edge between two nodes. */
  linkMemories(from: NodeRef, to: NodeRef, relation: string): Promise<string>;
  /** Pin a memory so decay/tier transitions skip it. */
  pin(memoryId: string): Promise<void>;
  /** Force-move a memory to a specific tier. */
  moveToTier(memoryId: string, tier: Tier): Promise<void>;
  /** Permanently delete a memory and its associated chunks/edges/facts. */
  deleteMemory(id: string): Promise<void>;
  /** Update one of the agent's own memory blocks. */
  updateBlock(label: string, content: string, changedBy?: string): Promise<void>;
}

export function createCommand(_deps: CommandDeps): CommandApi {
  const stub = (method: string): never => {
    throw new NotImplementedError(
      `arcana-core/access.command.${method} is a v0.1 scaffold stub; real implementation lands in v0.x`,
    );
  };

  return {
    recordFact: async () => stub('recordFact'),
    correctFact: async () => stub('correctFact'),
    linkMemories: async () => stub('linkMemories'),
    pin: async () => stub('pin'),
    moveToTier: async () => stub('moveToTier'),
    deleteMemory: async () => stub('deleteMemory'),
    updateBlock: async () => stub('updateBlock'),
  };
}
