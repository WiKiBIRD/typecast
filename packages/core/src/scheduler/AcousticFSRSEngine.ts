/**
 * AcousticFSRSEngine (Module B).
 * Phonological Free Spaced Repetition Scheduler (FSRS-DSR) modeling memory
 * stability and decay across the 5 acoustic connected speech phenomena.
 */

import { FSRSGrade, type PhenomenonType, type FSRSItemState } from './types';

export const ALL_PHENOMENA: PhenomenonType[] = [
  'LINKING',
  'REDUCTION',
  'ELISION',
  'ASSIMILATION',
  'GLOTTAL_STOP',
];

export class AcousticFSRSEngine {
  // FSRS decay factor: (1 + (19/81) * (t / S))^-0.5 guarantees R(S, S) = 0.90 exactly
  private static readonly DECAY_FACTOR = 19.0 / 81.0;

  private items: Map<PhenomenonType, FSRSItemState> = new Map();

  constructor(initialStates?: Partial<Record<PhenomenonType, FSRSItemState>>) {
    this.initItems(initialStates);
  }

  private initItems(initialStates?: Partial<Record<PhenomenonType, FSRSItemState>>): void {
    const now = typeof Date !== 'undefined' ? Date.now() : 0;
    for (const ph of ALL_PHENOMENA) {
      if (initialStates && initialStates[ph]) {
        this.items.set(ph, { ...initialStates[ph]! });
      } else {
        this.items.set(ph, {
          phenomenon: ph,
          difficulty: 5.0,
          stability: 1.0, // Initial 1 day stability
          lastReviewedAt: now,
          reviewCount: 0,
        });
      }
    }
  }

  /**
   * Calculates Retrievability R(t, S) = (1 + (19/81) * (t / S))^-0.5
   * At t = S, R = 0.90 exactly.
   *
   * @param phenomenon Acoustic phenomenon type
   * @param currentElapsedDays Days passed since last review (t)
   */
  public getRetrievability(phenomenon: PhenomenonType, currentElapsedDays?: number): number {
    const item = this.items.get(phenomenon);
    if (!item) return 1.0;

    let t = currentElapsedDays;
    if (t === undefined) {
      const now = typeof Date !== 'undefined' ? Date.now() : 0;
      const elapsedMs = Math.max(0, now - item.lastReviewedAt);
      t = elapsedMs / (1000 * 60 * 60 * 24);
    }

    if (t <= 0) return 1.0;
    const s = Math.max(0.01, item.stability);

    const r = Math.pow(1.0 + (AcousticFSRSEngine.DECAY_FACTOR * t) / s, -0.5);
    return Math.min(1.0, Math.max(0.0, r));
  }

  /**
   * Updates phenomenon state following practice with an assigned FSRS Grade.
   *
   * @param phenomenon Acoustic phenomenon type
   * @param grade Assigned objective grade (1=AGAIN, 2=HARD, 3=GOOD, 4=EASY)
   * @param elapsedDays Days elapsed since previous review (default: calculated from timestamp)
   */
  public recordPractice(
    phenomenon: PhenomenonType,
    grade: FSRSGrade,
    elapsedDays?: number
  ): FSRSItemState {
    const item = this.items.get(phenomenon) || {
      phenomenon,
      difficulty: 5.0,
      stability: 1.0,
      lastReviewedAt: Date.now(),
      reviewCount: 0,
    };

    const t = elapsedDays ?? Math.max(0, (Date.now() - item.lastReviewedAt) / (1000 * 60 * 60 * 24));
    const r = this.getRetrievability(phenomenon, t);

    // 1. Update Difficulty D
    // Grade 1 (+1.0), Grade 2 (+0.5), Grade 3 (-0.1), Grade 4 (-0.6)
    let dDelta = 0;
    switch (grade) {
      case FSRSGrade.AGAIN:
        dDelta = 1.0;
        break;
      case FSRSGrade.HARD:
        dDelta = 0.4;
        break;
      case FSRSGrade.GOOD:
        dDelta = -0.15;
        break;
      case FSRSGrade.EASY:
        dDelta = -0.5;
        break;
    }
    const newD = Math.min(10.0, Math.max(1.0, item.difficulty + dDelta));

    // 2. Update Stability S
    let newS = item.stability;
    if (grade === FSRSGrade.AGAIN) {
      // Memory relapse: collapse stability
      newS = Math.max(0.2, item.stability * 0.25);
    } else {
      // Memory consolidation: exponential growth factor based on retrievability and difficulty
      let gradeMultiplier = 1.0;
      if (grade === FSRSGrade.HARD) gradeMultiplier = 0.65;
      else if (grade === FSRSGrade.GOOD) gradeMultiplier = 1.0;
      else if (grade === FSRSGrade.EASY) gradeMultiplier = 1.45;

      const difficultyBonus = Math.max(1.0, 11.0 - newD);
      const retrievabilityFactor = Math.pow(Math.max(0.1, r), -0.5);
      const growthFactor = 1.0 + 0.35 * difficultyBonus * retrievabilityFactor * gradeMultiplier;

      newS = item.stability * growthFactor;
    }

    item.difficulty = Math.round(newD * 100) / 100;
    item.stability = Math.round(newS * 100) / 100;
    item.lastReviewedAt = Date.now();
    item.reviewCount += 1;
    item.retrievability = this.getRetrievability(phenomenon, 0);

    this.items.set(phenomenon, item);
    return { ...item };
  }

  /**
   * Retrieves state for a single phenomenon.
   */
  public getItemState(phenomenon: PhenomenonType, currentElapsedDays?: number): FSRSItemState {
    const item = this.items.get(phenomenon)!;
    return {
      ...item,
      retrievability: this.getRetrievability(phenomenon, currentElapsedDays),
    };
  }

  /**
   * Exports all item states for persistence or inspection.
   */
  public exportState(): Record<PhenomenonType, FSRSItemState> {
    const res: Partial<Record<PhenomenonType, FSRSItemState>> = {};
    for (const [k, v] of this.items.entries()) {
      res[k] = { ...v, retrievability: this.getRetrievability(k) };
    }
    return res as Record<PhenomenonType, FSRSItemState>;
  }

  /**
   * Imports existing state into the scheduler.
   */
  public importState(states: Record<PhenomenonType, FSRSItemState>): void {
    for (const [k, v] of Object.entries(states)) {
      this.items.set(k as PhenomenonType, { ...v });
    }
  }
}

/**
 * Objective grading heuristic for FSRS sentence reviews (Module M7).
 * Maps sentence typing performance and acoustic lens activations to an FSRSGrade.
 */
export function gradeSentencePractice(
  errorCount: number,
  lensTriggered: boolean,
  avgIkiMs: number
): FSRSGrade {
  if (errorCount >= 3 || lensTriggered) {
    return FSRSGrade.AGAIN;
  }
  if (errorCount >= 1) {
    return FSRSGrade.HARD;
  }
  if (avgIkiMs > 0 && avgIkiMs < 350) {
    return FSRSGrade.EASY;
  }
  return FSRSGrade.GOOD;
}
