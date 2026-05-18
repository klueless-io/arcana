import { describe, it, expect } from 'vitest';
import {
  createMaintain,
  SLEEP_STEPS,
  type MaintainDeps,
} from './index.js';
import { NotImplementedError } from '../errors.js';

const fakeDeps = {} as unknown as MaintainDeps;

describe('SLEEP_STEPS', () => {
  it('locks the 12-step order from arcana-spec.md §10', () => {
    // 13 items because entityHygiene is the periodic-deep-clean step.
    expect(SLEEP_STEPS).toEqual([
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
    ]);
  });
});

describe('createMaintain', () => {
  it('returns an object with the documented API surface', () => {
    const api = createMaintain(fakeDeps);
    expect(typeof api.runSleepPipeline).toBe('function');
    expect(typeof api.startSleepSchedule).toBe('function');
    expect(typeof api.stopSleepSchedule).toBe('function');
  });

  it('every method throws NotImplementedError at v0.1', async () => {
    const api = createMaintain(fakeDeps);
    await expect(api.runSleepPipeline()).rejects.toThrow(NotImplementedError);
    await expect(api.startSleepSchedule(60000)).rejects.toThrow(
      NotImplementedError,
    );
    await expect(api.stopSleepSchedule()).rejects.toThrow(NotImplementedError);
  });
});
