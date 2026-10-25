/**
 * AdaptiveRecommender (Module C).
 * Recommends optimal practice chunks by prioritizing highest Acoustic Gain Score:
 * Score(Chunk) = sum_{phenomenon in Chunk} (1.0 - R(phenomenon)) * D(phenomenon)
 */

import type { AcousticChunkData } from '../dynamics/types';
import type { PhenomenonType, RecommendedChunk } from './types';
import { AcousticFSRSEngine } from './AcousticFSRSEngine';

export class AdaptiveRecommender {
  private engine: AcousticFSRSEngine;

  constructor(engine: AcousticFSRSEngine) {
    this.engine = engine;
  }

  /**
   * Evaluates candidate chunks and returns sorted recommendations.
   *
   * @param candidates Array of candidate AcousticChunkData
   * @param elapsedDays Optional hypothetical elapsed days since last practice
   * @param topN Number of top recommendations to return (default: all)
   */
  public recommend(
    candidates: AcousticChunkData[],
    elapsedDays?: number,
    topN?: number
  ): RecommendedChunk[] {
    const scoredChunks: RecommendedChunk[] = [];

    for (const chunk of candidates) {
      // Collect unique phenomena in this chunk
      const phenomenaSet = new Set<PhenomenonType>();
      for (const w of chunk.words) {
        for (const ph of w.phenomena) {
          phenomenaSet.add(ph);
        }
      }

      const targetedPhenomena = Array.from(phenomenaSet);

      // Compute Acoustic Gain Score: sum of (1.0 - R) * D
      let gainScore = 0;
      for (const ph of targetedPhenomena) {
        const itemState = this.engine.getItemState(ph, elapsedDays);
        const r = itemState.retrievability ?? this.engine.getRetrievability(ph, elapsedDays);
        const d = itemState.difficulty;

        // Marginal gain from practicing this forgotten/difficult phenomenon
        gainScore += (1.0 - r) * d;
      }

      // Add small bonus for richer chunks (containing diverse phenomena)
      if (targetedPhenomena.length > 1) {
        gainScore *= 1.0 + 0.1 * (targetedPhenomena.length - 1);
      }

      scoredChunks.push({
        chunk,
        acousticGainScore: Math.round(gainScore * 1000) / 1000,
        targetedPhenomena,
      });
    }

    // Sort descending by Acoustic Gain Score
    scoredChunks.sort((a, b) => b.acousticGainScore - a.acousticGainScore);

    return topN ? scoredChunks.slice(0, topN) : scoredChunks;
  }
}
