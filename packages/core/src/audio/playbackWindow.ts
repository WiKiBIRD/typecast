/**
 * PlaybackWindow (Module M0/M1).
 * Pure function seam for computing dynamic pre-roll and post-roll audio boundaries
 * without bleeding into adjacent sentences.
 */

export interface SentenceSpan {
  start: number;
  end: number;
}

export interface PlaybackWindowOptions {
  /** Max pre-roll lead-in in seconds (default: 0.08s = 80ms) */
  maxPreRollSec?: number;
  /** Max post-roll tail in seconds (default: 0.12s = 120ms) */
  maxPostRollSec?: number;
}

export interface PlaybackWindowResult {
  startSec: number;
  endSec: number;
}

/**
 * Computes safe playback start/end timestamps (in seconds) for sentence at `idx`.
 * Stub in M0 (returns raw boundaries); implemented in M1.
 */
export function computePlaybackWindow(
  sentences: readonly SentenceSpan[],
  idx: number,
  durationSec?: number,
  _opts?: PlaybackWindowOptions
): PlaybackWindowResult {
  const current = sentences[idx];
  if (!current) {
    return { startSec: 0, endSec: 0 };
  }
  const startSec = Math.max(0, current.start);
  const endSec = durationSec && durationSec > 0 ? Math.min(durationSec, current.end) : current.end;
  return { startSec, endSec };
}
