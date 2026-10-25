/**
 * Core Keystroke Dynamics and Cognitive Diagnostics Types (Phase 2).
 * Formats data matching Phase 1 Acoustic Pipeline outputs and provides
 * real-time interaction probe data structures.
 */

export type CognitiveState = 'NORMAL_FLOW' | 'MOTOR_TYPO' | 'PERCEPTUAL_BLINDSPOT';

export type AcousticPhenomenonType =
  | 'LINKING'
  | 'REDUCTION'
  | 'ELISION'
  | 'ASSIMILATION'
  | 'GLOTTAL_STOP';

export interface RawKeystrokeEvent {
  key: string;
  expectedChar: string;
  keydownTimestamp: number; // performance.now()
  keyupTimestamp?: number;
  ikiMs: number;
  dwellTimeMs: number;
  isCorrect: boolean;
  flightTimeMs?: number;
  charIndex?: number;
}

export interface AnnotatedKeystroke extends RawKeystrokeEvent {
  associatedPhoneme?: string;
  isWeakenedPhoneme: boolean;
  associatedPhenomena: AcousticPhenomenonType[];
  cognitiveState: CognitiveState;
}

export interface ChunkCognitiveReport {
  chunkId: string;
  totalDurationMs: number;
  accuracy: number;
  meanIkiMs: number;
  blindspotCount: number;
  typoCount: number;
  // Distribution of blindspots across acoustic phenomena types
  phenomenaBlindspotStats: Record<string, { totalOccurrences: number; blindspots: number }>;
  keystrokes: AnnotatedKeystroke[];
}

// -----------------------------------------------------------------------------
// Phase 1 Acoustic Pipeline Compatible Data Structures
// -----------------------------------------------------------------------------

export interface AcousticPhonemeData {
  phoneme: string;
  start_ms: number;
  end_ms: number;
  is_weakened: boolean;
  stress: number;
}

export interface AcousticWordData {
  word: string;
  start_ms: number;
  end_ms: number;
  phonemes: AcousticPhonemeData[];
  phenomena: AcousticPhenomenonType[];
}

export interface AcousticChunkData {
  chunk_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: AcousticWordData[];
}

export interface CharAcousticContext {
  charIndex: number;
  char: string;
  wordIndex: number;
  word: string;
  associatedPhoneme?: string;
  isWeakenedPhoneme: boolean;
  associatedPhenomena: AcousticPhenomenonType[];
  isHighRiskAcousticPoint: boolean;
}
