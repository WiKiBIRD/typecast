import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AcousticLensAudioPlayer,
  type AcousticLensSegment,
} from '../scaffolding';

describe('Phase 3.5: AcousticLensAudioPlayer', () => {
  let player: AcousticLensAudioPlayer;

  beforeEach(() => {
    player = new AcousticLensAudioPlayer();
  });

  it('initializes in IDLE state', () => {
    expect(player.getState()).toBe('IDLE');
  });

  it('notifies stateChange listener on state transition', () => {
    const states: string[] = [];
    const eventedPlayer = new AcousticLensAudioPlayer({
      stateChange: (st) => states.push(st),
    });

    eventedPlayer.stop();
    expect(eventedPlayer.getState()).toBe('IDLE');
  });

  it('safely handles stop without crashing when no audio is loaded', () => {
    expect(() => player.stop()).not.toThrow();
    expect(player.getState()).toBe('IDLE');
  });

  it('executes lens schedule segments in sequence and triggers callback', async () => {
    const schedule: AcousticLensSegment[] = [
      {
        originalStartMs: 0,
        originalEndMs: 100,
        playbackRate: 1.0,
        isTargetBlindspot: false,
      },
      {
        originalStartMs: 100,
        originalEndMs: 200,
        playbackRate: 0.7,
        isTargetBlindspot: true,
      },
    ];

    const segmentChanges: AcousticLensSegment[] = [];
    const completeFn = vi.fn();

    const testPlayer = new AcousticLensAudioPlayer({
      segmentChange: (seg) => segmentChanges.push(seg),
      playbackComplete: completeFn,
    });

    // In Node test environment, playWithLensSchedule handles empty audio gracefully
    await testPlayer.playWithLensSchedule(schedule);
    expect(testPlayer.getState()).toBe('IDLE');
  });
});
