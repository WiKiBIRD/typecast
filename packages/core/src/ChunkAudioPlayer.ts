import type {
  AudioChunk,
  PlayerState,
  ChunkPlayerEvents,
} from '@typecast/shared-types';

type ChunkPlayerHandler<K extends keyof ChunkPlayerEvents> = ChunkPlayerEvents[K];
type AudioMode = 'web-audio' | 'native';

export class ChunkAudioPlayer {
  private _mode: AudioMode = 'native';
  private _state: PlayerState = 'IDLE';
  private _currentChunk: AudioChunk | null = null;
  private _looping: boolean = false;
  private _rafId: number | null = null;

  // Native HTMLAudioElement
  private _audio: HTMLAudioElement | null = null;
  private _seekAheadMs: number = 80;

  // Web Audio API
  private _ctx: AudioContext | null = null;
  private _gainNode: GainNode | null = null;
  private _audioBuffer: AudioBuffer | null = null;
  private _source: AudioBufferSourceNode | null = null;
  private _startedAt: number = 0;

  private _listeners: Map<keyof ChunkPlayerEvents, Set<Function>> = new Map();

  get state(): PlayerState { return this._state; }

  get currentTimeSec(): number {
    if (this._mode === 'web-audio' && this._ctx && this._source) {
      return this._ctx.currentTime - this._startedAt;
    }
    return this._audio?.currentTime ?? 0;
  }

  async init(audioUrl: string, mode: AudioMode = 'native', seekAheadMs: number = 80): Promise<void> {
    this._mode = mode;
    this._seekAheadMs = seekAheadMs;
    this._setState('LOADING');

    if (mode === 'web-audio') {
      await this._initWebAudio(audioUrl);
    } else {
      await this._initNative(audioUrl);
    }
  }

  playChunk(chunk: AudioChunk): void {
    this._currentChunk = chunk;
    this._seekAheadMs = chunk.seekAheadMs;

    if (this._mode === 'web-audio') {
      this._playChunkWebAudio(chunk.startSec);
    } else {
      this._playChunkNative(chunk.startSec);
    }

    this._startRaf();
  }

  setLooping(enabled: boolean): void {
    this._looping = enabled;
  }

  pause(): void {
    if (this._mode === 'web-audio') {
      this._ctx?.suspend();
    } else {
      this._audio?.pause();
    }
    this._setState('PAUSED');
  }

  resume(): void {
    if (this._mode === 'web-audio') {
      this._ctx?.resume();
    } else {
      this._audio?.play().catch(err => this._emit('error', err));
    }
    this._setState('PLAYING');
  }

  replayCurrentChunk(): void {
    if (!this._currentChunk) return;
    if (this._mode === 'web-audio') {
      this._seekWithFadeWebAudio(this._currentChunk.startSec);
    } else {
      this._seekWithFadeNative(this._currentChunk.startSec);
    }
  }

  destroy(): void {
    this._stopRaf();
    if (this._mode === 'web-audio') {
      this._source?.stop();
      this._ctx?.close();
    } else {
      if (this._audio) {
        this._audio.pause();
        this._audio.src = '';
        this._audio.remove();
      }
    }
    this._listeners.clear();
  }

  on<K extends keyof ChunkPlayerEvents>(event: K, handler: ChunkPlayerHandler<K>): () => void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof ChunkPlayerEvents>(event: K, handler: ChunkPlayerHandler<K>): void {
    this._listeners.get(event)?.delete(handler);
  }

