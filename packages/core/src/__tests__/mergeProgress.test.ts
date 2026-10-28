import { describe, it, expect } from 'vitest';
import { mergeProgress } from '../progress/mergeProgress';
import type { EpisodeProgressRecord } from '../db';

describe('mergeProgress (Module M4)', () => {
  it('TC-M4-01: creates a valid record when existing is undefined', () => {
    const merged = mergeProgress(
      undefined,
      {
        episodeId: 'slow-english-ep-01',
        currentRound: 1,
        currentSentenceIdx: 3,
      },
      1000
    );

    expect(merged).toEqual({
      episodeId: 'slow-english-ep-01',
      currentRound: 1,
      currentSentenceIdx: 3,
      roundCompleted: {
        round1: false,
        round2: false,
        round3: false,
        round4: false,
      },
      updatedAt: 1000,
    });
  });

  it('TC-M4-02: preserves bestScore and completed rounds when partial progress patch is saved', () => {
    const existing: EpisodeProgressRecord = {
      episodeId: 'slow-english-ep-01',
      currentRound: 4,
      currentSentenceIdx: 20,
      roundCompleted: {
        round1: true,
        round2: true,
        round3: true,
        round4: true,
      },
      bestScore: {
        score: 92,
        accuracy: 0.96,
        wpm: 40,
        stars: 2,
        achievedAt: 500,
      },
      updatedAt: 600,
    };

    // User replays Round 1 from sentence 0 (with stale roundCompleted flags)
    const merged = mergeProgress(
      existing,
      {
        episodeId: 'slow-english-ep-01',
        currentRound: 1,
        currentSentenceIdx: 0,
        roundCompleted: {
          round1: false,
          round2: false,
          round3: false,
          round4: false,
        },
      },
      2000
    );

    expect(merged.roundCompleted).toEqual({
      round1: true,
      round2: true,
      round3: true,
      round4: true,
    });
    expect(merged.bestScore).toEqual(existing.bestScore);
    expect(merged.currentRound).toBe(1);
    expect(merged.currentSentenceIdx).toBe(0);
    expect(merged.updatedAt).toBe(2000);
  });

  it('TC-M4-03: updates bestScore only when incoming score is >= existing bestScore.score', () => {
    const existing: EpisodeProgressRecord = {
      episodeId: 'slow-english-ep-01',
      currentRound: 4,
      currentSentenceIdx: 10,
      roundCompleted: {
        round1: true,
        round2: true,
        round3: true,
        round4: true,
      },
      bestScore: {
        score: 90,
        accuracy: 0.95,
        wpm: 38,
        stars: 2,
        achievedAt: 1000,
      },
      updatedAt: 1000,
    };

    // Lower score (82) should not overwrite 90
    const afterLower = mergeProgress(existing, {
      episodeId: 'slow-english-ep-01',
      bestScore: {
        score: 82,
        accuracy: 0.88,
        wpm: 32,
        stars: 1,
        achievedAt: 2000,
      },
    });
    expect(afterLower.bestScore?.score).toBe(90);
    expect(afterLower.bestScore?.stars).toBe(2);

    // Higher score (97) should overwrite 90
    const afterHigher = mergeProgress(existing, {
      episodeId: 'slow-english-ep-01',
      bestScore: {
        score: 97,
        accuracy: 0.99,
        wpm: 45,
        stars: 3,
        achievedAt: 3000,
      },
    });
    expect(afterHigher.bestScore?.score).toBe(97);
    expect(afterHigher.bestScore?.stars).toBe(3);
  });

  it('TC-M4-04: merges roundSentenceIdx per round without overwriting other rounds', () => {
    const existing: EpisodeProgressRecord = {
      episodeId: 'slow-english-ep-01',
      currentRound: 3,
      currentSentenceIdx: 39,
      roundSentenceIdx: {
        round1: 0,
        round2: 0,
        round3: 39,
        round4: 0,
      },
      roundCompleted: {
        round1: true,
        round2: true,
        round3: false,
        round4: false,
      },
      updatedAt: 1000,
    };

    const merged = mergeProgress(
      existing,
      {
        episodeId: 'slow-english-ep-01',
        currentRound: 1,
        currentSentenceIdx: 14,
        roundSentenceIdx: {
          round1: 14,
        },
      },
      2000
    );

    expect(merged.roundSentenceIdx).toEqual({
      round1: 14,
      round2: 0,
      round3: 39,
      round4: 0,
    });
    expect(merged.currentRound).toBe(1);
    expect(merged.currentSentenceIdx).toBe(14);
  });
});
