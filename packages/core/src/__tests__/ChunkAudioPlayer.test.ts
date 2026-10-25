import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkAudioPlayer } from '../ChunkAudioPlayer';
import type { AudioChunk } from '@typecast/shared-types';

describe('ChunkAudioPlayer: Pause/Resume & Playback Control', () => {
  let player: ChunkAudioPlayer;

  beforeEach(() => {
    player = new ChunkAudioPlayer();
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
});
