import type {
  StructuredStore,
  VectorStore,
  EmbeddingProvider,
  LLMProvider,
  Scheduler,
  JobQueue,
  Logger,
  Scopes,
} from '@kybernesis/arcana-contracts';
import { NotImplementedError } from '../errors.js';

/**
 * The 13-step sleep pipeline per arcana-spec.md §10.
 *
 * Order is locked. Each step is idempotent and resumable via a checkpoint.
 *
 * KyberBot's 9-step pipeline does not cleanly overlap with this list — see
 * docs/decisions/010-sleep-pipeline-step-reconciliation.md for the
 * `consolidate` and `observe` gaps and the deferred design decision.
 */
export const SLEEP_STEPS = [
  'collectCandidates',
  'ingestionValidation',
  'decayFactConfidence',
  'tag',
  'extractFacts',
  'detectContradictions',
  'computeSurprisal',
  'reason',
  'buildEntityProfiles',
  'link',
  'tier',
  'summarize',
  'entityHygiene',
] as const;

export type SleepStep = (typeof SLEEP_STEPS)[number];

export interface SleepRunInput {
  scopes?: Scopes;
  steps?: SleepStep[];
  /** If true, resumes from the latest checkpoint instead of starting fresh. */
  resume?: boolean;
}

export interface SleepRunResult {
  startedAt: string;
  finishedAt: string;
  stepsRun: SleepStep[];
  candidatesProcessed: number;
}

export interface MaintainDeps {
  structured: StructuredStore;
  vector: VectorStore;
  embed: EmbeddingProvider;
  llm: LLMProvider;
  scheduler: Scheduler;
  queue: JobQueue;
  logger: Logger;
}

export interface MaintainApi {
  /** Run one pass of the sleep pipeline. Returns a run summary. */
  runSleepPipeline(input?: SleepRunInput): Promise<SleepRunResult>;
  /** Schedule the sleep pipeline to run on an interval. */
  startSleepSchedule(intervalMs: number): Promise<void>;
  /** Stop the scheduled pipeline. */
  stopSleepSchedule(): Promise<void>;
}

export function createMaintain(_deps: MaintainDeps): MaintainApi {
  return {
    runSleepPipeline: async () => {
      throw new NotImplementedError(
        'arcana-core/maintain.runSleepPipeline is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
    startSleepSchedule: async () => {
      throw new NotImplementedError(
        'arcana-core/maintain.startSleepSchedule is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
    stopSleepSchedule: async () => {
      throw new NotImplementedError(
        'arcana-core/maintain.stopSleepSchedule is a v0.1 scaffold stub; real implementation lands in v0.x',
      );
    },
  };
}
