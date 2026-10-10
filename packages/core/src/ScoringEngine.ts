export interface ChallengeScoreParams {
  totalCorrectChars: number;
  totalChars: number;
  userWpm: number;
  standardWpm?: number; // 默认 35 WPM
  pauseCount: number;   // 主动暂停或倒退次数
}

export interface ChallengeScoreResult {
  score: number;        // 百分制 0-100
  accuracy: number;     // 0-1
  wpm: number;
  passed: boolean;      // score >= 80
  stars: 0 | 1 | 2 | 3; // 0=未及格, 1=及格, 2=优秀, 3=宗师
  feedback: string;
}

export class ScoringEngine {
  /**
   * 计算 Round 4 全文盲听大考得分
   * 总分 = (Accuracy * 70%) + (SpeedFactor * 30%) - (pauseCount * 2)
   */
  static evaluateRound4(params: ChallengeScoreParams): ChallengeScoreResult {
    const {
      totalCorrectChars,
      totalChars,
      userWpm,
      standardWpm = 35,
      pauseCount,
    } = params;

    const accuracy = totalChars > 0 ? Math.min(1, Math.max(0, totalCorrectChars / totalChars)) : 0;
    const accuracyScore = accuracy * 70;

    const speedRatio = Math.min(1.0, Math.max(0, userWpm / standardWpm));
    const speedScore = speedRatio * 30;

    const penalty = Math.min(15, Math.max(0, pauseCount * 2));

    const rawScore = accuracyScore + speedScore - penalty;
    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    const passed = finalScore >= 80;

    let stars: 0 | 1 | 2 | 3 = 0;
    let feedback = '未达及格线 (80分)，建议重温第 3 轮单句盲听后再次挑战！';

    if (finalScore >= 96) {
      stars = 3;
      feedback = '⭐⭐⭐ 听写宗师！行云流水，完美达成母语级肌肉反射！';
    } else if (finalScore >= 90) {
      stars = 2;
      feedback = '⭐⭐ 精听高手！表现卓越，语流肌肉记忆已稳固成型！';
    } else if (finalScore >= 80) {
      stars = 1;
      feedback = '⭐ 考核合格！恭喜通关大考，成功解锁下一集！';
    }

    return {
      score: finalScore,
      accuracy: Math.round(accuracy * 1000) / 1000,
      wpm: Math.round(userWpm),
      passed,
      stars,
      feedback,
    };
  }
}
