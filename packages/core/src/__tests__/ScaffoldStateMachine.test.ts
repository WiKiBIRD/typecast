import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScaffoldLevel,
  ScaffoldStateMachine,
  MicroLensTimeScheduler,
  PhoneticScaffoldGenerator,
} from '../scaffolding';
import type { AcousticChunkData, AnnotatedKeystroke } from '../dynamics/types';

// Sample Phase 1 Acoustic Chunk: "hold on and sit down"
const mockChunk: AcousticChunkData = {
  chunk_id: 'chunk_001',
  start_ms: 120,
  end_ms: 2980,
  text: 'hold on and sit down',
  words: [
    {
      word: 'hold',
      start_ms: 120,
      end_ms: 480,
      phonemes: [
        { phoneme: 'HH', start_ms: 120, end_ms: 200, is_weakened: false, stress: 0 },
        { phoneme: 'OW1', start_ms: 200, end_ms: 360, is_weakened: false, stress: 1 },
        { phoneme: 'L', start_ms: 360, end_ms: 420, is_weakened: false, stress: 0 },
        { phoneme: 'D', start_ms: 420, end_ms: 480, is_weakened: false, stress: 0 },
      ],
      phenomena: ['LINKING'],
    },
    {
      word: 'on',
      start_ms: 485,
      end_ms: 720,
      phonemes: [
        { phoneme: 'AA1', start_ms: 485, end_ms: 610, is_weakened: false, stress: 1 },
        { phoneme: 'N', start_ms: 610, end_ms: 720, is_weakened: false, stress: 0 },
      ],
      phenomena: ['LINKING'],
    },
    {
      word: 'and',
      start_ms: 730,
      end_ms: 950,
      phonemes: [
        { phoneme: 'AH0', start_ms: 730, end_ms: 780, is_weakened: true, stress: 0 },
        { phoneme: 'N', start_ms: 780, end_ms: 880, is_weakened: false, stress: 0 },
        { phoneme: 'D', start_ms: 880, end_ms: 950, is_weakened: false, stress: 0 },
      ],
      phenomena: ['REDUCTION', 'ELISION'],
    },
    {
      word: 'sit',
      start_ms: 1050,
      end_ms: 1380,
      phonemes: [
        { phoneme: 'S', start_ms: 1050, end_ms: 1150, is_weakened: false, stress: 0 },
        { phoneme: 'IH1', start_ms: 1150, end_ms: 1280, is_weakened: false, stress: 1 },
        { phoneme: 'T', start_ms: 1280, end_ms: 1380, is_weakened: false, stress: 0 },
      ],
      phenomena: ['GLOTTAL_STOP', 'ELISION'],
    },
    {
      word: 'down',
      start_ms: 1400,
      end_ms: 1850,
      phonemes: [
        { phoneme: 'D', start_ms: 1400, end_ms: 1510, is_weakened: false, stress: 0 },
        { phoneme: 'AW1', start_ms: 1510, end_ms: 1720, is_weakened: false, stress: 1 },
        { phoneme: 'N', start_ms: 1720, end_ms: 1850, is_weakened: false, stress: 0 },
      ],
      phenomena: [],
    },
  ],
};

