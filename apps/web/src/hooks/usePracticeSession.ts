import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import {
  PracticeFSM,
  TypingEngineCore,
  shouldCaptureKeystroke,
  ChunkAudioPlayer,
  ScoringEngine,
  db,
  saveProgress,
  sentenceToAcousticChunk,
  KeystrokeTracker,
  AcousticCharMapper,
  CognitiveBottleneckClassifier,
  ScaffoldStateMachine,
  AcousticFSRSEngine,
  AcousticMetricsExporter,
  AcousticLensAudioPlayer,
  acousticStorage,
  ScaffoldLevel,
  gradeSentencePractice,
  type PhenomenonType,
  computePlaybackWindow,
  type ChallengeScoreResult,
  type EpisodeProgressRecord,
  type AcousticChunkData,
  type WordScaffoldState,
  type AcousticRadarProfile,
  type CognitiveState,
} from '@typecast/core';
import type { Episode, AudioChunk, SentenceStats, PlayerState, KeyResult, Sentence } from '@typecast/shared-types';

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
  // Acoustic additions
  currentAcousticChunk: AcousticChunkData | null;
  activeScaffoldState: WordScaffoldState | undefined;
  isLensActive: boolean;
  radarProfile: AcousticRadarProfile | null;
  cognitiveState: CognitiveState;
}

type ViewAction =
  | { type: 'PLAYER_STATE'; state: PlayerState }
  | { type: 'FSM_STATE'; state: string }
  | { type: 'KEY_RESULT'; result: KeyResult; cursor: number; errors: number; consecutive: number }
  | { type: 'SENTENCE_DONE'; stats: SentenceStats; nextIdx: number }
  | { type: 'SET_ROUND'; round: TrainingRound }
  | { type: 'ROUND_FINISHED'; round: TrainingRound }
  | {
      type: 'CHALLENGE_DONE';
      result: ChallengeScoreResult;
      radarProfile?: AcousticRadarProfile;
      bestScore?: PracticeViewState['bestScore'];
    }
  | { type: 'DISMISS_CHALLENGE' }
  | { type: 'LOAD_DB_RECORD'; record: EpisodeProgressRecord }
  | { type: 'INIT_SESSION'; sentenceIdx: number; round: TrainingRound }
  | { type: 'RESET'; totalSentences: number }
  | { type: 'READY' }
  | { type: 'SET_ACOUSTIC_CHUNK'; chunk: AcousticChunkData }
  | { type: 'SET_SCAFFOLD'; scaffold: WordScaffoldState | undefined }
  | { type: 'SET_LENS_ACTIVE'; active: boolean }
  | { type: 'SET_COGNITIVE_STATE'; state: CognitiveState }
  | { type: 'INIT_RADAR_PROFILE'; radarProfile: AcousticRadarProfile };

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
  currentAcousticChunk: null,
  activeScaffoldState: undefined,
  isLensActive: false,
  radarProfile: null,
  cognitiveState: 'NORMAL_FLOW',
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
        activeScaffoldState: undefined,
        isLensActive: false,
      };
    case 'SET_ROUND':
      return { ...state, currentRound: action.round };
    case 'ROUND_FINISHED':
      return {
        ...state,
        roundCompleted: {
          ...state.roundCompleted,
          [`round${action.round}`]: true,
        },
      };
    case 'CHALLENGE_DONE': {
      let nextBest = state.bestScore;
      if (action.bestScore) {
        if (!nextBest || action.bestScore.score >= nextBest.score) {
          nextBest = action.bestScore;
        }
      }
      return {
        ...state,
        challengeResult: action.result,
        radarProfile: action.radarProfile ?? state.radarProfile,
        bestScore: nextBest,
      };
    }
    case 'DISMISS_CHALLENGE':
      return { ...state, challengeResult: null };
    case 'LOAD_DB_RECORD': {
      const { bestScore, roundCompleted, currentSentenceIdx, currentRound } = action.record;
      return {
        ...state,
        bestScore,
        currentRound: (currentRound as TrainingRound) ?? state.currentRound,
        roundCompleted: {
          round1: roundCompleted?.round1 ?? false,
          round2: roundCompleted?.round2 ?? false,
          round3: roundCompleted?.round3 ?? false,
          round4: roundCompleted?.round4 ?? false,
        },
        currentSentenceIndex: currentSentenceIdx ?? 0,
      };
    }
    case 'INIT_SESSION':
      return {
        ...state,
        cursorIndex: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        lastKeyResult: null,
        completedSentences: [],
        currentSentenceIndex: action.sentenceIdx,
        currentRound: action.round,
        isReady: true,
      };
    case 'RESET':
      return {
        ...initialViewState,
        isReady: false,
      };
    case 'READY':
      return { ...state, isReady: true };
    case 'SET_ACOUSTIC_CHUNK':
      return { ...state, currentAcousticChunk: action.chunk };
    case 'SET_SCAFFOLD':
      return { ...state, activeScaffoldState: action.scaffold };
    case 'SET_LENS_ACTIVE':
      return { ...state, isLensActive: action.active };
    case 'SET_COGNITIVE_STATE':
      return { ...state, cognitiveState: action.state };
    case 'INIT_RADAR_PROFILE':
      return { ...state, radarProfile: action.radarProfile };
    default:
      return state;
  }
}

