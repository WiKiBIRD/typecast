import { useEffect, useReducer, useRef, useCallback } from 'react';
import { PracticeFSM, TypingEngineCore, ChunkAudioPlayer } from '@typecast/core';
import type { Episode, AudioChunk, SentenceStats, PlayerState, KeyResult } from '@typecast/shared-types';

export interface PracticeViewState {
  playerState: PlayerState;
  fsmState: string;
  cursorIndex: number;
  errorCount: number;
  consecutiveErrors: number;
  lastKeyResult: KeyResult | null;
  currentSentenceIndex: number;
  completedSentences: SentenceStats[];
  isReady: boolean;
}

type ViewAction =
  | { type: 'PLAYER_STATE'; state: PlayerState }
  | { type: 'FSM_STATE'; state: string }
  | { type: 'KEY_RESULT'; result: KeyResult; cursor: number; errors: number; consecutive: number }
  | { type: 'SENTENCE_DONE'; stats: SentenceStats; nextIdx: number }
  | { type: 'RESET'; totalSentences: number }
  | { type: 'READY' };

const initialViewState: PracticeViewState = {
  playerState: 'IDLE',
  fsmState: 'IDLE',
  cursorIndex: 0,
  errorCount: 0,
  consecutiveErrors: 0,
  lastKeyResult: null,
  currentSentenceIndex: 0,
  completedSentences: [],
  isReady: false,
};

function viewReducer(state: PracticeViewState, action: ViewAction): PracticeViewState {
  switch (action.type) {
    case 'PLAYER_STATE':
      return { ...state, playerState: action.state };
    case 'FSM_STATE':
      return { ...state, fsmState: action.state };
    case 'KEY_RESULT':
      return {
        ...state,
        lastKeyResult: action.result,
        cursorIndex: action.cursor,
        errorCount: action.errors,
        consecutiveErrors: action.consecutive,
      };
    case 'SENTENCE_DONE':
      return {
        ...state,
        completedSentences: [...state.completedSentences, action.stats],
        currentSentenceIndex: action.nextIdx,
        cursorIndex: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        lastKeyResult: null,
      };
    case 'RESET':
      return { ...initialViewState };
    case 'READY':
      return { ...state, isReady: true };
    default:
      return state;
  }
}

export function usePracticeSession(seekAheadMs: number = 80, audioMode: 'web-audio' | 'native' = 'native') {
  const engineRef = useRef<TypingEngineCore | null>(null);
  const playerRef = useRef<ChunkAudioPlayer | null>(null);
  const fsmRef = useRef<PracticeFSM | null>(null);
  const episodeRef = useRef<Episode | null>(null);
  const sentenceIdxRef = useRef<number>(0);

  const [viewState, dispatch] = useReducer(viewReducer, initialViewState);

  useEffect(() => {
    const engine = new TypingEngineCore({ judgeMode: 'LENIENT' });
    const player = new ChunkAudioPlayer();
    const fsm = new PracticeFSM(150);

    engineRef.current = engine;
    playerRef.current = player;
    fsmRef.current = fsm;

    engine.on('keyResult', (result) => {
      dispatch({
        type: 'KEY_RESULT',
        result,
        cursor: engine.cursorIndex,
        errors: engine.errorCount,
        consecutive: engine.consecutiveErrors,
      });
      if (result === 'WRONG') {
        fsm.transition('KEY_WRONG');
      } else if (result !== 'SKIP') {
        fsm.transition('KEY_CORRECT');
      }
    });

    engine.on('sentenceCompleted', (stats) => {
      const ep = episodeRef.current;
      if (!ep) return;

      const nextIdx = sentenceIdxRef.current + 1;
      const isLast = nextIdx >= ep.sentences.length;

      dispatch({ type: 'SENTENCE_DONE', stats, nextIdx });

      if (isLast) {
        fsm.transition('EPISODE_COMPLETE');
      } else {
        fsm.transition('SENTENCE_ADVANCE');
        sentenceIdxRef.current = nextIdx;
        const nextSentence = ep.sentences[nextIdx]!;
        engine.loadSentence(nextSentence);

        const chunk: AudioChunk = {
          audioUrl: ep.audioUrl,
          startSec: nextSentence.start,
          endSec: nextSentence.end,
          seekAheadMs: seekAheadMs,
          sentenceId: nextSentence.id,
        };
        player.playChunk(chunk);
        player.setLooping(true);
      }
    });

    player.on('stateChange', (state) => {
      dispatch({ type: 'PLAYER_STATE', state });
      if (state === 'PLAYING') fsm.transition('AUDIO_CAN_PLAY');
      if (state === 'ERROR') fsm.transition('ERROR_OCCURRED');
    });

    const unsubFSM = fsm.on((_from, to) => {
      dispatch({ type: 'FSM_STATE', state: to });
    });

    return () => {
      engine.destroy();
      player.destroy();
      fsm.destroy();
      unsubFSM();
    };
  }, [seekAheadMs, audioMode]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const fsm = fsmRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    if (!fsm || !engine || !player) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      fsm.transition('TAB_REPLAY');
      player.replayCurrentChunk();
      engine.reset();
      return;
    }

    // Ignore modifier keys
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length > 1 && e.key !== 'Backspace') return;

    // Direct input processing
    engine.handleKeyInput(e.key);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleEpisodeLoad = useCallback(async (episode: Episode) => {
    const engine = engineRef.current;
    const player = playerRef.current;
    const fsm = fsmRef.current;
    if (!engine || !player || !fsm) return;

    episodeRef.current = episode;
    sentenceIdxRef.current = 0;

    fsm.transition('LOAD');
    dispatch({ type: 'RESET', totalSentences: episode.sentences.length });

    const firstSentence = episode.sentences[0]!;
    engine.loadSentence(firstSentence);

    await player.init(episode.audioUrl, audioMode, seekAheadMs);

    const chunk: AudioChunk = {
      audioUrl: episode.audioUrl,
      startSec: firstSentence.start,
      endSec: firstSentence.end,
      seekAheadMs: seekAheadMs,
      sentenceId: firstSentence.id,
    };
    player.playChunk(chunk);
    player.setLooping(true);
    fsm.transition('AUDIO_CAN_PLAY');

    dispatch({ type: 'READY' });
  }, [audioMode, seekAheadMs]);

  const handleTabKey = useCallback(() => {
    fsmRef.current?.transition('TAB_REPLAY');
    playerRef.current?.replayCurrentChunk();
    engineRef.current?.reset();
  }, []);

  const handleReset = useCallback(() => {
    playerRef.current?.pause();
    engineRef.current?.reset();
    fsmRef.current?.transition('RESET');
    episodeRef.current = null;
    sentenceIdxRef.current = 0;
    dispatch({ type: 'RESET', totalSentences: 0 });
  }, []);

  return {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    currentEpisode: episodeRef.current,
    currentSentence: episodeRef.current?.sentences[viewState.currentSentenceIndex] ?? null,
  };
}
