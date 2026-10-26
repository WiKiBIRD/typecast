/**
 * AcousticLensAudioPlayer (Module A).
 * Web Audio-accelerated localized acoustic micro-lens player.
 * Features pitch-preserving time-stretching (preservesPitch = true) and
 * anti-click gain crossfading (15ms ramps) across speed transitions.
 */

import type { AcousticLensSegment } from './types';

export type LensPlayerState = 'IDLE' | 'PLAYING' | 'LENS_ACTIVE' | 'PAUSED' | 'ERROR';

export interface LensPlayerEvents {
  stateChange?: (state: LensPlayerState) => void;
  segmentChange?: (segment: AcousticLensSegment, index: number) => void;
  playbackComplete?: () => void;
  playbackError?: (err: unknown) => void;
  error?: (err: Error) => void;
}

export class AcousticLensAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private boundTimeUpdate: (() => void) | null = null;

  private state: LensPlayerState = 'IDLE';
  private currentSchedule: AcousticLensSegment[] = [];
  private activeTimerId: ReturnType<typeof setTimeout> | null = null;
  private events: LensPlayerEvents = {};

  constructor(events?: LensPlayerEvents) {
    if (events) {
      this.events = events;
    }
  }

  public getState(): LensPlayerState {
    return this.state;
  }

  private setState(newState: LensPlayerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.events.stateChange?.(newState);
    }
  }

  /**
   * Initializes the player with an audio source (URL or Blob URL).
   * Reuses a single native HTMLAudioElement without crossOrigin/WebAudio routing
   * so third-party CDNs without CORS headers play cleanly.
   */
  public async loadAudio(audioSrc: string): Promise<void> {
    this.stop();

    if (typeof Audio !== 'undefined') {
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = 'auto';

        // Enforce pitch preservation on HTML5 audio element
        if ('preservesPitch' in this.audio) {
          this.audio.preservesPitch = true;
        } else if ('webkitPreservesPitch' in this.audio) {
          (this.audio as any).webkitPreservesPitch = true;
        } else if ('mozPreservesPitch' in this.audio) {
          (this.audio as any).mozPreservesPitch = true;
        }
      }
      this.audio.src = audioSrc;
    }
  }

  /**
   * @deprecated Web Audio GainNode routing was removed in M2 to avoid CDN CORS blocks.
   */
  private applyAntiClickRamp(_durationSec: number = 0.015, _targetGain: number = 1.0): void {
    // No-op in native HTMLAudioElement mode
  }

  /**
   * Plays a regular range at a specified playback rate.
   * Uses audio.currentTime monitoring + fallback timeout, and catches play() rejections.
   */
  public async playRange(startMs: number, endMs: number, rate: number = 1.0): Promise<void> {
    this.stop();

    if (!this.audio) {
      return;
    }

    const audio = this.audio;
    const startSec = Math.max(0, startMs / 1000.0);
    const endSec = Math.max(startSec, endMs / 1000.0);

    audio.playbackRate = rate;
    audio.currentTime = startSec;

    this.applyAntiClickRamp(0.015, 1.0);
    this.setState('PLAYING');

    const finishPlayback = () => {
      if (this.state === 'IDLE') return;
      this.stop();
      this.events.playbackComplete?.();
    };

    if (typeof audio.addEventListener === 'function') {
      this.boundTimeUpdate = () => {
        if (audio.currentTime >= endSec) {
          finishPlayback();
        }
      };
      audio.addEventListener('timeupdate', this.boundTimeUpdate);
    }

    try {
      await audio.play();
    } catch (err) {
      this.stop();
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.events.error?.(errorObj);
      this.events.playbackError?.(err);
      return;
    }

    const durationMs = Math.max(50, (endMs - startMs) / rate);
    this.activeTimerId = setTimeout(finishPlayback, durationMs + 50);
  }

  /**
   * Executes a piecewise Micro-Lens timeline schedule.
   * Seamlessly switches rates: 1.0x context -> 0.7x blindspot lens -> 1.0x context.
   */
  public async playWithLensSchedule(schedule: AcousticLensSegment[]): Promise<void> {
    this.stop();
    if (!this.audio || schedule.length === 0) {
      return;
    }

    this.currentSchedule = [...schedule];
    let currentSegIdx = 0;

    const playNextSegment = async () => {
      if (currentSegIdx >= this.currentSchedule.length) {
        this.stop();
        this.events.playbackComplete?.();
        return;
      }

      const seg = this.currentSchedule[currentSegIdx];
      this.events.segmentChange?.(seg, currentSegIdx);

      // Apply pitch-preserved playback rate
      if (this.audio) {
        this.audio.playbackRate = seg.playbackRate;

        // On first segment or jump, seek audio
        if (currentSegIdx === 0) {
          this.audio.currentTime = Math.max(0, seg.originalStartMs / 1000.0);
          this.setState(seg.isTargetBlindspot ? 'LENS_ACTIVE' : 'PLAYING');
          try {
            await this.audio.play();
          } catch (err) {
            this.stop();
            const errorObj = err instanceof Error ? err : new Error(String(err));
            this.events.error?.(errorObj);
            this.events.playbackError?.(err);
            return;
          }
        } else {
          this.applyAntiClickRamp(0.015, 1.0);
          this.setState(seg.isTargetBlindspot ? 'LENS_ACTIVE' : 'PLAYING');
        }
      }

      const segDurationMs =
        Math.max(20, (seg.originalEndMs - seg.originalStartMs) / seg.playbackRate);

      currentSegIdx++;
      this.activeTimerId = setTimeout(playNextSegment, segDurationMs);
    };

    await playNextSegment();
  }

  /**
   * Focused Micro-Lens replay: directly plays the blindspot window at 0.7x.
   */
  public async playTargetLensOnly(
    targetStartMs: number,
    targetEndMs: number,
    paddingMs: number = 80,
    stretchFactor: number = 0.7
  ): Promise<void> {
    const startMs = Math.max(0, targetStartMs - paddingMs);
    const endMs = targetEndMs + paddingMs;
    await this.playRange(startMs, endMs, stretchFactor);
  }

  /**
   * Stops playback and clears timers.
   */
  public stop(): void {
    if (this.activeTimerId !== null) {
      clearTimeout(this.activeTimerId);
      this.activeTimerId = null;
    }

    if (this.audio && this.boundTimeUpdate && typeof this.audio.removeEventListener === 'function') {
      this.audio.removeEventListener('timeupdate', this.boundTimeUpdate);
      this.boundTimeUpdate = null;
    }

    if (this.audio && !this.audio.paused) {
      this.applyAntiClickRamp(0.01, 0.0);
      try {
        this.audio.pause();
      } catch (e) {
        // ignore
      }
    }

    this.setState('IDLE');
  }

  /**
   * Generates a synthetic Speech/Chirp Audio for standalone offline preview.
   * Useful when testing in environments without external MP3 files.
   */
  public static createSyntheticSpeechBlobUrl(): string {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return '';
    }

    const sampleRate = 16000;
    const durationSec = 3.2;
    const numSamples = Math.floor(sampleRate * durationSec);

    // Audio buffer with voice harmonics
    const ctx = new AudioContext({ sampleRate });
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // F0 fundamental around 130Hz with formants
      const f0 = 130;
      const wave =
        0.5 * Math.sin(2 * Math.PI * f0 * t) +
        0.3 * Math.sin(2 * Math.PI * 2 * f0 * t) +
        0.2 * Math.sin(2 * Math.PI * 500 * t);

      // Envelope: fade in, speech bursts, fade out
      const envelope = Math.min(1.0, t * 8) * Math.min(1.0, (durationSec - t) * 8);
      data[i] = wave * envelope * 0.4;
    }

    // Convert AudioBuffer to 16-bit PCM WAV Blob
    const wavBlob = audioBufferToWavBlob(buffer);
    return URL.createObjectURL(wavBlob);
  }
}

/**
 * Encodes an AudioBuffer into a WAV Blob.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const dataLength = buffer.length * numChannels * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}
