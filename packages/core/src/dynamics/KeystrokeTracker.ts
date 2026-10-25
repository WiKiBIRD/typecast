/**
 * KeystrokeTracker (Module A).
 * Millisecond-precision keystroke dynamics collector.
 * Uses high-resolution performance.now() timestamps to compute IKI, dwell time,
 * and flight time without clock-drift vulnerabilities.
 */

import type { RawKeystrokeEvent } from './types';

export interface KeydownRecord {
  eventIndex: number;
  key: string;
  keydownTimestamp: number;
}

export class KeystrokeTracker {
  private events: RawKeystrokeEvent[] = [];
  private lastKeydownTime: number | null = null;
  private lastKeyupTime: number | null = null;
  private activeKeydowns: Map<string, KeydownRecord[]> = new Map();
  private sessionStartTime: number | null = null;

  constructor() {
    this.reset();
  }

  /**
   * Safe timestamp provider: uses performance.now() or falls back to Date.now()
   */
  public now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Resets all internal buffers and state for a new chunk/session.
   */
  public reset(startTime?: number): void {
    this.events = [];
    this.lastKeydownTime = null;
    this.lastKeyupTime = null;
    this.activeKeydowns.clear();
    this.sessionStartTime = startTime ?? this.now();
  }

  /**
   * Records a keydown event.
   * Calculates IKI (Inter-Keystroke Interval) and flight time.
   */
  public recordKeyDown(
    key: string,
    expectedChar: string,
    isCorrect: boolean,
    charIndex?: number,
    customTimestamp?: number
  ): RawKeystrokeEvent {
    const timestamp = customTimestamp ?? this.now();

    if (this.sessionStartTime === null) {
      this.sessionStartTime = timestamp;
    }

    // 1. Calculate IKI (Inter-Keystroke Interval)
    let ikiMs = 0;
    if (this.lastKeydownTime !== null) {
      ikiMs = Math.max(0, timestamp - this.lastKeydownTime);
    } else {
      // First key in the sequence: IKI measured from session start
      ikiMs = Math.max(0, timestamp - this.sessionStartTime);
    }

    // 2. Calculate Flight Time (from previous keyup to this keydown)
    let flightTimeMs = 0;
    if (this.lastKeyupTime !== null) {
      flightTimeMs = Math.max(0, timestamp - this.lastKeyupTime);
    }

    // Create raw event with default dwellTimeMs = 80ms (until keyup occurs)
    const rawEvent: RawKeystrokeEvent = {
      key,
      expectedChar,
      keydownTimestamp: timestamp,
      ikiMs,
      dwellTimeMs: 80, // default estimate if keyup is suppressed or pending
      isCorrect,
      flightTimeMs,
      charIndex,
    };

    const eventIndex = this.events.length;
    this.events.push(rawEvent);

    // Track active keydown for keyup pairing (handling multiple identical keys concurrently)
    const keyRecords = this.activeKeydowns.get(key) || [];
    keyRecords.push({ eventIndex, key, keydownTimestamp: timestamp });
    this.activeKeydowns.set(key, keyRecords);

    this.lastKeydownTime = timestamp;

    return rawEvent;
  }

  /**
   * Records a keyup event.
   * Resolves dwell time for the corresponding keydown event.
   */
  public recordKeyUp(key: string, customTimestamp?: number): RawKeystrokeEvent | null {
    const timestamp = customTimestamp ?? this.now();
    this.lastKeyupTime = timestamp;

    const keyRecords = this.activeKeydowns.get(key);
    if (!keyRecords || keyRecords.length === 0) {
      return null;
    }

    // Pop the matching keydown record (FIFO order)
    const matchingRecord = keyRecords.shift()!;
    if (keyRecords.length === 0) {
      this.activeKeydowns.delete(key);
    }

    const event = this.events[matchingRecord.eventIndex];
    if (event) {
      event.keyupTimestamp = timestamp;
      event.dwellTimeMs = Math.max(1, timestamp - matchingRecord.keydownTimestamp);
      return event;
    }

    return null;
  }

  /**
   * Convenience batch recorder for pre-packaged or simulated key events.
   */
  public recordCompletedKey(
    key: string,
    expectedChar: string,
    isCorrect: boolean,
    ikiMs: number,
    dwellTimeMs: number = 85,
    charIndex?: number,
    baseTimestamp?: number
  ): RawKeystrokeEvent {
    const now = baseTimestamp ?? this.now();
    const keydownTimestamp = this.lastKeydownTime !== null ? this.lastKeydownTime + ikiMs : now;
    const keyupTimestamp = keydownTimestamp + dwellTimeMs;

    const event: RawKeystrokeEvent = {
      key,
      expectedChar,
      keydownTimestamp,
      keyupTimestamp,
      ikiMs,
      dwellTimeMs,
      isCorrect,
      flightTimeMs: Math.max(0, ikiMs - (this.events[this.events.length - 1]?.dwellTimeMs ?? 80)),
      charIndex,
    };

    this.events.push(event);
    this.lastKeydownTime = keydownTimestamp;
    this.lastKeyupTime = keyupTimestamp;

    return event;
  }

  /**
   * Retrieves all recorded raw keystroke events in chronological order.
   */
  public getRawEvents(): RawKeystrokeEvent[] {
    return [...this.events];
  }

  /**
   * Optional DOM event listener attacher for browser UI environments.
   */
  public attach(
    target: Window | HTMLElement,
    getExpectedChar: () => { expectedChar: string; charIndex: number; isCorrect: (key: string) => boolean }
  ): () => void {
    const handleKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Shift' || ke.key === 'Control' || ke.key === 'Alt' || ke.key === 'Meta') {
        return;
      }
      const ctx = getExpectedChar();
      const isCorrect = ctx.isCorrect(ke.key);
      this.recordKeyDown(ke.key, ctx.expectedChar, isCorrect, ctx.charIndex);
    };

    const handleKeyUp = (e: Event) => {
      const ke = e as KeyboardEvent;
      this.recordKeyUp(ke.key);
    };

    target.addEventListener('keydown', handleKeyDown);
    target.addEventListener('keyup', handleKeyUp);

    return () => {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
    };
  }
}
