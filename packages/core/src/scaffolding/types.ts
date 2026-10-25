/**
 * Adaptive Acoustic Scaffolding Engine Types (Phase 3).
 * Progressive cognitive interventions for perceptual blindspots.
 */

import type { AcousticPhenomenonType } from '../dynamics/types';

export enum ScaffoldLevel {
  LEVEL_0_NONE = 0,
  LEVEL_1_MICRO_LENS = 1,        // 局部声学慢放 (0.7x time-stretch)
  LEVEL_2_PHONETIC_REVEAL = 2,   // 音标现实对比 (Citation IPA vs Actual Surface IPA)
  LEVEL_3_SKELETON = 3,          // 最小辅音骨架 (e.g. "s _ t")
}

export interface AcousticLensSegment {
  originalStartMs: number;
  originalEndMs: number;
  playbackRate: number;          // 0.7 for stretched slow-motion, 1.0 for normal speed
  isTargetBlindspot: boolean;
}

export interface PhoneticRealityHint {
  phenomenon: AcousticPhenomenonType;
  targetWord: string;
  ipaCitation: string;           // 字典标准音标
  ipaActual: string;             // 物理声学实际音标
  acousticExplanation: string;   // 听觉知觉引导语
}

export interface WordScaffoldState {
  wordIndex: number;
  word: string;
  currentLevel: ScaffoldLevel;
  attempts: number;
  blindspotTriggered: boolean;
  lensSchedule?: AcousticLensSegment[];
  hint?: PhoneticRealityHint;
  skeleton?: string;
}

export interface BlindspotOvercomeEvent {
  wordIndex: number;
  word: string;
  resolvedLevel: ScaffoldLevel;
  attempts: number;
  timestamp: number;
}
