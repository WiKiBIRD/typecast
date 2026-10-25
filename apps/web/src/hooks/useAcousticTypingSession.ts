/**
 * useAcousticTypingSession (Module B).
 * Integrated React hook unifying Keystroke Dynamics, Acoustic Char Mapping,
 * Cognitive Bottleneck Diagnostics, Adaptive Scaffolding, and FSRS Scheduling.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  KeystrokeTracker,
  AcousticCharMapper,
  CognitiveBottleneckClassifier,
  ScaffoldStateMachine,
  AutoGrader,
  AcousticFSRSEngine,
  AcousticMetricsExporter,
  AcousticLensAudioPlayer,
  ScaffoldLevel,
  type AcousticChunkData,
  type CognitiveState,
  type WordScaffoldState,
  type AcousticRadarProfile,
  type ChunkCognitiveReport,
  type LensPlayerState,
} from '@typecast/core';

export interface UseAcousticTypingSessionOptions {
  initialChunk: AcousticChunkData;
  audioUrl?: string;
  autoPlayOnMount?: boolean;
}

export function useAcousticTypingSession({
  initialChunk,
  audioUrl,
  autoPlayOnMount = false,
}: UseAcousticTypingSessionOptions) {
  const [currentChunk, setCurrentChunk] = useState<AcousticChunkData>(initialChunk);
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const [inputText, setInputText] = useState<string>('');
  const [cognitiveState, setCognitiveState] = useState<CognitiveState>('NORMAL_FLOW');
  const [activeScaffoldState, setActiveScaffoldState] = useState<WordScaffoldState | undefined>(undefined);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [report, setReport] = useState<ChunkCognitiveReport | null>(null);
  const [radarProfile, setRadarProfile] = useState<AcousticRadarProfile>({
    radarVector: {
      LINKING: 70,
      REDUCTION: 65,
      ELISION: 60,
      ASSIMILATION: 75,
      GLOTTAL_STOP: 65,
    },
    meanLatencyReductionPercent: 0,
    totalOvercomeCount: 0,
  });
  const [playerState, setPlayerState] = useState<LensPlayerState>('IDLE');

  // Core engines retained across renders
  const trackerRef = useRef<KeystrokeTracker>(new KeystrokeTracker());
  const classifierRef = useRef<CognitiveBottleneckClassifier>(new CognitiveBottleneckClassifier());
  const mapperRef = useRef<AcousticCharMapper>(new AcousticCharMapper(initialChunk));
  const stateMachineRef = useRef<ScaffoldStateMachine>(new ScaffoldStateMachine(initialChunk));
  const autoGraderRef = useRef<AutoGrader>(new AutoGrader());
  const fsrsEngineRef = useRef<AcousticFSRSEngine>(new AcousticFSRSEngine());
  const metricsExporterRef = useRef<AcousticMetricsExporter>(new AcousticMetricsExporter(fsrsEngineRef.current));
  const playerRef = useRef<AcousticLensAudioPlayer>(new AcousticLensAudioPlayer({
    stateChange: (st) => setPlayerState(st),
  }));

  // Initialize Audio
  useEffect(() => {
    const src = audioUrl || AcousticLensAudioPlayer.createSyntheticSpeechBlobUrl();
    if (src) {
      playerRef.current.loadAudio(src).then(() => {
        if (autoPlayOnMount) {
          playerRef.current.playRange(initialChunk.start_ms, initialChunk.end_ms, 1.0);
        }
      });
    }

    // Initialize initial radar
    setRadarProfile(metricsExporterRef.current.exportRadarProfile());

    return () => {
      playerRef.current.stop();
    };
  }, [audioUrl, autoPlayOnMount, initialChunk]);

  /**
   * Resets session with current or new chunk.
   */
  const resetSession = useCallback((newChunk?: AcousticChunkData) => {
    const targetChunk = newChunk || currentChunk;
    setCurrentChunk(targetChunk);
    setCursorIndex(0);
    setInputText('');
    setCognitiveState('NORMAL_FLOW');
    setActiveScaffoldState(undefined);
    setIsCompleted(false);
    setReport(null);

    trackerRef.current.reset();
    mapperRef.current = new AcousticCharMapper(targetChunk);
    stateMachineRef.current.reset(targetChunk);
  }, [currentChunk]);

  /**
   * Plays the entire chunk at normal 1.0x speed.
   */
  const playCurrentChunk = useCallback(() => {
    playerRef.current.playRange(currentChunk.start_ms, currentChunk.end_ms, 1.0);
  }, [currentChunk]);

  /**
   * Triggers focused Micro-Lens playback (0.7x time-stretched).
   */
  const triggerLensReplay = useCallback(() => {
    const active = stateMachineRef.current.getActiveScaffold();
    if (active && active.lensSchedule && active.lensSchedule.length > 0) {
      playerRef.current.playWithLensSchedule(active.lensSchedule);
    } else {
      // Fallback: play current word at 0.7x
      const context = mapperRef.current.getContextAt(cursorIndex);
      const wordData = currentChunk.words[context.wordIndex];
      if (wordData) {
        playerRef.current.playTargetLensOnly(wordData.start_ms, wordData.end_ms, 80, 0.7);
      } else {
        playCurrentChunk();
      }
    }
  }, [cursorIndex, currentChunk, playCurrentChunk]);

  /**
   * Handles native keydown events in the typing workspace.
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (isCompleted) return;

    // Ignore modifier keys
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
      return;
    }

    const text = currentChunk.text;
    const expectedChar = cursorIndex < text.length ? text[cursorIndex] : '';

    // Handle Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (cursorIndex > 0) {
        const prevIdx = cursorIndex - 1;
        setCursorIndex(prevIdx);
        setInputText((prev) => prev.slice(0, -1));

        const rawEvent = trackerRef.current.recordKeyDown('Backspace', expectedChar, false, prevIdx);
        const ctx = mapperRef.current.getContextAt(prevIdx);
        const state = classifierRef.current.diagnoseKeystroke(rawEvent, undefined, ctx, 1);
        setCognitiveState(state);

        const scaffold = stateMachineRef.current.handleKeystroke(
          {
            ...rawEvent,
            associatedPhoneme: ctx.associatedPhoneme,
            isWeakenedPhoneme: ctx.isWeakenedPhoneme,
            associatedPhenomena: ctx.associatedPhenomena,
            cognitiveState: state,
          },
          ctx.wordIndex
        );
        setActiveScaffoldState(scaffold.currentLevel > ScaffoldLevel.LEVEL_0_NONE ? scaffold : undefined);
      }
      return;
    }

    // Only process single printable characters
    if (e.key.length !== 1) return;
    e.preventDefault();

    const isMatch = e.key === expectedChar;
    const currentIdx = cursorIndex;

    // 1. Record raw keystroke dynamics (performance.now)
    const rawEvent = trackerRef.current.recordKeyDown(e.key, expectedChar, isMatch, currentIdx);

    // 2. Map acoustic context
    const ctx = mapperRef.current.getContextAt(currentIdx);

    // 3. Cognitive bottleneck diagnosis
    const state = classifierRef.current.diagnoseKeystroke(rawEvent, undefined, ctx, 0);
    setCognitiveState(state);

    // 4. Update adaptive scaffolding state machine
    const annotated = {
      ...rawEvent,
      associatedPhoneme: ctx.associatedPhoneme,
      isWeakenedPhoneme: ctx.isWeakenedPhoneme,
      associatedPhenomena: ctx.associatedPhenomena,
      cognitiveState: state,
    };

    const scaffold = stateMachineRef.current.handleKeystroke(annotated, ctx.wordIndex);
    setActiveScaffoldState(scaffold.currentLevel > ScaffoldLevel.LEVEL_0_NONE ? scaffold : undefined);

    // 5. Auto-trigger acoustic micro-lens on perceptual blindspot
    if (state === 'PERCEPTUAL_BLINDSPOT') {
      if (scaffold.lensSchedule) {
        playerRef.current.playWithLensSchedule(scaffold.lensSchedule);
      }
    }

    // 6. If match, advance cursor and update text
    if (isMatch) {
      setInputText((prev) => prev + e.key);
      const nextIdx = currentIdx + 1;
      setCursorIndex(nextIdx);

      // Check chunk completion
      if (nextIdx >= text.length) {
        setIsCompleted(true);

        // Run full classification & cognitive report
        const fullReport = classifierRef.current.classifyChunk(
          currentChunk,
          trackerRef.current.getRawEvents()
        );
        setReport(fullReport);

        // Auto-grade
        const gradeResult = autoGraderRef.current.gradeChunk(
          fullReport,
          stateMachineRef.current.getAllStates()
        );

        // Update FSRS & Metrics
        for (const [ph, grade] of Object.entries(gradeResult.phenomenaGrades)) {
          fsrsEngineRef.current.recordPractice(ph as any, grade);
          metricsExporterRef.current.recordLatency(ph as any, fullReport.meanIkiMs);
        }

        const overcomes = stateMachineRef.current.getOvercomeEvents();
        metricsExporterRef.current.addOvercomeCount(overcomes.length);

        setRadarProfile(metricsExporterRef.current.exportRadarProfile());
      }
    }
  }, [cursorIndex, currentChunk, isCompleted]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    trackerRef.current.recordKeyUp(e.key);
  }, []);

  return {
    currentChunk,
    cursorIndex,
    inputText,
    cognitiveState,
    activeScaffoldState,
    isCompleted,
    report,
    radarProfile,
    playerState,
    handleKeyDown,
    handleKeyUp,
    playCurrentChunk,
    triggerLensReplay,
    resetSession,
  };
}