export function buildAudioChunk(
  ep: Episode,
  sentenceIdx: number,
  seekAheadMs: number = 80
): AudioChunk {
  const sentence = ep.sentences[sentenceIdx] || ep.sentences[0]!;
  const resolvedIdx = ep.sentences[sentenceIdx] ? sentenceIdx : 0;
  const { startSec, endSec } = computePlaybackWindow(ep.sentences, resolvedIdx, ep.duration);
  return {
    audioUrl: ep.audioUrl,
    startSec,
    endSec,
    seekAheadMs,
    sentenceId: sentence.id,
  };
}

export function usePracticeSession(
  seekAheadMs: number = 80,
  audioMode: 'web-audio' | 'native' = 'native'
) {
  const [viewState, dispatch] = useReducer(viewReducer, initialViewState);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<string | null>(null);

  const isAudioPausedRef = useRef(false);
  useEffect(() => {
    isAudioPausedRef.current = isAudioPaused;
  }, [isAudioPaused]);

  // Core engines
  const engineRef = useRef<TypingEngineCore | null>(null);
  const playerRef = useRef<ChunkAudioPlayer | null>(null);
  const fsmRef = useRef<PracticeFSM | null>(null);

  // Acoustic pipeline & scaffolding instances
  const recoverFromLensPlayback = useCallback(() => {
    dispatch({ type: 'SET_LENS_ACTIVE', active: false });
    if (!isAudioPausedRef.current && currentRoundRef.current !== 4 && currentChunkRef.current) {
      playerRef.current?.playChunk(currentChunkRef.current);
    }
  }, []);

  const lensPlayerRef = useRef<AcousticLensAudioPlayer>(new AcousticLensAudioPlayer({
    playbackComplete: recoverFromLensPlayback,
    playbackError: recoverFromLensPlayback,
  }));
  const keystrokeTrackerRef = useRef<KeystrokeTracker>(new KeystrokeTracker());
  const classifierRef = useRef<CognitiveBottleneckClassifier>(new CognitiveBottleneckClassifier());
  const mapperRef = useRef<AcousticCharMapper | null>(null);
  const stateMachineRef = useRef<ScaffoldStateMachine | null>(null);
  const fsrsEngineRef = useRef<AcousticFSRSEngine>(new AcousticFSRSEngine());
  const metricsExporterRef = useRef<AcousticMetricsExporter>(new AcousticMetricsExporter(fsrsEngineRef.current));

  const acousticChunkRef = useRef<AcousticChunkData | null>(null);
  const episodeAcousticsRef = useRef<Map<string | number, AcousticChunkData> | null>(null);
  const currentChunkRef = useRef<AudioChunk | null>(null);

  const episodeRef = useRef<Episode | null>(null);
  const currentRoundRef = useRef<TrainingRound>(1);
  const roundCompletedRef = useRef<PracticeViewState['roundCompleted']>({
    round1: false,
    round2: false,
    round3: false,
    round4: false,
  });
  const sentenceIdxRef = useRef<number>(0);
  const completedSentencesRef = useRef<SentenceStats[]>([]);
  const seekAheadMsRef = useRef(seekAheadMs);
  const audioModeRef = useRef(audioMode);
  const pauseCountRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lensTriggeredInSentenceRef = useRef<boolean>(false);
  const sentenceIkiSumRef = useRef<number>(0);
  const sentenceIkiCountRef = useRef<number>(0);

  // Load persisted FSRS and Keystroke history from IndexedDB on startup
  useEffect(() => {
    async function initAcousticStorage() {
      try {
        const persisted = await acousticStorage.loadAll();
        if (persisted.fsrsStates) {
          fsrsEngineRef.current.importState(persisted.fsrsStates);
        }
        if (persisted.keystrokeHistory) {
          metricsExporterRef.current.importLatencyHistory(persisted.keystrokeHistory);
        }
        if (persisted.overcomeCount > 0) {
          metricsExporterRef.current.setTotalOvercomeCount(persisted.overcomeCount);
        }
        const initialRadar = metricsExporterRef.current.exportRadarProfile();
        dispatch({ type: 'INIT_RADAR_PROFILE', radarProfile: initialRadar });
      } catch (err) {
        console.warn('[AcousticStorage] Failed to load persisted acoustic records:', err);
      }
    }
    initAcousticStorage();
  }, []);

  // Synchronize acoustic chunk setup when loading a sentence (priority: real acoustic database -> fallback phonemizer)
  const loadSentenceAcoustics = useCallback((sentence: Sentence, sentenceIdx?: number) => {
    let chunk: AcousticChunkData | undefined;
    const acousticsMap = episodeAcousticsRef.current;
    if (acousticsMap) {
      chunk =
        acousticsMap.get(String(sentence.id)) ||
        acousticsMap.get(sentence.id) ||
        (sentenceIdx !== undefined ? acousticsMap.get(sentenceIdx) : undefined);
    }

    if (!chunk) {
      chunk = sentenceToAcousticChunk(sentence);
    }

    acousticChunkRef.current = chunk;
    mapperRef.current = new AcousticCharMapper(chunk);
    stateMachineRef.current = new ScaffoldStateMachine(chunk);
    keystrokeTrackerRef.current.reset();
    lensTriggeredInSentenceRef.current = false;
    sentenceIkiSumRef.current = 0;
    sentenceIkiCountRef.current = 0;

    dispatch({ type: 'SET_ACOUSTIC_CHUNK', chunk });
    dispatch({ type: 'SET_SCAFFOLD', scaffold: undefined });
    dispatch({ type: 'SET_LENS_ACTIVE', active: false });
  }, []);

  const triggerLensReplay = useCallback((targetWordIdx?: number) => {
    const acousticChunk = acousticChunkRef.current;
    if (!acousticChunk) return;

    let wordIdx = targetWordIdx;
    if (wordIdx === undefined) {
      const cursor = engineRef.current?.cursorIndex ?? 0;
      wordIdx = mapperRef.current?.getContextAt(cursor).wordIndex ?? 0;
    }

    const wordData = acousticChunk.words[wordIdx];
    if (!wordData) return;

    playerRef.current?.pause();
    lensTriggeredInSentenceRef.current = true;
    dispatch({ type: 'SET_LENS_ACTIVE', active: true });
    lensPlayerRef.current.playTargetLensOnly(wordData.start_ms, wordData.end_ms, 80, 0.7);
  }, []);

  const saveProgressToDb = useCallback(async (bestScorePatch?: PracticeViewState['bestScore']) => {
    const ep = episodeRef.current;
    if (!ep) return;

    await saveProgress({
      episodeId: ep.episodeId,
      currentRound: currentRoundRef.current,
      currentSentenceIdx: sentenceIdxRef.current,
      roundCompleted: { ...roundCompletedRef.current },
      ...(bestScorePatch ? { bestScore: bestScorePatch } : {}),
      updatedAt: Date.now(),
    });
  }, []);

  const saveProgressToDbRef = useRef(saveProgressToDb);
  useEffect(() => {
    saveProgressToDbRef.current = saveProgressToDb;
  }, [saveProgressToDb]);

  const loadSentenceAcousticsRef = useRef(loadSentenceAcoustics);
  useEffect(() => {
    loadSentenceAcousticsRef.current = loadSentenceAcoustics;
  }, [loadSentenceAcoustics]);

  // Init typing engine and audio player (Singleton lifecycle across session)
  useEffect(() => {
    const engine = new TypingEngineCore({ judgeMode: 'STRICT' });
    const player = new ChunkAudioPlayer();
    const fsm = new PracticeFSM();

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

      // Module M7: Record FSRS practice and overcome count
      const completedChunk = acousticChunkRef.current;
      if (completedChunk && completedChunk.words) {
        const sentencePhenomena = new Set<PhenomenonType>();
        for (const w of completedChunk.words) {
          if (w.phenomena) {
            for (const ph of w.phenomena) {
              sentencePhenomena.add(ph as PhenomenonType);
            }
          }
        }
        const avgIki =
          sentenceIkiCountRef.current > 0
            ? sentenceIkiSumRef.current / sentenceIkiCountRef.current
            : 0;
        const grade = gradeSentencePractice(
          stats.errorCount,
          lensTriggeredInSentenceRef.current,
          avgIki
        );
        for (const ph of sentencePhenomena) {
          fsrsEngineRef.current.recordPractice(ph, grade);
        }
      }

      let bestScorePatch: PracticeViewState['bestScore'] | undefined;

      if (isLast) {
        const finishedRound = currentRoundRef.current;
        roundCompletedRef.current = {
          ...roundCompletedRef.current,
          [`round${finishedRound}`]: true,
        };
        dispatch({ type: 'ROUND_FINISHED', round: finishedRound });

        if (finishedRound === 4) {
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

          const computedStars: 1 | 2 | 3 =
            evalResult.score >= 96 ? 3 : evalResult.score >= 90 ? 2 : 1;
          bestScorePatch = {
            score: evalResult.score,
            accuracy: evalResult.accuracy,
            wpm: evalResult.wpm,
            stars: computedStars,
            achievedAt: Date.now(),
          };

          // Generate FSRS 5D Radar profile for modal
          const radarProfile = metricsExporterRef.current.exportRadarProfile();
          dispatch({
            type: 'CHALLENGE_DONE',
            result: evalResult,
            radarProfile,
            bestScore: bestScorePatch,
          });
          player.pause();

          // Persist updated FSRS states, keystroke history & overcome records
          try {
            await acousticStorage.saveAll(
              fsrsEngineRef.current.exportState(),
              metricsExporterRef.current.exportLatencyHistory(),
              metricsExporterRef.current.getTotalOvercomeCount()
            );
          } catch (storageErr) {
            console.warn('[AcousticStorage] Failed to persist acoustic data:', storageErr);
          }
        } else {
          const nextRound = (finishedRound + 1) as TrainingRound;
          dispatch({ type: 'SET_ROUND', round: nextRound });
          currentRoundRef.current = nextRound;
          sentenceIdxRef.current = 0;
          completedSentencesRef.current = [];

          const firstSentence = ep.sentences[0]!;
          engine.loadSentence(firstSentence);
          loadSentenceAcousticsRef.current(firstSentence, 0);

          const chunk = buildAudioChunk(ep, 0, seekAheadMsRef.current);
          currentChunkRef.current = chunk;
          fsm.transition('SENTENCE_ADVANCE');
          if (!isAudioPausedRef.current) {
            player.playChunk(chunk);
            player.setLooping(nextRound !== 4);
            fsm.transition('AUDIO_CAN_PLAY');
          }
        }
      } else {
        const nextSentence = ep.sentences[nextIdx]!;
        engine.loadSentence(nextSentence);
        loadSentenceAcousticsRef.current(nextSentence, nextIdx);

        const chunk = buildAudioChunk(ep, nextIdx, seekAheadMsRef.current);
        currentChunkRef.current = chunk;
        fsm.transition('SENTENCE_ADVANCE');
        if (!isAudioPausedRef.current) {
          player.playChunk(chunk);
          player.setLooping(currentRoundRef.current !== 4);
          fsm.transition('AUDIO_CAN_PLAY');
        }
      }

      await saveProgressToDbRef.current(bestScorePatch);
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
      player.pause();
      unsubFSM();
    };
  }, []);

  const restartCurrentSentence = useCallback((resetTypingEngine: boolean = false) => {
    const fsm = fsmRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    const ep = episodeRef.current;
    if (!fsm || !engine || !player || !ep) return;

    if (resetTypingEngine) {
      if (currentRoundRef.current === 4) {
        pauseCountRef.current++;
      }
      fsm.transition('TAB_REPLAY');
    }

    if (isAudioPausedRef.current) {
      isAudioPausedRef.current = false;
      setIsAudioPaused(false);
    }

    const currIdx = sentenceIdxRef.current;
    if (ep.sentences[currIdx]) {
      const chunk = buildAudioChunk(ep, currIdx, seekAheadMsRef.current);
      currentChunkRef.current = chunk;
      player.playChunk(chunk);
    } else if (currentChunkRef.current) {
      player.playChunk(currentChunkRef.current);
    } else {
      player.resume();
    }

    if (resetTypingEngine) {
      engine.reset();
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    const ep = episodeRef.current;
    if (!player || !ep) return;

    if (isAudioPausedRef.current) {
      restartCurrentSentence(false);
    } else {
      player.pause();
      lensPlayerRef.current.stop();
      isAudioPausedRef.current = true;
      setIsAudioPaused(true);
    }
  }, [restartCurrentSentence]);

  // MediaSession API integration for hardware/headphone play-pause keys
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        if (isAudioPausedRef.current) {
          togglePlayPause();
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (!isAudioPausedRef.current) {
          togglePlayPause();
        }
      });
    }
    return () => {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
        } catch { /* ignore */ }
      }
    };
  }, [togglePlayPause]);

  // Global keystroke capturing with acoustic analysis
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const fsm = fsmRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    if (!fsm || !engine || !player) return;

    const isSessionReady = Boolean(episodeRef.current && engine.hasSentence);
    if (!shouldCaptureKeystroke(e.target, isSessionReady)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      togglePlayPause();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      restartCurrentSentence(true);
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length > 1 && e.key !== 'Backspace') return;

    e.preventDefault();

    // Acoustic dynamics analysis & scaffolding
    const chunk = acousticChunkRef.current;
    const mapper = mapperRef.current;
    const stateMachine = stateMachineRef.current;
    const tracker = keystrokeTrackerRef.current;
    const classifier = classifierRef.current;

    if (chunk && mapper && stateMachine) {
      const cursor = engine.cursorIndex;
      const expectedChar = cursor < chunk.text.length ? chunk.text[cursor] : '';
      const isMatch = e.key === expectedChar;

      // 1. Record raw keydown
      const rawEvent = tracker.recordKeyDown(e.key, expectedChar, isMatch, cursor);
      if (rawEvent.ikiMs > 0 && rawEvent.ikiMs < 3000) {
        sentenceIkiSumRef.current += rawEvent.ikiMs;
        sentenceIkiCountRef.current++;
      }

      // 2. Query acoustic context
      const ctx = mapper.getContextAt(cursor);

      // 3. Diagnose cognitive state
      const cogState = classifier.diagnoseKeystroke(rawEvent, undefined, ctx, 0);
      dispatch({ type: 'SET_COGNITIVE_STATE', state: cogState });

      // 4. In Round 3 (单句盲听), evaluate scaffolding & micro-lens!
      if (currentRoundRef.current === 3) {
        const prevLevel = stateMachine.getWordState(ctx.wordIndex)?.currentLevel ?? ScaffoldLevel.LEVEL_0_NONE;
        const annotated = {
          ...rawEvent,
          associatedPhoneme: ctx.associatedPhoneme,
          isWeakenedPhoneme: ctx.isWeakenedPhoneme,
          associatedPhenomena: ctx.associatedPhenomena,
          cognitiveState: cogState,
        };

        const scaffold = stateMachine.handleKeystroke(annotated, ctx.wordIndex);
        if (scaffold.currentLevel > ScaffoldLevel.LEVEL_0_NONE) {
          dispatch({ type: 'SET_SCAFFOLD', scaffold });
          if (cogState === 'PERCEPTUAL_BLINDSPOT') {
            triggerLensReplay(ctx.wordIndex);
          }
        } else {
          dispatch({ type: 'SET_SCAFFOLD', scaffold: undefined });
          // If word had an active scaffold and just recovered to LEVEL_0_NONE, increment overcome count
          if (prevLevel > ScaffoldLevel.LEVEL_0_NONE) {
            metricsExporterRef.current.addOvercomeCount(1);
          }
        }
      }

      // Record latency metrics for Power Law convergence
      if (ctx.associatedPhenomena.length > 0 && rawEvent.ikiMs > 0 && rawEvent.ikiMs < 2000) {
        for (const ph of ctx.associatedPhenomena) {
          metricsExporterRef.current.recordLatency(ph, rawEvent.ikiMs);
        }
      }
    }

    engine.handleKeyInput(e.key);
  }, [triggerLensReplay, togglePlayPause, restartCurrentSentence]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const selectRound = useCallback((round: TrainingRound) => {
    const ep = episodeRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    if (!ep || !engine || !player) return;

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
    loadSentenceAcoustics(firstSentence, 0);

    const chunk = buildAudioChunk(ep, 0, seekAheadMsRef.current);
    currentChunkRef.current = chunk;
    setIsAudioPaused(false);
    isAudioPausedRef.current = false;
    player.playChunk(chunk);
    player.setLooping(round !== 4);

    dispatch({
      type: 'INIT_SESSION',
      sentenceIdx: 0,
      round,
    });
  }, [seekAheadMs, viewState.roundCompleted, loadSentenceAcoustics]);

  const handleEpisodeLoad = useCallback(async (episode: Episode) => {
    const engine = engineRef.current;
    const player = playerRef.current;
    const fsm = fsmRef.current;
    if (!engine || !player || !fsm) return;

    episodeRef.current = episode;
    pauseCountRef.current = 0;
    startTimeRef.current = performance.now();

    // 1. Fetch saved progress from DB first
    const savedRecord = await db.progress.get(episode.episodeId);
    let targetSentenceIdx = 0;
    let targetRound: TrainingRound = 1;

    if (savedRecord) {
      if (savedRecord.currentRound) {
        targetRound = savedRecord.currentRound as TrainingRound;
        currentRoundRef.current = targetRound;
      }
      roundCompletedRef.current = {
        round1: savedRecord.roundCompleted?.round1 ?? false,
        round2: savedRecord.roundCompleted?.round2 ?? false,
        round3: savedRecord.roundCompleted?.round3 ?? false,
        round4: savedRecord.roundCompleted?.round4 ?? false,
      };
      if (
        typeof savedRecord.currentSentenceIdx === 'number' &&
        savedRecord.currentSentenceIdx > 0 &&
        savedRecord.currentSentenceIdx < episode.sentences.length
      ) {
        targetSentenceIdx = savedRecord.currentSentenceIdx;
        setResumePrompt(`已从上次中断的第 ${targetSentenceIdx + 1} 句继续`);
        setTimeout(() => setResumePrompt(null), 3500);
      }
      dispatch({ type: 'LOAD_DB_RECORD', record: savedRecord });
    } else {
      currentRoundRef.current = 1;
      roundCompletedRef.current = {
        round1: false,
        round2: false,
        round3: false,
        round4: false,
      };
    }

    // 2. Preload micro-lens audio player
    lensPlayerRef.current.loadAudio(episode.audioUrl);

    // 3. Asynchronously fetch production acoustic database (.acoustic.json)
    try {
      const epNumStr = String(episode.episodeNumber).padStart(3, '0');
      const url = `/data/acoustic/ep-${epNumStr}.acoustic.json`;
      let loadedMap: Map<string | number, AcousticChunkData> | null = null;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.chunks)) {
            loadedMap = new Map();
            data.chunks.forEach((c: AcousticChunkData, idx: number) => {
              if (c.chunk_id !== undefined && c.chunk_id !== null) {
                loadedMap!.set(String(c.chunk_id), c);
              }
              loadedMap!.set(idx, c);
            });
          }
        }
      } catch {
        // Fallback to synthetic phonemizer
      }
      episodeAcousticsRef.current = loadedMap;
    } catch {
      episodeAcousticsRef.current = null;
    }

    // 4. Initialize player and anchor to the target sentence
    await player.init(episode.audioUrl, audioModeRef.current, seekAheadMsRef.current);

    sentenceIdxRef.current = targetSentenceIdx;
    const targetSentence = episode.sentences[targetSentenceIdx] || episode.sentences[0]!;
    engine.loadSentence(targetSentence);
    loadSentenceAcoustics(targetSentence, targetSentenceIdx);

    const chunk = buildAudioChunk(episode, targetSentenceIdx, seekAheadMsRef.current);
    currentChunkRef.current = chunk;
    setIsAudioPaused(false);
    isAudioPausedRef.current = false;
    player.playChunk(chunk);
    player.setLooping(targetRound !== 4);
    fsm.transition('LOAD');
    fsm.transition('AUDIO_CAN_PLAY');

    // 5. Atomic synchronization: set currentSentenceIndex and round directly
    dispatch({
      type: 'INIT_SESSION',
      sentenceIdx: targetSentenceIdx,
      round: targetRound,
    });
  }, [loadSentenceAcoustics]);

  const handleReset = useCallback(async () => {
    await saveProgressToDb();
    playerRef.current?.pause();
    lensPlayerRef.current.stop();
    engineRef.current?.reset();
    fsmRef.current?.transition('RESET');
    episodeRef.current = null;
    episodeAcousticsRef.current = null;
    currentChunkRef.current = null;
    sentenceIdxRef.current = 0;
    roundCompletedRef.current = {
      round1: false,
      round2: false,
      round3: false,
      round4: false,
    };
    completedSentencesRef.current = [];
    isAudioPausedRef.current = false;
    setIsAudioPaused(false);
    dispatch({ type: 'RESET', totalSentences: 0 });
  }, [saveProgressToDb]);

  const restartFromBeginning = useCallback(async () => {
    const ep = episodeRef.current;
    const engine = engineRef.current;
    const player = playerRef.current;
    const fsm = fsmRef.current;
    if (!ep || !engine || !player || !fsm) return;

    sentenceIdxRef.current = 0;
    completedSentencesRef.current = [];
    setIsAudioPaused(false);

    await saveProgress({
      episodeId: ep.episodeId,
      currentRound: currentRoundRef.current,
      currentSentenceIdx: 0,
      roundCompleted: { ...roundCompletedRef.current },
      updatedAt: Date.now(),
    });

    const firstSentence = ep.sentences[0]!;
    engine.loadSentence(firstSentence);
    loadSentenceAcoustics(firstSentence, 0);

    const chunk = buildAudioChunk(ep, 0, seekAheadMsRef.current);
    currentChunkRef.current = chunk;
    setIsAudioPaused(false);
    isAudioPausedRef.current = false;
    player.playChunk(chunk);
    player.setLooping(currentRoundRef.current !== 4);
    fsm.transition('AUDIO_CAN_PLAY');

    dispatch({
      type: 'INIT_SESSION',
      sentenceIdx: 0,
      round: currentRoundRef.current,
    });
  }, [viewState.roundCompleted, loadSentenceAcoustics]);

  const handleTabKey = useCallback(() => {
    restartCurrentSentence(true);
  }, [restartCurrentSentence]);

  return {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    restartFromBeginning,
    selectRound,
    togglePlayPause,
    isAudioPaused,
    dismissChallengeModal: () => dispatch({ type: 'DISMISS_CHALLENGE' }),
    resumePrompt,
    currentEpisode: episodeRef.current,
    currentSentence: episodeRef.current?.sentences[viewState.currentSentenceIndex] ?? null,
    triggerLensReplay,
  };
}
