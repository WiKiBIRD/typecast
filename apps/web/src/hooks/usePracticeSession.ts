import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { PracticeFSM, TypingEngineCore, ChunkAudioPlayer, ScoringEngine, db, type ChallengeScoreResult, type EpisodeProgressRecord } from '@typecast/core';
import type { Episode, AudioChunk, SentenceStats, PlayerState, KeyResult } from '@typecast/shared-types';

export type TrainingRound = 1 | 2 | 3 | 4;

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
  currentRound: TrainingRound;
  roundCompleted: {
    round1: boolean;
    round2: boolean;
    round3: boolean;
    round4: boolean;
  };
  bestScore?: {
    score: number;
    accuracy: number;
    wpm: number;
    stars: 1 | 2 | 3;
    achievedAt: number;
  };
  challengeResult: ChallengeScoreResult | null;
}

type ViewAction =
  | { type: 'PLAYER_STATE'; state: PlayerState }
  | { type: 'FSM_STATE'; state: string }
  | { type: 'KEY_RESULT'; result: KeyResult; cursor: number; errors: number; consecutive: number }
  | { type: 'SENTENCE_DONE'; stats: SentenceStats; nextIdx: number }
  | { type: 'SET_ROUND'; round: TrainingRound }
  | { type: 'ROUND_FINISHED'; round: TrainingRound }
  | { type: 'CHALLENGE_DONE'; result: ChallengeScoreResult }
  | { type: 'DISMISS_CHALLENGE' }
  | { type: 'LOAD_DB_RECORD'; record: EpisodeProgressRecord }
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
  currentRound: 1,
  roundCompleted: {
    round1: false,
    round2: false,
    round3: false,
    round4: false,
  },
  challengeResult: null,
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
    case 'SET_ROUND':
      return {
        ...state,
        currentRound: action.round,
        currentSentenceIndex: 0,
        cursorIndex: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        completedSentences: [],
        challengeResult: null,
      };
    case 'ROUND_FINISHED': {
      const nextCompleted = { ...state.roundCompleted };
      if (action.round === 1) nextCompleted.round1 = true;
      if (action.round === 2) nextCompleted.round2 = true;
      if (action.round === 3) nextCompleted.round3 = true;
      if (action.round === 4) nextCompleted.round4 = true;
      return { ...state, roundCompleted: nextCompleted };
    }
    case 'CHALLENGE_DONE': {
      const updatedBest = (!state.bestScore || action.result.score > state.bestScore.score)
        ? {
            score: action.result.score,
            accuracy: action.result.accuracy,
            wpm: action.result.wpm,
            stars: action.result.stars as 1 | 2 | 3,
            achievedAt: Date.now(),
          }
        : state.bestScore;

      return {
        ...state,
        challengeResult: action.result,
        bestScore: updatedBest,
        roundCompleted: {
          ...state.roundCompleted,
          round4: action.result.passed ? true : state.roundCompleted.round4,
        },
      };
    }
    case 'DISMISS_CHALLENGE':
      return { ...state, challengeResult: null };
    case 'LOAD_DB_RECORD':
      return {
        ...state,
        currentRound: action.record.currentRound,
        currentSentenceIndex: action.record.currentSentenceIdx,
        roundCompleted: action.record.roundCompleted,
        bestScore: action.record.bestScore,
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
  const currentRoundRef = useRef<TrainingRound>(1);
  const pauseCountRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const [viewState, dispatch] = useReducer(viewReducer, initialViewState);
  const [resumePrompt, setResumePrompt] = useState<string | null>(null);

  const completedSentencesRef = useRef<SentenceStats[]>([]);
  const roundCompletedRef = useRef(viewState.roundCompleted);
  const bestScoreRef = useRef(viewState.bestScore);
  const seekAheadMsRef = useRef<number>(seekAheadMs);
  const audioModeRef = useRef<'web-audio' | 'native'>(audioMode);

  currentRoundRef.current = viewState.currentRound;
  roundCompletedRef.current = viewState.roundCompleted;
  bestScoreRef.current = viewState.bestScore;
  seekAheadMsRef.current = seekAheadMs;
  audioModeRef.current = audioMode;

  // 保存进度至 IndexedDB
  const saveProgressToDb = useCallback(async () => {
    const ep = episodeRef.current;
    if (!ep) return;
    try {
      await db.progress.put({
        episodeId: ep.episodeId,
        currentRound: currentRoundRef.current,
        currentSentenceIdx: sentenceIdxRef.current,
        roundCompleted: roundCompletedRef.current,
        bestScore: bestScoreRef.current,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('保存学习进度到本地数据库失败:', e);
    }
  }, []);

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

    engine.on('sentenceCompleted', async (stats) => {
      const ep = episodeRef.current;
      if (!ep) return;

      const nextIdx = sentenceIdxRef.current + 1;
      const isLast = nextIdx >= ep.sentences.length;

      completedSentencesRef.current.push(stats);
      dispatch({ type: 'SENTENCE_DONE', stats, nextIdx });
      sentenceIdxRef.current = nextIdx;

      if (isLast) {
        // 本轮完成
        const finishedRound = currentRoundRef.current;
        dispatch({ type: 'ROUND_FINISHED', round: finishedRound });

        if (finishedRound === 4) {
          // 结算 Round 4 全文大考成绩
          const elapsedMin = Math.max(0.1, (performance.now() - startTimeRef.current) / 60000);
          const totalChars = ep.sentences.reduce((sum, s) => sum + s.text.length, 0);
          const totalErrors = completedSentencesRef.current.reduce((sum, s) => sum + s.errorCount, 0);
          const totalCorrect = Math.max(0, totalChars - totalErrors);
          const userWpm = Math.round((totalCorrect / 5) / elapsedMin);

          const evalResult = ScoringEngine.evaluateRound4({
            totalCorrectChars: totalCorrect,
            totalChars,
            userWpm,
            standardWpm: 35,
            pauseCount: pauseCountRef.current,
          });

          dispatch({ type: 'CHALLENGE_DONE', result: evalResult });
          player.pause();
        } else {
          // Round 1-3 自动提示晋级下一轮
          const nextRound = (finishedRound + 1) as TrainingRound;
          dispatch({ type: 'SET_ROUND', round: nextRound });
          currentRoundRef.current = nextRound;
          sentenceIdxRef.current = 0;
          completedSentencesRef.current = [];

          const firstSentence = ep.sentences[0]!;
          engine.loadSentence(firstSentence);

          const chunk: AudioChunk = {
            audioUrl: ep.audioUrl,
            startSec: firstSentence.start,
            endSec: firstSentence.end,
            seekAheadMs: seekAheadMsRef.current,
            sentenceId: firstSentence.id,
          };
          fsm.transition('SENTENCE_ADVANCE');
          player.playChunk(chunk);
          player.setLooping(nextRound !== 4);
          fsm.transition('AUDIO_CAN_PLAY');
        }
      } else {
        // 推进到当前轮的下一句
        const nextSentence = ep.sentences[nextIdx]!;
        engine.loadSentence(nextSentence);

        const chunk: AudioChunk = {
          audioUrl: ep.audioUrl,
          startSec: nextSentence.start,
          endSec: nextSentence.end,
          seekAheadMs: seekAheadMsRef.current,
          sentenceId: nextSentence.id,
        };
        fsm.transition('SENTENCE_ADVANCE');
        player.playChunk(chunk);
        // Round 4 持续向前播放，不单句循环
        player.setLooping(currentRoundRef.current !== 4);
        fsm.transition('AUDIO_CAN_PLAY');
      }

      await saveProgressToDb();
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
  }, [saveProgressToDb]);

  // 键盘全局打字捕捉
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const fsm = fsmRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    if (!fsm || !engine || !player) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      // 在 Round 4 暂停/重听会被计入惩罚
      if (currentRoundRef.current === 4) {
        pauseCountRef.current++;
      }
      fsm.transition('TAB_REPLAY');
      player.replayCurrentChunk();
      engine.reset();
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length > 1 && e.key !== 'Backspace') return;

    engine.handleKeyInput(e.key);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 切换轮次
  const selectRound = useCallback((round: TrainingRound) => {
    const ep = episodeRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    if (!ep || !engine || !player) return;

    // 检查是否有前置资格进入 Round 4
    if (round === 4 && (!viewState.roundCompleted.round1 || !viewState.roundCompleted.round2 || !viewState.roundCompleted.round3)) {
      alert('请先完成前 3 轮（明文、模糊、单句盲听）的基础训练，方可解锁 Round 4 全文大挑战！');
      return;
    }

    dispatch({ type: 'SET_ROUND', round });
    currentRoundRef.current = round;
    sentenceIdxRef.current = 0;
    completedSentencesRef.current = [];
    pauseCountRef.current = 0;
    startTimeRef.current = performance.now();

    const firstSentence = ep.sentences[0]!;
    engine.loadSentence(firstSentence);

    const chunk: AudioChunk = {
      audioUrl: ep.audioUrl,
      startSec: firstSentence.start,
      endSec: firstSentence.end,
      seekAheadMs,
      sentenceId: firstSentence.id,
    };
    player.playChunk(chunk);
    player.setLooping(round !== 4);
  }, [seekAheadMs, viewState.roundCompleted]);

  // 加载集数，带 IndexedDB 历史恢复
  const handleEpisodeLoad = useCallback(async (episode: Episode) => {
    const engine = engineRef.current;
    const player = playerRef.current;
    const fsm = fsmRef.current;
    if (!engine || !player || !fsm) return;

    episodeRef.current = episode;
    pauseCountRef.current = 0;
    startTimeRef.current = performance.now();

    // 尝试从 IndexedDB 恢复历史记录
    let targetRound: TrainingRound = 1;
    let targetSentenceIdx = 0;

    try {
      const saved = await db.progress.get(episode.episodeId);
      if (saved) {
        dispatch({ type: 'LOAD_DB_RECORD', record: saved });
        targetRound = saved.currentRound;
        targetSentenceIdx = Math.min(saved.currentSentenceIdx, episode.sentences.length - 1);
        setResumePrompt(`已为您自动恢复至: Round ${targetRound} · 第 ${targetSentenceIdx + 1} 句`);
        setTimeout(() => setResumePrompt(null), 4000);
      }
    } catch (e) {
      console.warn('检索 IndexedDB 失败:', e);
    }

    currentRoundRef.current = targetRound;
    sentenceIdxRef.current = targetSentenceIdx;
    completedSentencesRef.current = [];

    fsm.transition('LOAD');
    const startSentence = episode.sentences[targetSentenceIdx]!;
    engine.loadSentence(startSentence);

    await player.init(episode.audioUrl, audioMode, seekAheadMs);

    const chunk: AudioChunk = {
      audioUrl: episode.audioUrl,
      startSec: startSentence.start,
      endSec: startSentence.end,
      seekAheadMs,
      sentenceId: startSentence.id,
    };
    player.playChunk(chunk);
    player.setLooping(targetRound !== 4);
    fsm.transition('AUDIO_CAN_PLAY');

    dispatch({ type: 'READY' });
  }, [audioMode, seekAheadMs]);

  const handleTabKey = useCallback(() => {
    if (currentRoundRef.current === 4) {
      pauseCountRef.current++;
    }
    fsmRef.current?.transition('TAB_REPLAY');
    playerRef.current?.replayCurrentChunk();
    engineRef.current?.reset();
  }, []);

  const handleReset = useCallback(async () => {
    await saveProgressToDb();
    playerRef.current?.pause();
    engineRef.current?.reset();
    fsmRef.current?.transition('RESET');
    episodeRef.current = null;
    sentenceIdxRef.current = 0;
    completedSentencesRef.current = [];
    dispatch({ type: 'RESET', totalSentences: 0 });
  }, [saveProgressToDb]);

  return {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    selectRound,
    dismissChallengeModal: () => dispatch({ type: 'DISMISS_CHALLENGE' }),
    resumePrompt,
    currentEpisode: episodeRef.current,
    currentSentence: episodeRef.current?.sentences[viewState.currentSentenceIndex] ?? null,
  };
}
