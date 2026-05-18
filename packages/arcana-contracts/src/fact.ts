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

export const FactSchema = z
  .object({
    id: z.string().min(1),
    entity: z.string().min(1),
    attribute: z.string().min(1),
    value: z.string(),
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

export const ContradictionSchema = z
  .object({
    id: z.string().min(1),
    factAId: z.string().min(1),
    factBId: z.string().min(1),
    status: ContradictionStatusSchema,
    resolution: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Contradiction = z.infer<typeof ContradictionSchema>;
