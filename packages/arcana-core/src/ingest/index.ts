import type {
  Memory,
  Scopes,
  StructuredStore,
  VectorStore,
  EmbeddingProvider,
  LLMProvider,
  Logger,
} from '@kybernesisai/arcana-contracts';
import { NotImplementedError } from '../errors.js';

export interface StoreMemoryInput {
  content: string;
  title?: string;
  summary?: string;
  tags?: string[];
  source: Memory['source'];
  scopes?: Scopes;
}

export interface IngestDocumentInput {
  format: 'markdown' | 'pdf' | 'docx' | 'csv' | 'html' | 'plain';
  content: string | Uint8Array;
  filename?: string;
  scopes?: Scopes;
}

export interface IngestDeps {
  structured: StructuredStore;
  vector: VectorStore;
  embed: EmbeddingProvider;
  llm: LLMProvider;
  logger: Logger;
}

export interface IngestApi {
  /** Persist a memory and trigger downstream extraction. Returns the new memory id. */
  storeMemory(input: StoreMemoryInput): Promise<string>;
  /** Convert + chunk + ingest a document. Returns the new memory id. */
  ingestDocument(input: IngestDocumentInput): Promise<string>;
}

export function createIngest(_deps: IngestDeps): IngestApi {
  return {
    storeMemory: async () => {
      throw new NotImplementedError(
        'arcana-core/ingest.storeMemory is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
    ingestDocument: async () => {
      throw new NotImplementedError(
        'arcana-core/ingest.ingestDocument is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
  };
}
