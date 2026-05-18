import { describe, it, expect } from 'vitest';
import {
  FactSchema,
  ContradictionSchema,
  type Fact,
  type Contradiction,
} from './fact.js';

describe('FactSchema', () => {
  it('round-trips a valid Fact', () => {
    const sample: Fact = {
      id: 'fact_1',
      entity: 'David',
      attribute: 'lives_in',
      value: 'Sydney',
      confidence: 0.95,
      sourceType: 'chat',
      createdAt: '2026-05-18T08:00:00.000Z',
      isLatest: true,
    };
    expect(FactSchema.parse(sample)).toEqual(sample);
  });

  it('round-trips a Fact with full optional fields', () => {
    const sample: Fact = {
      id: 'fact_2',
      entity: 'David',
      attribute: 'role',
      value: 'engineer',
      confidence: 0.8,
      sourceType: 'ai-extraction',
      createdAt: '2026-05-18T08:00:00.000Z',
      lastReinforcedAt: '2026-05-18T10:00:00.000Z',
      expiresAt: '2027-05-18T00:00:00.000Z',
      isLatest: false,
      supersededBy: 'fact_3',
      surprisalScore: 0.3,
      scopes: { org_id: 'org_1', project_id: 'proj_1' },
    };
    expect(FactSchema.parse(sample)).toEqual(sample);
  });
});

describe('ContradictionSchema', () => {
  it('round-trips a valid Contradiction', () => {
    const sample: Contradiction = {
      id: 'cont_1',
      factAId: 'fact_1',
      factBId: 'fact_2',
      status: 'pending',
      createdAt: '2026-05-18T08:00:00.000Z',
    };
    expect(ContradictionSchema.parse(sample)).toEqual(sample);
  });
});
