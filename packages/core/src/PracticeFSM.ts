type TransitionHandler = (from: PracticeState, to: PracticeState, event: FSMEvent) => void;

export type PracticeState =
  | 'IDLE'
  | 'LOADING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'KEY_MISMATCH'
  | 'REPLAY_LOOP'
  | 'COMPLETED_SENTENCE'
  | 'COMPLETED'
  | 'ERROR';

export type FSMEvent =
  | 'LOAD'
  | 'AUDIO_CAN_PLAY'
  | 'KEY_CORRECT'
  | 'KEY_WRONG'
  | 'MISMATCH_TIMEOUT'
  | 'TAB_REPLAY'
  | 'SENTENCE_ADVANCE'
  | 'EPISODE_COMPLETE'
  | 'ERROR_OCCURRED'
  | 'RESET';

const TRANSITIONS: ReadonlyMap<PracticeState, ReadonlyMap<FSMEvent, PracticeState>> = new Map([
  ['IDLE', new Map<FSMEvent, PracticeState>([
    ['LOAD', 'LOADING'],
    ['RESET', 'IDLE'],
  ])],
  ['LOADING', new Map<FSMEvent, PracticeState>([
    ['AUDIO_CAN_PLAY', 'PLAYING'],
    ['ERROR_OCCURRED', 'ERROR'],
    ['RESET', 'IDLE'],
  ])],
  ['BUFFERING', new Map<FSMEvent, PracticeState>([
    ['AUDIO_CAN_PLAY', 'PLAYING'],
    ['ERROR_OCCURRED', 'ERROR'],
    ['RESET', 'IDLE'],
  ])],
  ['PLAYING', new Map<FSMEvent, PracticeState>([
    ['KEY_CORRECT', 'PLAYING'],
    ['KEY_WRONG', 'KEY_MISMATCH'],
    ['TAB_REPLAY', 'REPLAY_LOOP'],
    ['SENTENCE_ADVANCE', 'COMPLETED_SENTENCE'],
    ['EPISODE_COMPLETE', 'COMPLETED'],
    ['ERROR_OCCURRED', 'ERROR'],
    ['RESET', 'IDLE'],
  ])],
  ['KEY_MISMATCH', new Map<FSMEvent, PracticeState>([
    ['MISMATCH_TIMEOUT', 'PLAYING'],
    ['TAB_REPLAY', 'REPLAY_LOOP'],
    ['RESET', 'IDLE'],
  ])],
  ['REPLAY_LOOP', new Map<FSMEvent, PracticeState>([
    ['KEY_CORRECT', 'PLAYING'],
    ['KEY_WRONG', 'KEY_MISMATCH'],
    ['TAB_REPLAY', 'REPLAY_LOOP'],
    ['RESET', 'IDLE'],
  ])],
  ['COMPLETED_SENTENCE', new Map<FSMEvent, PracticeState>([
    ['SENTENCE_ADVANCE', 'PLAYING'],
    ['AUDIO_CAN_PLAY', 'PLAYING'],
    ['EPISODE_COMPLETE', 'COMPLETED'],
    ['ERROR_OCCURRED', 'ERROR'],
    ['RESET', 'IDLE'],
  ])],
  ['COMPLETED', new Map<FSMEvent, PracticeState>([
    ['LOAD', 'LOADING'],
    ['RESET', 'IDLE'],
  ])],
  ['ERROR', new Map<FSMEvent, PracticeState>([
    ['LOAD', 'LOADING'],
    ['RESET', 'IDLE'],
  ])],
]);

const KEYBOARD_BLOCKED_STATES: ReadonlySet<PracticeState> = new Set([
  'IDLE',
  'LOADING',
  'COMPLETED',
  'ERROR',
]);

export class PracticeFSM {
  private _state: PracticeState = 'IDLE';
  private _listeners: TransitionHandler[] = [];
  private _mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly mismatchBlockMs: number;

  constructor(mismatchBlockMs = 150) {
    this.mismatchBlockMs = mismatchBlockMs;
  }

  get state(): PracticeState {
    return this._state;
  }

  can(event: FSMEvent): boolean {
    return TRANSITIONS.get(this._state)?.has(event) ?? false;
  }

  isKeyboardBlocked(): boolean {
    return KEYBOARD_BLOCKED_STATES.has(this._state);
  }

  transition(event: FSMEvent): boolean {
    const nextState = TRANSITIONS.get(this._state)?.get(event);
    if (nextState === undefined) {
      return false;
    }

    const prevState = this._state;
    this._state = nextState;

    if (nextState === 'KEY_MISMATCH') {
      if (this._mismatchTimer) clearTimeout(this._mismatchTimer);
      this._mismatchTimer = setTimeout(() => {
        this.transition('MISMATCH_TIMEOUT');
      }, this.mismatchBlockMs);
    } else if (prevState === 'KEY_MISMATCH') {
      if (this._mismatchTimer) {
        clearTimeout(this._mismatchTimer);
        this._mismatchTimer = null;
      }
    }

    for (const listener of this._listeners) {
      listener(prevState, nextState, event);
    }

    return true;
  }

  on(handler: TransitionHandler): () => void {
    this._listeners.push(handler);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== handler);
    };
  }

  destroy(): void {
    if (this._mismatchTimer) {
      clearTimeout(this._mismatchTimer);
      this._mismatchTimer = null;
    }
    this._listeners = [];
  }
}
