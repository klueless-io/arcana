import { describe, it, expect } from 'vitest';
import {
  InsightSchema,
  EntityProfileSchema,
  type Insight,
  type EntityProfile,
} from './insight.js';

describe('InsightSchema', () => {
  it('round-trips a valid deduction insight', () => {
    const sample: Insight = {
      id: 'ins_1',
      entityId: 'ent_1',
      type: 'deduction',
      statement: 'David books meetings on Tuesdays',
      supportingFactIds: ['fact_1', 'fact_2'],
      confidence: 0.75,
      createdAt: '2026-05-18T08:00:00.000Z',
    };
    expect(InsightSchema.parse(sample)).toEqual(sample);
  });

  it('rejects an unknown insight type', () => {
    expect(() =>
      InsightSchema.parse({
        id: 'ins_2',
        type: 'speculation',
        statement: 'maybe',
        supportingFactIds: [],
        confidence: 0.5,
        createdAt: '2026-05-18T08:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('EntityProfileSchema', () => {
  it('round-trips a valid EntityProfile', () => {
    const sample: EntityProfile = {
      id: 'prof_1',
      entityId: 'ent_1',
      staticFacts: ['name=Anthropic', 'type=company'],
      dynamicContext: 'Recent work: Claude Opus 4.7 release',
      narrativeProse: 'Anthropic is an AI safety company.',
      relatedEntityIds: ['ent_2', 'ent_3'],
    };
    expect(EntityProfileSchema.parse(sample)).toEqual(sample);
  });
});
