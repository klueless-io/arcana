import { z } from 'zod';
import { ScopesSchema } from './scopes.js';

export const FactSourceTypeSchema = z.enum([
  'terminal',
  'chat',
  'ai-extraction',
  'upload',
  'connector',
]);
export type FactSourceType = z.infer<typeof FactSourceTypeSchema>;

/**
 * A Fact is an entity-attributed assertion. The `fact` field carries the
 * sentence form (always required). The optional `attribute` / `value` fields
 * carry a triple decomposition when the extractor was able to produce one.
 *
 * Shape rationale (see ADR 004):
 *   - Both real-world consumers (KyberBot's Haiku extractor, Kybernesis
 *     Brain's GPT-4o-mini extractor) produce facts as sentences with an
 *     identified subject entity.
 *   - Only some extractors (Kybernesis Brain's) additionally decompose into
 *     a (attribute, value) predicate-object pair.
 *   - Making attribute/value optional fits both consumers without forcing
 *     KyberBot to fabricate triple decomposition it doesn't produce.
 *
 * Even sentence-form facts (no triple decomposition) provide queryable
 * value that Memories don't: per-entity lookup, supersession lifecycle,
 * contradiction detection.
 */
export const FactSchema = z
  .object({
    id: z.string().min(1),
    fact: z.string().min(1),
    entity: z.string().min(1),
    attribute: z.string().optional(),
    value: z.string().optional(),
    confidence: z.number().min(0).max(1),
    sourceType: FactSourceTypeSchema,
    createdAt: z.string().datetime(),
    lastReinforcedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    isLatest: z.boolean(),
    supersededBy: z.string().optional(),
    surprisalScore: z.number().min(0).max(1).optional(),
    scopes: ScopesSchema.optional(),
  })
  .strict();

export type Fact = z.infer<typeof FactSchema>;

export const ContradictionStatusSchema = z.enum([
  'pending',
  'auto-resolved',
  'user-resolved',
]);
export type ContradictionStatus = z.infer<typeof ContradictionStatusSchema>;

/**
 * Contradiction shape rationale (see ADR 006):
 * - `rationale` (optional) captures WHY the contradiction was flagged —
 *   typically the LLM-extracted explanation. Distinct from `resolution`:
 *     - `rationale` = why detected (input, set at create time)
 *     - `resolution` = how resolved (output, set when status transitions)
 *   They are separate axes; conflating them would lose signal.
 */
export const ContradictionSchema = z
  .object({
    id: z.string().min(1),
    factAId: z.string().min(1),
    factBId: z.string().min(1),
    status: ContradictionStatusSchema,
    rationale: z.string().optional(),
    resolution: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Contradiction = z.infer<typeof ContradictionSchema>;
