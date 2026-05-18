import { describe, it, expect } from 'vitest';
import {
  FactSchema,
  ContradictionSchema,
  type Fact,
  type Contradiction,
} from './fact.js';

describe('FactSchema (sentence-form + optional triple decomposition)', () => {
  it('round-trips a sentence-only Fact (no attribute/value)', () => {
    const sample: Fact = {
      id: 'fact_1',
      fact: 'John works at Acme as the CTO',
      entity: 'John',
      confidence: 0.85,
      sourceType: 'ai-extraction',
      createdAt: '2026-05-18T08:00:00.000Z',
      isLatest: true,
    };
    expect(FactSchema.parse(sample)).toEqual(sample);
  });

  it('round-trips a Fact with full triple decomposition', () => {
    const sample: Fact = {
      id: 'fact_2',
      fact: 'David lives in Sydney',
      entity: 'David',
      attribute: 'location',
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
      id: 'fact_3',
      fact: 'David is a senior engineer at Anthropic',
      entity: 'David',
      attribute: 'role',
      value: 'senior engineer',
      confidence: 0.8,
      sourceType: 'ai-extraction',
      createdAt: '2026-05-18T08:00:00.000Z',
      lastReinforcedAt: '2026-05-18T10:00:00.000Z',
      expiresAt: '2027-05-18T00:00:00.000Z',
      isLatest: false,
      supersededBy: 'fact_4',
      surprisalScore: 0.3,
      scopes: { org_id: 'org_1', project_id: 'proj_1' },
    };
    expect(FactSchema.parse(sample)).toEqual(sample);
  });

  it('requires fact (sentence form)', () => {
    expect(() =>
      FactSchema.parse({
        id: 'f',
        entity: 'David',
        confidence: 0.9,
        sourceType: 'chat',
        createdAt: '2026-05-18T08:00:00.000Z',
        isLatest: true,
      }),
    ).toThrow();
  });

  it('requires entity', () => {
    expect(() =>
      FactSchema.parse({
        id: 'f',
        fact: 'David lives in Sydney',
        confidence: 0.9,
        sourceType: 'chat',
        createdAt: '2026-05-18T08:00:00.000Z',
        isLatest: true,
      }),
    ).toThrow();
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
