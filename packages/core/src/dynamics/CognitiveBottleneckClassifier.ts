/**
 * CognitiveBottleneckClassifier (Module C).
 * Classifies typing keystrokes into 3 cognitive states:
 * - NORMAL_FLOW (Smooth acoustic decoding)
 * - MOTOR_TYPO (Motor slip / pure mechanical typo with rapid correction)
 * - PERCEPTUAL_BLINDSPOT (Acoustic perceptual blackout / phonological decoding blockage)
 *
 * Generates comprehensive ChunkCognitiveReport assessing connected speech bottlenecks.
 */

import type {
  CognitiveState,
  RawKeystrokeEvent,
  AnnotatedKeystroke,
  ChunkCognitiveReport,
  CharAcousticContext,
  AcousticChunkData,
  AcousticPhenomenonType,
} from './types';
import { AcousticCharMapper } from './AcousticCharMapper';

export interface ClassifierOptions {
  initialBaselineMeanIki?: number;
  initialBaselineStdIki?: number;
  blindspotMinIkiMs?: number;
  motorTypoMaxIkiMs?: number;
  rapidBackspaceWindowMs?: number;
  historyWindowSize?: number;
}

export class CognitiveBottleneckClassifier {
  private meanIki: number;
  private stdIki: number;
  private recentNormalIkis: number[] = [];

  private readonly blindspotMinIki: number;
  private readonly motorTypoMaxIki: number;
  private readonly rapidBackspaceWindow: number;
  private readonly windowSize: number;

  constructor(options?: ClassifierOptions) {
    this.meanIki = options?.initialBaselineMeanIki ?? 280;
    this.stdIki = options?.initialBaselineStdIki ?? 90;
    this.blindspotMinIki = options?.blindspotMinIkiMs ?? 650;
    this.motorTypoMaxIki = options?.motorTypoMaxIkiMs ?? 180;
    this.rapidBackspaceWindow = options?.rapidBackspaceWindowMs ?? 250;
    this.windowSize = options?.historyWindowSize ?? 30;
  }

  /**
   * Current cognitive blindspot latency threshold (baseline mean + 2 * std, minimum 650ms).
   */
  public getBlindspotThreshold(): number {
    return Math.max(this.blindspotMinIki, this.meanIki + 2 * this.stdIki);
  }

  /**
   * Updates rolling baseline IKI with a normal keystroke interval.
   */
  public updateBaseline(ikiMs: number): void {
    if (ikiMs <= 40 || ikiMs >= 1000) {
      return; // Ignore extreme pauses or near-zero multi-clicks
    }

    this.recentNormalIkis.push(ikiMs);
    if (this.recentNormalIkis.length > this.windowSize) {
      this.recentNormalIkis.shift();
    }

    // Recompute mean and standard deviation
    const n = this.recentNormalIkis.length;
    if (n >= 3) {
      const sum = this.recentNormalIkis.reduce((a, b) => a + b, 0);
      this.meanIki = sum / n;
      const variance = this.recentNormalIkis.reduce((acc, v) => acc + Math.pow(v - this.meanIki, 2), 0) / n;
      this.stdIki = Math.sqrt(variance);
    }
  }

  /**
   * Classifies an entire chunk of raw keystrokes against the acoustic mapping.
   */
  public classifyChunk(
    chunk: AcousticChunkData,
    rawEvents: RawKeystrokeEvent[]
  ): ChunkCognitiveReport {
    const mapper = new AcousticCharMapper(chunk);
    const annotated: AnnotatedKeystroke[] = [];

    let blindspotCount = 0;
    let typoCount = 0;
    let correctCount = 0;

    // Track acoustic hesitation / retries per charIndex
    const charErrorCount: Map<number, number> = new Map();

    for (let i = 0; i < rawEvents.length; i++) {
      const curr = rawEvents[i];
      const next = i + 1 < rawEvents.length ? rawEvents[i + 1] : undefined;

      // Determine char index for context
      const charIdx = curr.charIndex !== undefined ? curr.charIndex : i;
      const context = mapper.getContextAt(charIdx);

      // Track errors for hesitation detection
      if (!curr.isCorrect && curr.key !== 'Backspace') {
        const errs = (charErrorCount.get(charIdx) || 0) + 1;
        charErrorCount.set(charIdx, errs);
      }

      const state = this.diagnoseKeystroke(curr, next, context, charErrorCount.get(charIdx) || 0);

      if (state === 'PERCEPTUAL_BLINDSPOT') {
        blindspotCount++;
      } else if (state === 'MOTOR_TYPO') {
        typoCount++;
      } else {
        if (curr.isCorrect) {
          correctCount++;
          this.updateBaseline(curr.ikiMs);
        }
      }

      annotated.push({
        ...curr,
        associatedPhoneme: context.associatedPhoneme,
        isWeakenedPhoneme: context.isWeakenedPhoneme,
        associatedPhenomena: [...context.associatedPhenomena],
        cognitiveState: state,
      });
    }

    // Compute metrics
    const totalDurationMs =
      rawEvents.length > 0
        ? rawEvents[rawEvents.length - 1].keydownTimestamp - rawEvents[0].keydownTimestamp
        : 0;
    const accuracy = rawEvents.length > 0 ? (correctCount / rawEvents.length) * 100 : 100;
    const totalIki = rawEvents.reduce((acc, e) => acc + e.ikiMs, 0);
    const meanIkiMs = rawEvents.length > 0 ? totalIki / rawEvents.length : 0;

    // Aggregate phenomena blindspot statistics
    const phenomenaBlindspotStats = this.aggregatePhenomenaStats(chunk, annotated);

    return {
      chunkId: chunk.chunk_id,
      totalDurationMs: Math.round(totalDurationMs),
      accuracy: Math.round(accuracy * 10) / 10,
      meanIkiMs: Math.round(meanIkiMs),
      blindspotCount,
      typoCount,
      phenomenaBlindspotStats,
      keystrokes: annotated,
    };
  }