describe('Phase 3: Adaptive Acoustic Scaffolding Engine', () => {
  let stateMachine: ScaffoldStateMachine;
  let scheduler: MicroLensTimeScheduler;
  let generator: PhoneticScaffoldGenerator;

  beforeEach(() => {
    stateMachine = new ScaffoldStateMachine(mockChunk);
    scheduler = new MicroLensTimeScheduler();
    generator = new PhoneticScaffoldGenerator();
  });

  // ---------------------------------------------------------------------------
  // Test Case 1: Level 0 -> Level 1 transition and Micro-Lens timeline schedule
  // ---------------------------------------------------------------------------
  it('Test Case 1: Escalates from Level 0 to Level 1 on PERCEPTUAL_BLINDSPOT and generates micro-lens timeline', () => {
    // Initial state of word 3 ("sit") should be LEVEL_0_NONE
    const initial = stateMachine.getWordState(3);
    expect(initial?.currentLevel).toBe(ScaffoldLevel.LEVEL_0_NONE);

    // Simulated keystroke diagnosis: blindspot at 'sit'
    const blindspotKey: AnnotatedKeystroke = {
      key: 's',
      expectedChar: 's',
      keydownTimestamp: 1500,
      ikiMs: 820, // > 650ms pause
      dwellTimeMs: 80,
      isCorrect: true,
      charIndex: 12,
      isWeakenedPhoneme: false,
      associatedPhenomena: ['GLOTTAL_STOP', 'ELISION'],
      cognitiveState: 'PERCEPTUAL_BLINDSPOT',
    };

    const stateAfter = stateMachine.handleKeystroke(blindspotKey, 3);

    // Assert Level 1 Micro Lens escalation
    expect(stateAfter.currentLevel).toBe(ScaffoldLevel.LEVEL_1_MICRO_LENS);
    expect(stateAfter.blindspotTriggered).toBe(true);
    expect(stateAfter.attempts).toBe(1);

    // Assert Micro-Lens timeline schedule
    expect(stateAfter.lensSchedule).toBeDefined();
    const schedule = stateAfter.lensSchedule!;
    expect(schedule.length).toBeGreaterThanOrEqual(2);

    // Find the target blindspot stretch segment
    const targetSeg = schedule.find((s) => s.isTargetBlindspot);
    expect(targetSeg).toBeDefined();
    expect(targetSeg!.playbackRate).toBe(0.7);

    // Verify padding: word 3 is 1050ms - 1380ms with 80ms padding -> 970ms - 1460ms
    expect(targetSeg!.originalStartMs).toBe(1050 - 80);
    expect(targetSeg!.originalEndMs).toBe(1380 + 80);

    // Verify context before is 1.0x
    const preSeg = schedule.find((s) => !s.isTargetBlindspot && s.originalStartMs === mockChunk.start_ms);
    expect(preSeg).toBeDefined();
    expect(preSeg!.playbackRate).toBe(1.0);
  });

  // ---------------------------------------------------------------------------
  // Test Case 2: Level 1 -> Level 2 transition and Phonetic Reality Contrast Card
  // ---------------------------------------------------------------------------
  it('Test Case 2: Escalates to Level 2 on repeated obstruction and generates Phonetic Reality contrast card', () => {
    // Word 3 ("sit"): First blindspot triggers Level 1
    const key1: AnnotatedKeystroke = {
      key: 's',
      expectedChar: 's',
      keydownTimestamp: 1000,
      ikiMs: 700,
      dwellTimeMs: 80,
      isCorrect: true,
      charIndex: 12,
      isWeakenedPhoneme: false,
      associatedPhenomena: ['GLOTTAL_STOP', 'ELISION'],
      cognitiveState: 'PERCEPTUAL_BLINDSPOT',
    };
    stateMachine.handleKeystroke(key1, 3);
    expect(stateMachine.getWordState(3)?.currentLevel).toBe(ScaffoldLevel.LEVEL_1_MICRO_LENS);

    // Second blindspot at the same word -> triggers Level 2 Phonetic Reveal
    const key2: AnnotatedKeystroke = {
      key: 't',
      expectedChar: 't',
      keydownTimestamp: 2000,
      ikiMs: 780,
      dwellTimeMs: 80,
      isCorrect: true,
      charIndex: 14,
      isWeakenedPhoneme: false,
      associatedPhenomena: ['GLOTTAL_STOP', 'ELISION'],
      cognitiveState: 'PERCEPTUAL_BLINDSPOT',
    };
    const stateL2 = stateMachine.handleKeystroke(key2, 3);

    // Assert Level 2
    expect(stateL2.currentLevel).toBe(ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL);
    expect(stateL2.attempts).toBe(2);

    // Assert Phonetic Reality contrast card
    expect(stateL2.hint).toBeDefined();
    const hint = stateL2.hint!;
    expect(hint.targetWord).toBe('sit');
    expect(hint.ipaCitation).toContain('/sɪt');
    expect(hint.ipaActual).toContain('[sɪʔ');
    expect(hint.acousticExplanation).toContain('失去爆破');
  });

  // ---------------------------------------------------------------------------
  // Test Case 3: Scaffold Fading and Blindspot Overcome Event
  // ---------------------------------------------------------------------------
  it('Test Case 3: Fades scaffold on correct input and records Blindspot Overcome metric', () => {
    // 1. Trigger Level 1 blindspot on word 2 ("and", REDUCTION)
    const blindspotKey: AnnotatedKeystroke = {
      key: 'a',
      expectedChar: 'a',
      keydownTimestamp: 1200,
      ikiMs: 850,
      dwellTimeMs: 80,
      isCorrect: true,
      charIndex: 8,
      isWeakenedPhoneme: true,
      associatedPhenomena: ['REDUCTION', 'ELISION'],
      cognitiveState: 'PERCEPTUAL_BLINDSPOT',
    };
    stateMachine.handleKeystroke(blindspotKey, 2);
    expect(stateMachine.getWordState(2)?.currentLevel).toBe(ScaffoldLevel.LEVEL_1_MICRO_LENS);

    // 2. User successfully decodes and types remaining chars under scaffolding with NORMAL_FLOW
    const correctKey: AnnotatedKeystroke = {
      key: 'n',
      expectedChar: 'n',
      keydownTimestamp: 1500,
      ikiMs: 250,
      dwellTimeMs: 75,
      isCorrect: true,
      charIndex: 9,
      isWeakenedPhoneme: false,
      associatedPhenomena: [],
      cognitiveState: 'NORMAL_FLOW',
    };
    const stateAfterCorrect = stateMachine.handleKeystroke(correctKey, 2);

    // Assert Fading: Level resets to LEVEL_0_NONE and prompts clear
    expect(stateAfterCorrect.currentLevel).toBe(ScaffoldLevel.LEVEL_0_NONE);
    expect(stateAfterCorrect.lensSchedule).toBeUndefined();
    expect(stateAfterCorrect.hint).toBeUndefined();

    // Assert Overcome Event recorded
    const overcomeEvents = stateMachine.getOvercomeEvents();
    expect(overcomeEvents).toHaveLength(1);
    expect(overcomeEvents[0].wordIndex).toBe(2);
    expect(overcomeEvents[0].word).toBe('and');
    expect(overcomeEvents[0].resolvedLevel).toBe(ScaffoldLevel.LEVEL_1_MICRO_LENS);
    expect(overcomeEvents[0].attempts).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test Case 4: MOTOR_TYPO does NOT trigger false acoustic escalation
  // ---------------------------------------------------------------------------
  it('Test Case 4: Pure mechanical slips (MOTOR_TYPO) do NOT escalate acoustic scaffolding', () => {
    const wordIdx = 0; // "hold"
    const initialState = stateMachine.getWordState(wordIdx)!;
    expect(initialState.currentLevel).toBe(ScaffoldLevel.LEVEL_0_NONE);

    // Rapid typo + backspace event
    const typoKey: AnnotatedKeystroke = {
      key: 'g',
      expectedChar: 'h',
      keydownTimestamp: 1000,
      ikiMs: 120, // fast mechanical slip
      dwellTimeMs: 65,
      isCorrect: false,
      charIndex: 0,
      isWeakenedPhoneme: false,
      associatedPhenomena: [],
      cognitiveState: 'MOTOR_TYPO',
    };

    const stateAfterTypo = stateMachine.handleKeystroke(typoKey, wordIdx);

    // Must remain at Level 0 (no acoustic intervention for mere finger slip)
    expect(stateAfterTypo.currentLevel).toBe(ScaffoldLevel.LEVEL_0_NONE);
    expect(stateAfterTypo.blindspotTriggered).toBe(false);
    expect(stateAfterTypo.lensSchedule).toBeUndefined();
    expect(stateAfterTypo.hint).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test Case 5: Level 3 Skeleton generation
  // ---------------------------------------------------------------------------
  it('Test Case 5: Escalates to Level 3 on triple obstruction and provides consonant skeleton', () => {
    const makeBlindspotKey = (): AnnotatedKeystroke => ({
      key: 'a',
      expectedChar: 'a',
      keydownTimestamp: 1000,
      ikiMs: 750,
      dwellTimeMs: 80,
      isCorrect: false,
      charIndex: 8,
      isWeakenedPhoneme: true,
      associatedPhenomena: ['REDUCTION'],
      cognitiveState: 'PERCEPTUAL_BLINDSPOT',
    });

    // 1st obstruction -> Level 1
    stateMachine.handleKeystroke(makeBlindspotKey(), 2);
    expect(stateMachine.getWordState(2)?.currentLevel).toBe(ScaffoldLevel.LEVEL_1_MICRO_LENS);

    // 2nd obstruction -> Level 2
    stateMachine.handleKeystroke(makeBlindspotKey(), 2);
    expect(stateMachine.getWordState(2)?.currentLevel).toBe(ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL);

    // 3rd obstruction -> Level 3 (Skeleton)
    const stateL3 = stateMachine.handleKeystroke(makeBlindspotKey(), 2);
    expect(stateL3.currentLevel).toBe(ScaffoldLevel.LEVEL_3_SKELETON);
    expect(stateL3.skeleton).toBe('a _ d');
  });
});
