/**
 * FSRS Memory Scheduler and Cognitive Metrics Types (Phase 4).
 */

import type { AcousticPhenomenonType, AcousticChunkData } from '../dynamics/types';

export type PhenomenonType = AcousticPhenomenonType;

export enum FSRSGrade {
  AGAIN = 1,
  HARD = 2,
  GOOD = 3,
  EASY = 4,
}

export interface FSRSItemState {
  phenomenon: PhenomenonType;
  difficulty: number;     // 1.0 ~ 10.0
  stability: number;      // Days until retrievability drops to 0.9
  lastReviewedAt: number; // Millisecond timestamp
  reviewCount: number;
  retrievability?: number;// Current calculated R (0.0 ~ 1.0)
}

export interface AcousticRadarProfile {
  radarVector: Record<PhenomenonType, number>; // 0 ~ 100 score
  meanLatencyReductionPercent: number;        // Latency reduction relative to initial baseline
  totalOvercomeCount: number;                 // Total blindspots successfully overcome
}

export interface RecommendedChunk {
  chunk: AcousticChunkData;
  acousticGainScore: number;
  targetedPhenomena: PhenomenonType[];
}

export interface ChunkAutoGradeResult {
  overallGrade: FSRSGrade;
  phenomenaGrades: Record<PhenomenonType, FSRSGrade>;
  reason: string;
}

export interface LatencyTrajectoryPoint {
  timestamp: number;
  meanIkiMs: number;
  reviewIndex: number;
}
