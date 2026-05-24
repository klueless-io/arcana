/**
 * Tag Step — ported from KB sleep/steps/tag.ts per ADR 011.
 *
 * Refreshes stale or missing tags using the LLM. Gates enrichment on the
 * `lastEnriched` field (KB memories.last_enriched), NOT on tags.length or
 * createdAt — that earlier proxy silently skipped any memory that arrived
 * with pre-populated tags from a mirror write (KBOT H3 Bug 4).
 *
 *  - Candidate set: memories where lastEnriched IS NULL OR lastEnriched < staleCutoff
 *  - LLM generates 3-7 new tags
 *  - Merged with existing tags (deduplication, lowercase)
 *  - Limited to maxTagsPerRun to control LLM costs
 *  - On successful tag write, stamp lastEnriched = now
 *
 * Adapter note: KB uses getClaudeClient() directly. Cortex uses deps.llm.
 */

import type { MaintainDeps } from '../index.js';
import type { SleepConfig } from '../config.js';

export interface TagResult {
  count: number;
  errors?: string[];
}

const TAG_PROMPT = `Generate 3-7 relevant tags for this content. Return only a JSON array of lowercase strings, no explanation.

Content:
{content}

Example response: ["meeting", "pricing", "strategy", "planning"]`;

export async function runRefreshTags(
  deps: MaintainDeps,
  config: SleepConfig,
): Promise<TagResult> {
  if (!config.enableTagging) return { count: 0 };

  const staleMs = config.tagStaleDays * 24 * 60 * 60 * 1000;
  const staleCutoff = new Date(Date.now() - staleMs);

  const candidates = await deps.structured.listMemories({
    limit: config.maxTagsPerRun * 3,
  });

  // KB tag.ts gate: lastEnriched IS NULL OR lastEnriched < staleCutoff.
  // Mirror writes leave lastEnriched null so they're picked up on the first
  // sleep cycle.
  const stale = candidates
    .filter(
      (m) =>
        m.lastEnriched === undefined ||
        m.lastEnriched === null ||
        new Date(m.lastEnriched) < staleCutoff,
    )
    .slice(0, config.maxTagsPerRun);

  if (stale.length === 0) return { count: 0 };

  let tagged = 0;
  const errors: string[] = [];

  for (const memory of stale) {
    const content = [memory.title, memory.summary]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 3000);

    if (content.length < 50) continue;

    try {
      const response = await deps.llm.complete(
        TAG_PROMPT.replace('{content}', content),
        { maxTokens: 200 },
      );

      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) continue;

      const newTags: string[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(newTags) || newTags.length === 0) continue;

      const merged = [
        ...new Set([
          ...memory.tags.map((t) => t.toLowerCase()),
          ...newTags.map((t: string) => t.toLowerCase()),
        ]),
      ];

      await deps.structured.updateMemory(memory.id, {
        tags: merged,
        lastEnriched: new Date().toISOString(),
      });
      tagged++;
    } catch (err) {
      errors.push(`tag failed for ${memory.id}: ${err}`);
    }
  }

  return { count: tagged, errors: errors.length > 0 ? errors : undefined };
}