  /**
   * Individual keystroke diagnostic logic according to cognitive psychological criteria.
   */
  public diagnoseKeystroke(
    curr: RawKeystrokeEvent,
    next: RawKeystrokeEvent | undefined,
    context: CharAcousticContext,
    charErrorCountSoFar: number
  ): CognitiveState {
    const blindspotThreshold = this.getBlindspotThreshold();
    const isBackspace = curr.key === 'Backspace';

    // -------------------------------------------------------------------------
    // Rule 1: PERCEPTUAL_BLINDSPOT (Acoustic blackout / ear failure)
    // -------------------------------------------------------------------------
    // 1A. Latency Pause: High-risk acoustic point (weakened phoneme / phenomena) + long IKI pause
    if (context.isHighRiskAcousticPoint && curr.ikiMs >= blindspotThreshold) {
      return 'PERCEPTUAL_BLINDSPOT';
    }

    // 1B. Acoustic Hesitation Backspace:
    // Repeated retries (>= 2 attempts) or backspacing at high-risk acoustic points
    if (context.isHighRiskAcousticPoint && (charErrorCountSoFar >= 2 || (isBackspace && curr.ikiMs > 350))) {
      return 'PERCEPTUAL_BLINDSPOT';
    }

    // -------------------------------------------------------------------------
    // Rule 2: MOTOR_TYPO (Mechanical slip / motor error)
    // -------------------------------------------------------------------------
    if (!curr.isCorrect && !isBackspace) {
      // 2A. Rapid slip + immediate backspace (< 250ms) with fast IKI (< 180ms)
      const nextIsImmediateBackspace =
        next &&
        next.key === 'Backspace' &&
        next.keydownTimestamp - curr.keydownTimestamp < this.rapidBackspaceWindow;

      if (curr.ikiMs < this.motorTypoMaxIki && nextIsImmediateBackspace) {
        return 'MOTOR_TYPO';
      }

      // 2B. Isolated typo occurring on non-phenomena, normal phonemes with moderate IKI
      if (!context.isHighRiskAcousticPoint && curr.ikiMs < blindspotThreshold) {
        return 'MOTOR_TYPO';
      }
    }

    // Backspace itself when rapid is a motor correction
    if (isBackspace && curr.ikiMs < this.motorTypoMaxIki) {
      return 'MOTOR_TYPO';
    }

    // -------------------------------------------------------------------------
    // Rule 3: NORMAL_FLOW (Smooth decoding)
    // -------------------------------------------------------------------------
    return 'NORMAL_FLOW';
  }

  /**
   * Aggregates blindspots and occurrences across all acoustic phenomena in the chunk.
   */
  private aggregatePhenomenaStats(
    chunk: AcousticChunkData,
    annotated: AnnotatedKeystroke[]
  ): Record<string, { totalOccurrences: number; blindspots: number }> {
    const stats: Record<string, { totalOccurrences: number; blindspots: number }> = {
      LINKING: { totalOccurrences: 0, blindspots: 0 },
      REDUCTION: { totalOccurrences: 0, blindspots: 0 },
      ELISION: { totalOccurrences: 0, blindspots: 0 },
      ASSIMILATION: { totalOccurrences: 0, blindspots: 0 },
      GLOTTAL_STOP: { totalOccurrences: 0, blindspots: 0 },
    };

    // 1. Count total occurrences in chunk words
    for (const word of chunk.words) {
      for (const ph of word.phenomena) {
        if (stats[ph]) {
          stats[ph].totalOccurrences += 1;
        }
      }
    }

    // Also count any phonemes explicitly marked is_weakened as REDUCTION occurrences
    for (const word of chunk.words) {
      const hasWeakenedPhone = word.phonemes.some((p) => p.is_weakened);
      if (hasWeakenedPhone && !word.phenomena.includes('REDUCTION')) {
        stats.REDUCTION.totalOccurrences += 1;
      }
    }

    // 2. Count blindspots occurring on keystrokes with each phenomenon
    for (const keyEvent of annotated) {
      if (keyEvent.cognitiveState === 'PERCEPTUAL_BLINDSPOT') {
        for (const ph of keyEvent.associatedPhenomena) {
          if (stats[ph]) {
            stats[ph].blindspots += 1;
          }
        }
      }
    }

    return stats;
  }
}
