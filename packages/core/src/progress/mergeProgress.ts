/**
 * MergeProgress (Module M0/M4).
 * Pure function seam for non-destructive merging of EpisodeProgressRecord.
 */

import type { EpisodeProgressRecord } from '../db';

export type EpisodeProgressPatch = Partial<Omit<EpisodeProgressRecord, 'episodeId' | 'roundSentenceIdx'>> & {
  episodeId: string;
  roundSentenceIdx?: Partial<NonNullable<EpisodeProgressRecord['roundSentenceIdx']>>;
};

/**
 * Merges an incoming progress patch with an existing record without losing
 * monotonic fields (`roundCompleted` flags, `bestScore` high watermark) or
 * other rounds' saved breakpoints (`roundSentenceIdx`).
 * Stub in M0; full implementation & tests in M4.
 */
export function mergeProgress(
  existing: EpisodeProgressRecord | undefined,
  patch: EpisodeProgressPatch,
  now: number = Date.now()
): EpisodeProgressRecord {
  const prevRounds = existing?.roundCompleted;
  const nextRounds = patch.roundCompleted;

  const roundCompleted = {
    round1: Boolean(prevRounds?.round1 || nextRounds?.round1),
    round2: Boolean(prevRounds?.round2 || nextRounds?.round2),
    round3: Boolean(prevRounds?.round3 || nextRounds?.round3),
    round4: Boolean(prevRounds?.round4 || nextRounds?.round4),
  };

  const prevSentenceIdx = existing?.roundSentenceIdx;
  const nextSentenceIdx = patch.roundSentenceIdx;
  const roundSentenceIdx =
    prevSentenceIdx || nextSentenceIdx
      ? {
          round1: nextSentenceIdx?.round1 ?? prevSentenceIdx?.round1 ?? 0,
          round2: nextSentenceIdx?.round2 ?? prevSentenceIdx?.round2 ?? 0,
          round3: nextSentenceIdx?.round3 ?? prevSentenceIdx?.round3 ?? 0,
          round4: nextSentenceIdx?.round4 ?? prevSentenceIdx?.round4 ?? 0,
        }
      : undefined;

  let bestScore = existing?.bestScore;
  if (patch.bestScore) {
    if (!bestScore || patch.bestScore.score >= bestScore.score) {
      bestScore = patch.bestScore;
    }
  }

  return {
    episodeId: patch.episodeId,
    currentRound: patch.currentRound ?? existing?.currentRound ?? 1,
    currentSentenceIdx: patch.currentSentenceIdx ?? existing?.currentSentenceIdx ?? 0,
    ...(roundSentenceIdx ? { roundSentenceIdx } : {}),
    roundCompleted,
    ...(bestScore ? { bestScore } : {}),
    updatedAt: patch.updatedAt ?? now,
  };
}
