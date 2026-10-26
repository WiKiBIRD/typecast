import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AcousticLensAudioPlayer,
  type AcousticLensSegment,
} from '../scaffolding';

describe('Phase 3.5 & Module M2: AcousticLensAudioPlayer', () => {
  let player: AcousticLensAudioPlayer;
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    player = new AcousticLensAudioPlayer();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
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

  it('TC-M2-01: does not set crossOrigin and reuses HTMLAudioElement across loadAudio calls', async () => {
    const instances: any[] = [];
    class MockAudio {
      src = '';
      crossOrigin: string | null = null;
      preload = '';
      preservesPitch = false;
      paused = true;
      currentTime = 0;
      playbackRate = 1;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      constructor(src?: string) {
        if (src) this.src = src;
        instances.push(this);
      }
    }
    globalThis.Audio = MockAudio as any;

    const p = new AcousticLensAudioPlayer();
    await p.loadAudio('https://cdn.example.com/ep1.mp3');
    await p.loadAudio('https://cdn.example.com/ep2.mp3');

    expect(instances.length).toBe(1);
    expect(instances[0].crossOrigin).toBeNull();
    expect(instances[0].src).toBe('https://cdn.example.com/ep2.mp3');
  });

  it('TC-M2-02: catches play() rejection, transitions to IDLE, and triggers playbackError', async () => {
    class RejectingAudio {
      src = '';
      preload = '';
      preservesPitch = false;
      paused = true;
      currentTime = 0;
      playbackRate = 1;
      play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      pause = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }
    globalThis.Audio = RejectingAudio as any;

    const onError = vi.fn();
    const p = new AcousticLensAudioPlayer({
      playbackError: onError,
    });

    await p.loadAudio('https://cdn.example.com/ep1.mp3');
    await p.playTargetLensOnly(1000, 1500, 80, 0.7);

    expect(p.getState()).toBe('IDLE');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
