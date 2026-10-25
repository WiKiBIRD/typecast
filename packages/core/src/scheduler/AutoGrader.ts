/**
 * AutoGrader (Module A).
 * Objective auto-grading engine mapping keystroke dynamics and scaffold consumption
 * directly to standard FSRS grades (1~4) without subjective popups.
 */

import type { ChunkCognitiveReport } from '../dynamics/types';
import { ScaffoldLevel, type WordScaffoldState } from '../scaffolding/types';
import { FSRSGrade, type PhenomenonType, type ChunkAutoGradeResult } from './types';

export interface AutoGraderOptions {
  baselineMeanIki?: number;
  baselineStdIki?: number;
}

export class AutoGrader {
  private readonly defaultBaselineMeanIki: number;
  private readonly defaultBaselineStdIki: number;

  constructor(options?: AutoGraderOptions) {
    this.defaultBaselineMeanIki = options?.baselineMeanIki ?? 280;
    this.defaultBaselineStdIki = options?.baselineStdIki ?? 80;
  }

  /**
   * Evaluates keystroke cognitive report and scaffolding states to assign FSRS Grade (1~4).
   */
  public gradeChunk(
    report: ChunkCognitiveReport,
    wordStates: WordScaffoldState[],
    baselineMeanIki?: number,
    baselineStdIki?: number
  ): ChunkAutoGradeResult {
    const meanIki = baselineMeanIki ?? this.defaultBaselineMeanIki;
    const stdIki = baselineStdIki ?? this.defaultBaselineStdIki;
    const easyIkiThreshold = meanIki - 0.5 * stdIki;

    // Check maximum scaffold level reached across any word in the chunk
    let maxScaffoldLevel = ScaffoldLevel.LEVEL_0_NONE;
    for (const ws of wordStates) {
      if (ws.currentLevel > maxScaffoldLevel) {
        maxScaffoldLevel = ws.currentLevel;
      }
    }

    // Also check if any word had blindspotTriggered
    const anyBlindspotTriggered =
      report.blindspotCount > 0 || wordStates.some((ws) => ws.blindspotTriggered);

    // -------------------------------------------------------------------------
    // Rule 1: AGAIN (Grade 1) - High scaffold consumption (Level 2 or 3)
    // -------------------------------------------------------------------------
    if (
      maxScaffoldLevel >= ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL ||
      (anyBlindspotTriggered && report.accuracy < 70)
    ) {
      const phenomenaGrades = this.gradePhenomena(report, wordStates, FSRSGrade.AGAIN);
      return {
        overallGrade: FSRSGrade.AGAIN,
        phenomenaGrades,
        reason: 'Severe acoustic blindspot: required phonetic reality reveal or letter skeleton.',
      };
    }

    // -------------------------------------------------------------------------
    // Rule 2: HARD (Grade 2) - Overcome with Level 1 Micro-Lens
    // -------------------------------------------------------------------------
    if (maxScaffoldLevel === ScaffoldLevel.LEVEL_1_MICRO_LENS || anyBlindspotTriggered) {
      const phenomenaGrades = this.gradePhenomena(report, wordStates, FSRSGrade.HARD);
      return {
        overallGrade: FSRSGrade.HARD,
        phenomenaGrades,
        reason: 'Perceptual pause resolved successfully with Level 1 localized acoustic micro-lens.',
      };
    }

    // -------------------------------------------------------------------------
    // Rule 3: EASY (Grade 4) - Highly automated normal flow with rapid IKI
    // -------------------------------------------------------------------------
    if (
      report.blindspotCount === 0 &&
      maxScaffoldLevel === ScaffoldLevel.LEVEL_0_NONE &&
      report.accuracy >= 92 &&
      report.meanIkiMs < easyIkiThreshold
    ) {
      const phenomenaGrades = this.gradePhenomena(report, wordStates, FSRSGrade.EASY);
      return {
        overallGrade: FSRSGrade.EASY,
        phenomenaGrades,
        reason: 'Fluid normal flow with automated latency below user baseline.',
      };
    }

    // -------------------------------------------------------------------------
    // Rule 4: GOOD (Grade 3) - Standard normal flow (minor motor typos permitted)
    // -------------------------------------------------------------------------
    const phenomenaGrades = this.gradePhenomena(report, wordStates, FSRSGrade.GOOD);
    return {
      overallGrade: FSRSGrade.GOOD,
      phenomenaGrades,
      reason: 'Fluent normal flow with zero acoustic scaffolding consumption.',
    };
  }

  /**
   * Calculates individual grades for each acoustic phenomenon present in the chunk.
   */
  private gradePhenomena(
    report: ChunkCognitiveReport,
    wordStates: WordScaffoldState[],
    defaultGrade: FSRSGrade
  ): Record<PhenomenonType, FSRSGrade> {
    const grades: Partial<Record<PhenomenonType, FSRSGrade>> = {};

    const allPhenomena: PhenomenonType[] = [
      'LINKING',
      'REDUCTION',
      'ELISION',
      'ASSIMILATION',
      'GLOTTAL_STOP',
    ];

    for (const ph of allPhenomena) {
      const stat = report.phenomenaBlindspotStats[ph];
      if (stat && stat.totalOccurrences > 0) {
        if (stat.blindspots > 0) {
          // If this phenomenon triggered blindspots, evaluate against scaffold level
          const hasLevel2Or3 = wordStates.some(
            (ws) => ws.currentLevel >= ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL && ws.hint?.phenomenon === ph
          );
          grades[ph] = hasLevel2Or3 ? FSRSGrade.AGAIN : FSRSGrade.HARD;
        } else {
          // Clean phenomenon execution without blindspot
          grades[ph] = defaultGrade === FSRSGrade.EASY ? FSRSGrade.EASY : FSRSGrade.GOOD;
        }
      }
    }

    return grades as Record<PhenomenonType, FSRSGrade>;
  }
}
