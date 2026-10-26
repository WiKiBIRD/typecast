import { describe, it, expect } from 'vitest';
import { computePlaybackWindow } from '../audio/playbackWindow';
import fs from 'node:fs';
import path from 'node:path';

describe('computePlaybackWindow (Module M1)', () => {
  it('TC-M1-01: applies full 80ms pre-roll and 120ms post-roll when gaps are ample', () => {
    const sentences = [
      { start: 0.0, end: 2.0 },
      { start: 3.0, end: 5.0 },
      { start: 6.0, end: 8.0 },
    ];
    const win = computePlaybackWindow(sentences, 1, 10.0);
    expect(win.startSec).toBeCloseTo(2.92, 5);
    expect(win.endSec).toBeCloseTo(5.12, 5);
  });

  it('TC-M1-02: clamps pre-roll and post-roll to half the gap when sentences are 50ms apart', () => {
    const sentences = [
      { start: 1.0, end: 2.0 },
      { start: 2.05, end: 3.0 }, // 50ms gap before, 50ms gap after
      { start: 3.05, end: 4.0 },
    ];
    const win0 = computePlaybackWindow(sentences, 0, 10.0);
    const win1 = computePlaybackWindow(sentences, 1, 10.0);
    const win2 = computePlaybackWindow(sentences, 2, 10.0);

    // gap is 0.05s -> half is 0.025s
    expect(win0.endSec).toBeCloseTo(2.025, 5);
    expect(win1.startSec).toBeCloseTo(2.025, 5);
    expect(win1.endSec).toBeCloseTo(3.025, 5);
    expect(win2.startSec).toBeCloseTo(3.025, 5);

    // Strictly non-overlapping
    expect(win0.endSec).toBeLessThanOrEqual(win1.startSec);
    expect(win1.endSec).toBeLessThanOrEqual(win2.startSec);
  });

  it('TC-M1-03: clamps first sentence startSec >= 0 and last sentence endSec <= durationSec', () => {
    const sentences = [
      { start: 0.03, end: 1.5 },
      { start: 2.0, end: 4.95 },
    ];
    const first = computePlaybackWindow(sentences, 0, 5.0);
    const last = computePlaybackWindow(sentences, 1, 5.0);

    expect(first.startSec).toBe(0);
    expect(last.endSec).toBe(5.0);
  });

  it('TC-M1-04: guarantees zero adjacent window overlap across all 375 real episode JSON files', () => {
    const episodesDir = path.resolve(__dirname, '../../../../apps/web/public/data/episodes');
    if (!fs.existsSync(episodesDir)) {
      return;
    }
    const files = fs.readdirSync(episodesDir).filter(f => f.endsWith('.json') && f !== 'index.json');
    expect(files.length).toBe(375);

    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(episodesDir, file), 'utf-8'));
      const sentences: Array<{ start: number; end: number }> = raw.sentences;
      const duration: number | undefined = raw.duration;

      let prevEnd = -1;
      for (let i = 0; i < sentences.length; i++) {
        const win = computePlaybackWindow(sentences, i, duration);
        expect(win.startSec).toBeGreaterThanOrEqual(0);
        expect(win.startSec).toBeLessThanOrEqual(sentences[i]!.start);
        expect(win.endSec).toBeGreaterThanOrEqual(sentences[i]!.end);
        if (prevEnd >= 0) {
          expect(win.startSec).toBeGreaterThanOrEqual(prevEnd - 1e-9);
        }
        prevEnd = win.endSec;
      }
    }
  });
});
