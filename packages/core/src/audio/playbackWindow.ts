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
 * Dynamically pads pre-roll and post-roll up to `maxPreRollSec` / `maxPostRollSec`,
 * clamped to half the gap with adjacent sentences so adjacent windows never overlap.
 */
export function computePlaybackWindow(
  sentences: readonly SentenceSpan[],
  idx: number,
  durationSec?: number,
  opts?: PlaybackWindowOptions
): PlaybackWindowResult {
  const current = sentences[idx];
  if (!current) {
    return { startSec: 0, endSec: 0 };
  }

  const maxPreRollSec = opts?.maxPreRollSec ?? 0.08;
  const maxPostRollSec = opts?.maxPostRollSec ?? 0.12;

  const prev = idx > 0 ? sentences[idx - 1] : undefined;
  const next = idx < sentences.length - 1 ? sentences[idx + 1] : undefined;

  const gapPrev = prev ? Math.max(0, current.start - prev.end) : Infinity;
  const gapNext = next ? Math.max(0, next.start - current.end) : Infinity;

  const preRoll = Math.min(maxPreRollSec, gapPrev / 2);
  const postRoll = Math.min(maxPostRollSec, gapNext / 2);

  const startSec = Math.max(0, current.start - preRoll);
  const rawEndSec = current.end + postRoll;
  const effectiveCeiling =
    durationSec !== undefined && durationSec > 0
      ? Math.max(durationSec, current.end)
      : Infinity;
  const endSec = Math.min(effectiveCeiling, rawEndSec);

  return { startSec, endSec };
}
