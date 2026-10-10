export interface Word {
  word: string;
  startSec: number;
  endSec: number;
  score: number;
  lowConfidence?: boolean;
}

export interface Sentence {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface EpisodeCreator {
  name: string;
  supportUrl: string;
  avatarUrl?: string;
}

export interface Episode {
  episodeId: string;
  episodeNumber: number;
  title: string;
  seriesId: string;
  audioUrl: string;
  duration: number;
  publishedAt?: string;
  processedAt: string;
  whisperModel: string;
  creator: EpisodeCreator;
  sentences: Sentence[];
}

export interface EpisodeManifestItem {
  episodeId: string;
  episodeNumber: number;
  title: string;
  seriesId: string;
  audioUrl: string;
  duration: number;
  publishedAt?: string;
  sentenceCount: number;
  wordCount: number;
}

export interface EpisodeManifest {
  version: string;
  generatedAt: string;
  episodes: EpisodeManifestItem[];
}

export interface AudioChunk {
  audioUrl: string;
  startSec: number;
  endSec: number;
  seekAheadMs: number;
  sentenceId: number;
}

export type PlayerState =
  | 'IDLE'
  | 'LOADING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'LOOPING'
  | 'PAUSED'
  | 'ERROR';

export type KeyResult = 'CORRECT' | 'WRONG' | 'SKIPPED_PUNCT' | 'COMPLETED' | 'SKIP';

export type JudgeMode = 'LENIENT' | 'STRICT';

export interface SentenceStats {
  sentenceId: number;
  wpm: number;
  accuracy: number;
  elapsedMs: number;
  errorCount: number;
  totalChars: number;
}

export interface TypingEngineEvents {
  keyResult: (result: KeyResult, charIndex: number, char: string) => void;
  sentenceCompleted: (stats: SentenceStats) => void;
  mismatch: (expected: string, actual: string, errorCount: number) => void;
  reset: () => void;
}

export interface ChunkPlayerEvents {
  stateChange: (state: PlayerState) => void;
  chunkEnd: (sentenceId: number) => void;
  seekComplete: (actualTimeSec: number) => void;
  timeUpdate: (currentSec: number) => void;
  error: (err: Error) => void;
}

export interface TypingEngineConfig {
  judgeMode: JudgeMode;
  skipChars: Set<string>;
}
