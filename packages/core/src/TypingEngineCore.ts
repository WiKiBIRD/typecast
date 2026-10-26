import type {
  Sentence,
  KeyResult,
  JudgeMode,
  SentenceStats,
  TypingEngineEvents,
  TypingEngineConfig,
} from '@typecast/shared-types';

type EventListener<T extends keyof TypingEngineEvents> = TypingEngineEvents[T];

const DEFAULT_SKIP_CHARS: Set<string> = new Set([
  ',', '.', '!', '?', ';', ':', '"', "'", '—', '-',
  '(', ')', '[', ']', '…', '\'',
]);

export class TypingEngineCore {
  private _config: TypingEngineConfig;
  private _sentence: Sentence | null = null;
  private _cursorIndex: number = 0;
  private _errorCount: number = 0;
  private _correctCount: number = 0;
  private _startTime: number | null = null;
  private _consecutiveErrors: number = 0;

  private _listeners: Map<keyof TypingEngineEvents, Set<Function>> = new Map();

  constructor(config?: Partial<TypingEngineConfig>) {
    this._config = {
      judgeMode: config?.judgeMode ?? 'LENIENT',
      skipChars: config?.skipChars ?? DEFAULT_SKIP_CHARS,
    };
  }

  get cursorIndex(): number { return this._cursorIndex; }
  get errorCount(): number { return this._errorCount; }
  get consecutiveErrors(): number { return this._consecutiveErrors; }
  get judgeMode(): JudgeMode { return this._config.judgeMode; }
  get hasSentence(): boolean { return this._sentence !== null; }

  getCompletedText(): string {
    if (!this._sentence) return '';
    return this._sentence.text.slice(0, this._cursorIndex);
  }

  getRemainingText(): string {
    if (!this._sentence) return '';
    return this._sentence.text.slice(this._cursorIndex);
  }

  loadSentence(sentence: Sentence): void {
    this._sentence = sentence;
    this._cursorIndex = 0;
    this._errorCount = 0;
    this._correctCount = 0;
    this._consecutiveErrors = 0;
    this._startTime = null;
    this._emit('reset');
  }

  reset(): void {
    this._cursorIndex = 0;
    this._errorCount = 0;
    this._correctCount = 0;
    this._consecutiveErrors = 0;
    this._startTime = null;
    this._emit('reset');
  }

  handleKeyInput(key: string): KeyResult {
    if (!this._sentence) return 'WRONG';

    if (key === 'Tab' || key === 'Escape') return 'SKIP';

    if (key === 'Backspace') {
      this._consecutiveErrors = 0;
      return 'CORRECT';
    }

    const text = this._sentence.text;

    if (this._cursorIndex >= text.length) return 'CORRECT';

    if (this._startTime === null && this._cursorIndex === 0) {
      this._startTime = performance.now();
    }

    // LENIENT mode pre-skip punctuation
    if (this._config.judgeMode === 'LENIENT') {
      while (
        this._cursorIndex < text.length &&
        this._config.skipChars.has(text[this._cursorIndex] as string) &&
        text[this._cursorIndex] !== ' '
      ) {
        this._cursorIndex++;
        this._correctCount++;
      }
    }

    if (this._cursorIndex >= text.length) {
      const stats = this.computeStats();
      this._emit('sentenceCompleted', stats);
      return 'COMPLETED';
    }

    const currentExpected = text[this._cursorIndex] as string;
    const matches = this._matchChar(key, currentExpected);

    if (matches) {
      this._cursorIndex++;
      this._correctCount++;
      this._consecutiveErrors = 0;

      this._emit('keyResult', 'CORRECT', this._cursorIndex - 1, currentExpected);

      if (this._config.judgeMode === 'LENIENT') {
        while (
          this._cursorIndex < text.length &&
          (this._config.skipChars.has(text[this._cursorIndex] as string) || text[this._cursorIndex] === ' ')
        ) {
          // If it's a space following punctuation, skip it too so user can type the next word directly
          this._cursorIndex++;
          this._correctCount++;
        }
      }

      if (this._cursorIndex >= text.length) {
        const stats = this.computeStats();
        this._emit('sentenceCompleted', stats);
        return 'COMPLETED';
      }

      return 'CORRECT';
    } else {
      this._errorCount++;
      this._consecutiveErrors++;
      this._emit('mismatch', currentExpected, key, this._consecutiveErrors);
      this._emit('keyResult', 'WRONG', this._cursorIndex, currentExpected);
      return 'WRONG';
    }
  }

  computeStats(): SentenceStats {
    if (!this._sentence) {
      return { sentenceId: -1, wpm: 0, accuracy: 0, elapsedMs: 0, errorCount: 0, totalChars: 0 };
    }

    const elapsedMs = this._startTime !== null
      ? performance.now() - this._startTime
      : 0;

    const totalChars = this._sentence.text.length;
    const wpm = elapsedMs > 0
      ? Math.round((this._correctCount / 5) / (elapsedMs / 60000))
      : 0;

    const accuracy = (this._correctCount + this._errorCount) > 0
      ? Math.max(0, this._correctCount / (this._correctCount + this._errorCount))
      : 1;

    return {
      sentenceId: this._sentence.id,
      wpm,
      accuracy,
      elapsedMs,
      errorCount: this._errorCount,
      totalChars,
    };
  }

  on<K extends keyof TypingEngineEvents>(event: K, handler: EventListener<K>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof TypingEngineEvents>(event: K, handler: EventListener<K>): void {
    this._listeners.get(event)?.delete(handler);
  }

  destroy(): void {
    this._listeners.clear();
    this._sentence = null;
  }

  private _matchChar(input: string, expected: string): boolean {
    if (input === expected) return true;
    if (input === "'" && (expected === '\u2019' || expected === '\u2018')) return true;
    if (input === '"' && (expected === '\u201c' || expected === '\u201d')) return true;
    if (this._config.judgeMode === 'STRICT') {
      return false;
    }
    return input.toLowerCase() === expected.toLowerCase();
  }

  private _emit<K extends keyof TypingEngineEvents>(
    event: K,
    ...args: Parameters<TypingEngineEvents[K]>
  ): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      (h as (...args: unknown[]) => void)(...args);
    }
  }
}

/**
 * Pure keystroke guard (Module M5).
 * Determines whether a global `keydown` event should be captured by the practice session
 * rather than handled natively by browser inputs (e.g. episode search bar).
 */
export function shouldCaptureKeystroke(
  target: EventTarget | null,
  isSessionReady: boolean
): boolean {
  if (!isSessionReady) {
    return false;
  }
  if (target && typeof target === 'object') {
    const el = target as {
      tagName?: string;
      id?: string;
      isContentEditable?: boolean;
    };
    const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' && el.id !== 'typecast-hidden-input') {
      return false;
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT') {
      return false;
    }
    if (el.isContentEditable) {
      return false;
    }
  }
  return true;
}
