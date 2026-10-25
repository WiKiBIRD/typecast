/**
 * AcousticMetricsExporter (Module D).
 * Scientific measurement engine producing 5D acoustic perception radar vectors
 * and keystroke latency convergence metrics adhering to the Power Law of Practice.
 */

import {
  type PhenomenonType,
  type AcousticRadarProfile,
  type LatencyTrajectoryPoint,
} from './types';
import { AcousticFSRSEngine, ALL_PHENOMENA } from './AcousticFSRSEngine';

export class AcousticMetricsExporter {
  private engine: AcousticFSRSEngine;
  private latencyHistory: Map<PhenomenonType, LatencyTrajectoryPoint[]> = new Map();
  private totalOvercomeCount: number = 0;

  constructor(engine: AcousticFSRSEngine) {
    this.engine = engine;
    for (const ph of ALL_PHENOMENA) {
      this.latencyHistory.set(ph, []);
    }
  }

  /**
   * Records a latency observation for a specific phenomenon after a practice turn.
   */
  public recordLatency(
    phenomenon: PhenomenonType,
    meanIkiMs: number,
    timestamp?: number
  ): void {
    const list = this.latencyHistory.get(phenomenon) || [];
    list.push({
      timestamp: timestamp ?? Date.now(),
      meanIkiMs,
      reviewIndex: list.length + 1,
    });
    this.latencyHistory.set(phenomenon, list);
  }

  /**
   * Increments the count of overcome blindspots.
   */
  public addOvercomeCount(count: number = 1): void {
    this.totalOvercomeCount += count;
  }

  /**
   * Computes the Power Law latency reduction percentage for a specific phenomenon.
   */
  public getLatencyConvergence(phenomenon: PhenomenonType): {
    initialIki: number;
    currentIki: number;
    reductionPercent: number;
  } {
    const history = this.latencyHistory.get(phenomenon) || [];
    if (history.length < 2) {
      const single = history[0]?.meanIkiMs ?? 0;
      return { initialIki: single, currentIki: single, reductionPercent: 0 };
    }

    const initialIki = history[0].meanIkiMs;
    const currentIki = history[history.length - 1].meanIkiMs;

    if (initialIki <= 0) {
      return { initialIki, currentIki, reductionPercent: 0 };
    }

    const reductionPercent = Math.max(0, ((initialIki - currentIki) / initialIki) * 100);
    return {
      initialIki: Math.round(initialIki),
      currentIki: Math.round(currentIki),
      reductionPercent: Math.round(reductionPercent * 10) / 10,
    };
  }

  /**
   * Generates the academic 5D Acoustic Perception Radar Profile.
   *
   * @param currentElapsedDays Optional elapsed days offset
   */
  public exportRadarProfile(currentElapsedDays?: number): AcousticRadarProfile {
    const radarVector: Partial<Record<PhenomenonType, number>> = {};
    let totalReduction = 0;
    let trackedCount = 0;

    for (const ph of ALL_PHENOMENA) {
      const item = this.engine.getItemState(ph, currentElapsedDays);
      const r = item.retrievability ?? 1.0;

      // Base mastery score from Retrievability R (0 ~ 100)
      // Modulated by difficulty: mastered high difficulty items get full score;
      // Low stability or high difficulty items with decayed R get penalized.
      const stabilityBonus = Math.min(1.0, Math.log10(Math.max(1.0, item.stability + 1)));
      const baseScore = r * 85 + stabilityBonus * 15;
      const scoreClamped = Math.min(100, Math.max(0, Math.round(baseScore)));

      radarVector[ph] = scoreClamped;

      // Convergence calculation
      const conv = this.getLatencyConvergence(ph);
      if (conv.initialIki > 0 && conv.initialIki !== conv.currentIki) {
        totalReduction += conv.reductionPercent;
        trackedCount++;
      }
    }

    const meanLatencyReductionPercent =
      trackedCount > 0 ? Math.round((totalReduction / trackedCount) * 10) / 10 : 0;

    return {
      radarVector: radarVector as Record<PhenomenonType, number>,
      meanLatencyReductionPercent,
      totalOvercomeCount: this.totalOvercomeCount,
    };
  }

  /**
   * Gets historical latency trajectory points for a phenomenon.
   */
  public getLatencyTrajectory(phenomenon: PhenomenonType): LatencyTrajectoryPoint[] {
    return [...(this.latencyHistory.get(phenomenon) || [])];
  }

  /**
   * Exports the entire keystroke latency history across all phenomena.
   */
  public exportLatencyHistory(): Record<PhenomenonType, LatencyTrajectoryPoint[]> {
    const res: Partial<Record<PhenomenonType, LatencyTrajectoryPoint[]>> = {};
    for (const [k, v] of this.latencyHistory.entries()) {
      res[k] = [...v];
    }
    return res as Record<PhenomenonType, LatencyTrajectoryPoint[]>;
  }

  /**
   * Imports existing keystroke latency history into the exporter.
   */
  public importLatencyHistory(history: Partial<Record<PhenomenonType, LatencyTrajectoryPoint[]>>): void {
    for (const [k, v] of Object.entries(history)) {
      if (Array.isArray(v)) {
        this.latencyHistory.set(k as PhenomenonType, [...v]);
      }
    }
  }

  /**
   * Returns total number of overcome blindspots.
   */
  public getTotalOvercomeCount(): number {
    return this.totalOvercomeCount;
  }

  /**
   * Sets total number of overcome blindspots.
   */
  public setTotalOvercomeCount(count: number): void {
    this.totalOvercomeCount = Math.max(0, count);
  }
}
