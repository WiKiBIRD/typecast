/**
 * ScaffoldStateMachine (Module A).
 * Adaptive cognitive scaffolding state machine and decision orchestrator.
 * Dynamically escalates and fades psychoacoustic scaffolds based on real-time
 * cognitive bottleneck classifications.
 */

import type { AcousticChunkData, AnnotatedKeystroke } from '../dynamics/types';
import {
  ScaffoldLevel,
  type WordScaffoldState,
  type BlindspotOvercomeEvent,
} from './types';
import { MicroLensTimeScheduler } from './MicroLensTimeScheduler';
import { PhoneticScaffoldGenerator } from './PhoneticScaffoldGenerator';

export class ScaffoldStateMachine {
  private chunk: AcousticChunkData;
  private wordStates: Map<number, WordScaffoldState> = new Map();
  private overcomeEvents: BlindspotOvercomeEvent[] = [];

  private scheduler: MicroLensTimeScheduler;
  private generator: PhoneticScaffoldGenerator;

  constructor(chunk: AcousticChunkData) {
    this.chunk = chunk;
    this.scheduler = new MicroLensTimeScheduler();
    this.generator = new PhoneticScaffoldGenerator();
    this.initStates();
  }

  /**
   * Initializes baseline states for all words in the chunk.
   */
  private initStates(): void {
    this.wordStates.clear();
    this.overcomeEvents = [];

    this.chunk.words.forEach((wordData, idx) => {
      this.wordStates.set(idx, {
        wordIndex: idx,
        word: wordData.word,
        currentLevel: ScaffoldLevel.LEVEL_0_NONE,
        attempts: 0,
        blindspotTriggered: false,
      });
    });
  }

  /**
   * Resets the state machine for the same or a new chunk.
   */
  public reset(newChunk?: AcousticChunkData): void {
    if (newChunk) {
      this.chunk = newChunk;
    }
    this.initStates();
  }

  /**
   * Main reaction entrypoint: processes an annotated keystroke event.
   *
   * @param keystroke Annotated keystroke from CognitiveBottleneckClassifier
   * @param wordIndex The index of the word currently being typed
   */
  public handleKeystroke(keystroke: AnnotatedKeystroke, wordIndex: number): WordScaffoldState {
    let state = this.wordStates.get(wordIndex);
    if (!state) {
      const wordStr = this.chunk.words[wordIndex]?.word ?? '';
      state = {
        wordIndex,
        word: wordStr,
        currentLevel: ScaffoldLevel.LEVEL_0_NONE,
        attempts: 0,
        blindspotTriggered: false,
      };
      this.wordStates.set(wordIndex, state);
    }

    state.attempts += 1;

    // -------------------------------------------------------------------------
    // Rule 1: PERCEPTUAL_BLINDSPOT -> Escalate Scaffold Level
    // -------------------------------------------------------------------------
    if (keystroke.cognitiveState === 'PERCEPTUAL_BLINDSPOT') {
      state.blindspotTriggered = true;
      this.escalateLevel(state, wordIndex);
      return state;
    }

    // -------------------------------------------------------------------------
    // Rule 2: MOTOR_TYPO -> Maintain Current Scaffold (no false escalation)
    // -------------------------------------------------------------------------
    if (keystroke.cognitiveState === 'MOTOR_TYPO') {
      return state;
    }

    // -------------------------------------------------------------------------
    // Rule 3: NORMAL_FLOW & Correct -> Scaffold Fading (Overcome Blindspot)
    // -------------------------------------------------------------------------
    if (keystroke.cognitiveState === 'NORMAL_FLOW' && keystroke.isCorrect) {
      if (state.blindspotTriggered && state.currentLevel > ScaffoldLevel.LEVEL_0_NONE) {
        // Record Overcome Event
        this.overcomeEvents.push({
          wordIndex,
          word: state.word,
          resolvedLevel: state.currentLevel,
          attempts: state.attempts,
          timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        });

        // Fade out scaffold
        this.fadeLevel(state);
      }
    }

    return state;
  }

  /**
   * Escalates the scaffold level step-by-step from 0 -> 1 -> 2 -> 3.
   */
  private escalateLevel(state: WordScaffoldState, wordIndex: number): void {
    const wordData = this.chunk.words[wordIndex];
    const nextWordData = wordIndex + 1 < this.chunk.words.length ? this.chunk.words[wordIndex + 1] : undefined;

    // Step up level
    if (state.currentLevel === ScaffoldLevel.LEVEL_0_NONE) {
      state.currentLevel = ScaffoldLevel.LEVEL_1_MICRO_LENS;
    } else if (state.currentLevel === ScaffoldLevel.LEVEL_1_MICRO_LENS) {
      state.currentLevel = ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL;
    } else if (state.currentLevel === ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL) {
      state.currentLevel = ScaffoldLevel.LEVEL_3_SKELETON;
    }

    // Level 1: Generate Acoustic Micro-Lens schedule
    if (state.currentLevel >= ScaffoldLevel.LEVEL_1_MICRO_LENS && wordData) {
      state.lensSchedule = this.scheduler.schedule(
        this.chunk.start_ms,
        this.chunk.end_ms,
        wordData.start_ms,
        wordData.end_ms,
        { paddingMs: 80, stretchFactor: 0.7 }
      );
    }

    // Level 2: Generate Phonetic Reality contrast card
    if (state.currentLevel >= ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL && wordData) {
      state.hint = this.generator.generateHint(wordData, nextWordData);
    }

    // Level 3: Generate minimal phonetic consonant skeleton
    if (state.currentLevel >= ScaffoldLevel.LEVEL_3_SKELETON && wordData) {
      state.skeleton = this.generator.generateSkeleton(wordData.word);
    }
  }

  /**
   * Fades out scaffold: steps down level or completely resets to LEVEL_0_NONE.
   */
  private fadeLevel(state: WordScaffoldState): void {
    state.currentLevel = ScaffoldLevel.LEVEL_0_NONE;
    state.lensSchedule = undefined;
    state.hint = undefined;
    state.skeleton = undefined;
  }

  /**
   * Gets scaffold state for a specific word by index.
   */
  public getWordState(wordIndex: number): WordScaffoldState | undefined {
    return this.wordStates.get(wordIndex);
  }

  /**
   * Gets all active word scaffold states.
   */
  public getAllStates(): WordScaffoldState[] {
    return Array.from(this.wordStates.values());
  }

  /**
   * Retrieves all recorded blindspot overcome events.
   */
  public getOvercomeEvents(): BlindspotOvercomeEvent[] {
    return [...this.overcomeEvents];
  }

  /**
   * Retrieves the current highest active scaffold state (if any).
   */
  public getActiveScaffold(): WordScaffoldState | undefined {
    let highest: WordScaffoldState | undefined;
    for (const state of this.wordStates.values()) {
      if (state.currentLevel > ScaffoldLevel.LEVEL_0_NONE) {
        if (!highest || state.currentLevel > highest.currentLevel) {
          highest = state;
        }
      }
    }
    return highest;
  }
}