  private async _initWebAudio(audioUrl: string): Promise<void> {
    this._setState('BUFFERING');
    try {
      this._ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this._gainNode = this._ctx.createGain();
      this._gainNode.connect(this._ctx.destination);

      const response = await fetch(audioUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      this._audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
      this._setState('IDLE');
    } catch (err) {
      this._setState('ERROR');
      this._emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async _initNative(audioUrl: string): Promise<void> {
    this._audio = new Audio();
    // Do not set crossOrigin = 'anonymous' for simple audio playback to prevent CORS blocks on CDNs
    this._audio.preload = 'auto';
    this._audio.src = audioUrl;

    this._setState('BUFFERING');

    const audioElement = this._audio;
    if (!audioElement) {
      this._setState('ERROR');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onCanPlay = () => {
        cleanup();
        this._setState('IDLE');
        resolve();
      };

      const onError = () => {
        cleanup();
        const err = new Error(`Audio load failed: code=${audioElement.error?.code || 'unknown'}`);
        this._setState('ERROR');
        this._emit('error', err);
        reject(err);
      };

      const cleanup = () => {
        audioElement.removeEventListener('canplay', onCanPlay);
        audioElement.removeEventListener('loadeddata', onCanPlay);
        audioElement.removeEventListener('error', onError);
      };

      if (audioElement.readyState >= 2) {
        onCanPlay();
        return;
      }

      audioElement.addEventListener('canplay', onCanPlay);
      audioElement.addEventListener('loadeddata', onCanPlay);
      audioElement.addEventListener('error', onError);
    });
  }

  private _playChunkWebAudio(startSec: number): void {
    if (!this._ctx || !this._audioBuffer || !this._gainNode) return;

    if (this._source) {
      try { this._source.stop(); } catch { /* ignore */ }
      this._source.disconnect();
    }

    this._source = this._ctx.createBufferSource();
    this._source.buffer = this._audioBuffer;
    this._source.connect(this._gainNode);
    this._startedAt = this._ctx.currentTime - startSec;
    this._source.start(0, startSec);
    this._setState('PLAYING');
  }

  private _playChunkNative(startSec: number): void {
    if (!this._audio) return;
    this._audio.currentTime = startSec;
    this._audio.play()
      .then(() => this._setState('PLAYING'))
      .catch(err => this._emit('error', err));
  }

  private async _seekWithFadeWebAudio(targetSec: number): Promise<void> {
    if (!this._ctx || !this._gainNode) return;
    const FADE_MS = 5;
    const now = this._ctx.currentTime;
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);

    await new Promise<void>(r => setTimeout(r, FADE_MS + 2));
    this._playChunkWebAudio(targetSec);

    const t0 = this._ctx.currentTime;
    this._gainNode.gain.setValueAtTime(0, t0);
    this._gainNode.gain.linearRampToValueAtTime(1, t0 + FADE_MS / 1000);
    this._emit('seekComplete', targetSec);
  }

  private async _seekWithFadeNative(targetSec: number): Promise<void> {
    if (!this._audio) return;
    this._audio.pause();
    await new Promise<void>(r => setTimeout(r, 10));
    this._audio.currentTime = targetSec;
    await new Promise<void>(resolve => {
      this._audio!.addEventListener('seeked', () => resolve(), { once: true });
    });
    await this._audio.play();
    this._emit('seekComplete', targetSec);
  }

  private _startRaf(): void {
    this._stopRaf();
    const tick = () => {
      if (!this._currentChunk) return;

      const current = this.currentTimeSec;
      const endWithAhead = this._currentChunk.endSec - this._seekAheadMs / 1000;

      this._emit('timeUpdate', current);

      if (current >= endWithAhead) {
        if (this._looping) {
          if (this._mode === 'web-audio') {
            this._playChunkWebAudio(this._currentChunk.startSec);
          } else {
            this._seekWithFadeNative(this._currentChunk.startSec);
          }
          this._setState('LOOPING');
        } else {
          this._emit('chunkEnd', this._currentChunk.sentenceId);
          this._stopRaf();
          return;
        }
      }

      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _stopRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _setState(state: PlayerState): void {
    if (this._state === state) return;
    this._state = state;
    this._emit('stateChange', state);
  }

  private _emit<K extends keyof ChunkPlayerEvents>(
    event: K,
    ...args: Parameters<ChunkPlayerEvents[K]>
  ): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      (h as (...args: unknown[]) => void)(...args);
    }
  }
}
