/**
 * MicroLensTimeScheduler (Module B).
 * Solves audio playback timelines with localized micro-lens time-stretching.
 * Partitions the original audio chunk into seamless piecewise timeline segments:
 * context segments at 1.0x, blindspot segment at 0.7x lossless time-stretch.
 */

import type { AcousticLensSegment } from './types';

export interface MicroLensOptions {
  paddingMs?: number;       // Safety buffer padding in ms (default: 80ms)
  stretchFactor?: number;   // Slowdown rate (default: 0.7x)
}

export class MicroLensTimeScheduler {
  private readonly defaultPaddingMs: number;
  private readonly defaultStretchFactor: number;

  constructor(options?: MicroLensOptions) {
    this.defaultPaddingMs = options?.paddingMs ?? 80;
    this.defaultStretchFactor = options?.stretchFactor ?? 0.7;
  }

  /**
   * Computes the piecewise timeline segments for Web Audio or standard HTML5 playback.
   *
   * @param chunkStartMs Total start timestamp of the current prosodic chunk (ms)
   * @param chunkEndMs Total end timestamp of the current prosodic chunk (ms)
   * @param targetStartMs Start timestamp of the blindspot word or phoneme (ms)
   * @param targetEndMs End timestamp of the blindspot word or phoneme (ms)
   * @param options Custom padding or stretch factor
   */
  public schedule(
    chunkStartMs: number,
    chunkEndMs: number,
    targetStartMs: number,
    targetEndMs: number,
    options?: MicroLensOptions
  ): AcousticLensSegment[] {
    const padding = options?.paddingMs ?? this.defaultPaddingMs;
    const factor = options?.stretchFactor ?? this.defaultStretchFactor;

    // Apply safety margin window
    const lensStartMs = Math.max(chunkStartMs, targetStartMs - padding);
    const lensEndMs = Math.min(chunkEndMs, targetEndMs + padding);

    const segments: AcousticLensSegment[] = [];

    // 1. Pre-blindspot context (1.0x normal speed)
    if (lensStartMs > chunkStartMs) {
      segments.push({
        originalStartMs: chunkStartMs,
        originalEndMs: lensStartMs,
        playbackRate: 1.0,
        isTargetBlindspot: false,
      });
    }

    // 2. Micro-lens target segment (0.7x time-stretched)
    if (lensEndMs > lensStartMs) {
      segments.push({
        originalStartMs: lensStartMs,
        originalEndMs: lensEndMs,
        playbackRate: factor,
        isTargetBlindspot: true,
      });
    }

    // 3. Post-blindspot context (1.0x normal speed)
    if (lensEndMs < chunkEndMs) {
      segments.push({
        originalStartMs: lensEndMs,
        originalEndMs: chunkEndMs,
        playbackRate: 1.0,
        isTargetBlindspot: false,
      });
    }

    return segments;
  }

  /**
   * Calculates total wall-clock playtime (in ms) when the scheduled segments are executed.
   */
  public calculateTotalPlayDuration(segments: AcousticLensSegment[]): number {
    return segments.reduce((acc, seg) => {
      const origSpan = seg.originalEndMs - seg.originalStartMs;
      return acc + origSpan / seg.playbackRate;
    }, 0);
  }
}
