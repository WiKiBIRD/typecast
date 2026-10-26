import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChunkAudioPlayer } from '../ChunkAudioPlayer';
import type { AudioChunk } from '@typecast/shared-types';

describe('ChunkAudioPlayer: Pause/Resume & Playback Control (Module M3)', () => {
  let player: ChunkAudioPlayer;
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    player = new ChunkAudioPlayer();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
  });

  it('starts in IDLE state', () => {
    expect(player.state).toBe('IDLE');
  });

  it('sets state to PAUSED and cleans up RAF when pause() is called', () => {
    const states: string[] = [];
    player.on('stateChange', (st) => states.push(st));

    player.pause();
    expect(player.state).toBe('PAUSED');
    expect(states).toContain('PAUSED');
  });

  it('sets state to PLAYING when resume() is called', () => {
    const states: string[] = [];
    player.on('stateChange', (st) => states.push(st));

    player.pause();
    expect(player.state).toBe('PAUSED');

    player.resume();
    expect(player.state).toBe('PLAYING');
    expect(states).toEqual(['PAUSED', 'PLAYING']);
  });

  it('destroys cleanly without errors', () => {
    expect(() => player.destroy()).not.toThrow();
  });

  it('TC-M3-01: pauses native audio, sets state to IDLE, and emits chunkEnd when non-looping chunk reaches endSec via timeupdate', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    let mockAudioInstance: any = null;

    class MockAudio {
      src = '';
      preload = '';
      readyState = 4;
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      remove = vi.fn();
      addEventListener = vi.fn((evt: string, cb: () => void) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt]!.push(cb);
      });
      removeEventListener = vi.fn((evt: string, cb: () => void) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt]!.filter(fn => fn !== cb);
        }
      });
      constructor() {
        mockAudioInstance = this;
      }
    }
    globalThis.Audio = MockAudio as any;

    await player.init('https://cdn.example.com/ep1.mp3', 'native', 80);
    player.setLooping(false);

    const chunkEnds: number[] = [];
    player.on('chunkEnd', (id) => chunkEnds.push(id));

    const chunk: AudioChunk = {
      audioUrl: 'https://cdn.example.com/ep1.mp3',
      startSec: 2.0,
      endSec: 4.5,
      seekAheadMs: 80,
      sentenceId: 7,
    };

    player.playChunk(chunk);
    expect(player.state).toBe('PLAYING');
    expect(mockAudioInstance.currentTime).toBe(2.0);

    // Simulate background tab where RAF doesn't run, but HTMLAudioElement fires timeupdate at 4.52s
    mockAudioInstance.currentTime = 4.52;
    for (const cb of listeners['timeupdate'] || []) {
      cb();
    }

    expect(mockAudioInstance.pause).toHaveBeenCalledTimes(1);
    expect(player.state).toBe('IDLE');
    expect(chunkEnds).toEqual([7]);
  });

  it('TC-M3-02: loops back to startSec when looping is true and timeupdate reaches endSec', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    let mockAudioInstance: any = null;

    class MockAudio {
      src = '';
      preload = '';
      readyState = 4;
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      remove = vi.fn();
      addEventListener = vi.fn((evt: string, cb: () => void) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt]!.push(cb);
      });
      removeEventListener = vi.fn();
      constructor() {
        mockAudioInstance = this;
      }
    }
    globalThis.Audio = MockAudio as any;

    await player.init('https://cdn.example.com/ep1.mp3', 'native', 80);
    player.setLooping(true);

    const chunk: AudioChunk = {
      audioUrl: 'https://cdn.example.com/ep1.mp3',
      startSec: 1.5,
      endSec: 3.0,
      seekAheadMs: 80,
      sentenceId: 2,
    };

    player.playChunk(chunk);
    mockAudioInstance.currentTime = 3.01;
    for (const cb of listeners['timeupdate'] || []) {
      cb();
    }

    expect(mockAudioInstance.currentTime).toBe(1.5);
    expect(mockAudioInstance.pause).not.toHaveBeenCalled();
  });
});
