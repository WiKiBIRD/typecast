/**
 * Tests for AcousticStorage persistence layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AcousticStorage } from '../scheduler/AcousticStorage';
import type { FSRSItemState, LatencyTrajectoryPoint } from '../scheduler/types';

describe('AcousticStorage', () => {
  let storage: AcousticStorage;

  beforeEach(async () => {
    storage = new AcousticStorage();
    await storage.clear();
  });

  it('saves and loads FSRS item states', async () => {
    const mockStates: Record<string, FSRSItemState> = {
      LINKING: {
        phenomenon: 'LINKING',
        difficulty: 4.5,
        stability: 2.3,
        lastReviewedAt: 1700000000000,
        reviewCount: 3,
        retrievability: 0.92,
      },
      REDUCTION: {
        phenomenon: 'REDUCTION',
        difficulty: 6.2,
        stability: 1.1,
        lastReviewedAt: 1700000000000,
        reviewCount: 2,
        retrievability: 0.85,
      },
      ELISION: {
        phenomenon: 'ELISION',
        difficulty: 5.0,
        stability: 1.0,
        lastReviewedAt: 1700000000000,
        reviewCount: 1,
      },
      ASSIMILATION: {
        phenomenon: 'ASSIMILATION',
        difficulty: 5.0,
        stability: 1.0,
        lastReviewedAt: 1700000000000,
        reviewCount: 0,
      },
      GLOTTAL_STOP: {
        phenomenon: 'GLOTTAL_STOP',
        difficulty: 5.5,
        stability: 1.8,
        lastReviewedAt: 1700000000000,
        reviewCount: 2,
      },
    };

    await storage.saveFSRSStates(mockStates as any);
    const loaded = await storage.loadFSRSStates();

    expect(loaded).not.toBeNull();
    expect(loaded?.LINKING.difficulty).toBe(4.5);
    expect(loaded?.REDUCTION.stability).toBe(1.1);
    expect(loaded?.GLOTTAL_STOP.reviewCount).toBe(2);
  });

  it('saves and loads keystroke latency history', async () => {
    const mockHistory: Record<string, LatencyTrajectoryPoint[]> = {
      LINKING: [
        { timestamp: 1000, meanIkiMs: 380, reviewIndex: 1 },
        { timestamp: 2000, meanIkiMs: 320, reviewIndex: 2 },
        { timestamp: 3000, meanIkiMs: 270, reviewIndex: 3 },
      ],
      REDUCTION: [
        { timestamp: 1000, meanIkiMs: 420, reviewIndex: 1 },
      ],
      ELISION: [],
      ASSIMILATION: [],
      GLOTTAL_STOP: [],
    };

    await storage.saveKeystrokeHistory(mockHistory as any);
    const loaded = await storage.loadKeystrokeHistory();

    expect(loaded).not.toBeNull();
    expect(loaded?.LINKING).toHaveLength(3);
    expect(loaded?.LINKING[2].meanIkiMs).toBe(270);
    expect(loaded?.REDUCTION[0].meanIkiMs).toBe(420);
  });

  it('saves and loads overcome count and bundle saveAll / loadAll', async () => {
    await storage.saveOvercomeCount(15);
    const count = await storage.loadOvercomeCount();
    expect(count).toBe(15);

    const bundle = await storage.loadAll();
    expect(bundle.overcomeCount).toBe(15);
  });
});
