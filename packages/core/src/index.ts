export { PracticeFSM } from './PracticeFSM';
export { TypingEngineCore } from './TypingEngineCore';
export { ChunkAudioPlayer } from './ChunkAudioPlayer';
export { ScoringEngine, type ChallengeScoreParams, type ChallengeScoreResult } from './ScoringEngine';
export { db, type EpisodeProgressRecord } from './db';
export type { PracticeState, FSMEvent } from './PracticeFSM';

// Phase 2: Keystroke Dynamics & Cognitive Diagnostics
export * from './dynamics';

// Phase 3: Psychoacoustic Adaptive Scaffolding Engine
export * from './scaffolding';

// Phase 4: FSRS Memory Scheduler, Recommender & Scientific Metrics Engine
export * from './scheduler';
