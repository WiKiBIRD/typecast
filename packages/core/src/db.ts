import Dexie, { type Table } from 'dexie';

export interface EpisodeProgressRecord {
  episodeId: string;           // "slow-english-ep-01"
  currentRound: 1 | 2 | 3 | 4; // 当前正在进行的轮次
  currentSentenceIdx: number;  // 当前轮次打到了第几句 (0-indexed)
  roundCompleted: {
    round1: boolean;           // 明文跟打已通关
    round2: boolean;           // 模糊跟打已通关
    round3: boolean;           // 单句盲听已通关
    round4: boolean;           // 全文大考及格 (>= 80分)
  };
  bestScore?: {
    score: number;             // 百分制 0-100
    accuracy: number;          // 0-1
    wpm: number;
    stars: 1 | 2 | 3;          // 80+=1星, 90+=2星, 96+=3星
    achievedAt: number;
  };
  updatedAt: number;
}

export class TypeCastDB extends Dexie {
  progress!: Table<EpisodeProgressRecord, string>;

  constructor() {
    super('TypeCastDatabase');
    this.version(1).stores({
      progress: 'episodeId, currentRound, updatedAt',
    });
  }
}

export const db = new TypeCastDB();
