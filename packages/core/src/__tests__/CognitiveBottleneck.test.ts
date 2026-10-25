import { describe, it, expect, beforeEach } from 'vitest';
import {
  KeystrokeTracker,
  AcousticCharMapper,
  CognitiveBottleneckClassifier,
  type AcousticChunkData,
  type RawKeystrokeEvent,
} from '../dynamics';

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

describe('Phase 2: Keystroke Dynamics & Cognitive Bottleneck Classifier', () => {
  let tracker: KeystrokeTracker;
  let classifier: CognitiveBottleneckClassifier;
  let mapper: AcousticCharMapper;

  beforeEach(() => {
    tracker = new KeystrokeTracker();
    classifier = new CognitiveBottleneckClassifier();
    mapper = new AcousticCharMapper(mockChunk);
  });

  // ---------------------------------------------------------------------------
  // Module A: KeystrokeTracker tests
  // ---------------------------------------------------------------------------
  describe('Module A: KeystrokeTracker', () => {
    it('accurately captures IKI, dwell time, and flight time with microsecond timing', () => {
      tracker.reset(1000);

      // Key 1: 'h' down at 1100, up at 1180
      tracker.recordKeyDown('h', 'h', true, 0, 1100);
      tracker.recordKeyUp('h', 1180);

      // Key 2: 'o' down at 1350, up at 1430
      tracker.recordKeyDown('o', 'o', true, 1, 1350);
      tracker.recordKeyUp('o', 1430);

      const events = tracker.getRawEvents();
      expect(events).toHaveLength(2);

      // First key: IKI from reset start
      expect(events[0].key).toBe('h');
      expect(events[0].ikiMs).toBe(100);
      expect(events[0].dwellTimeMs).toBe(80);

      // Second key: IKI from previous keydown (1350 - 1100 = 250ms)
      expect(events[1].key).toBe('o');
      expect(events[1].ikiMs).toBe(250);
      expect(events[1].dwellTimeMs).toBe(80);
      // Flight time from previous keyup (1350 - 1180 = 170ms)
      expect(events[1].flightTimeMs).toBe(170);
    });
  });

  // ---------------------------------------------------------------------------
  // Module B: AcousticCharMapper tests
  // ---------------------------------------------------------------------------
  describe('Module B: AcousticCharMapper', () => {
    it('correctly maps character positions to phonemes and acoustic phenomena tags', () => {
      // "hold on and sit down"
      // 'h' at 0
      const ctxH = mapper.getContextAt(0);
      expect(ctxH.word).toBe('hold');
      expect(ctxH.associatedPhoneme).toBe('HH');

      // 'd' at 3 (word final consonant of 'hold', has LINKING)
      const ctxD = mapper.getContextAt(3);
      expect(ctxD.char).toBe('d');
      expect(ctxD.associatedPhenomena).toContain('LINKING');

      // 'a' at 8 (first letter of 'and', has REDUCTION and /AH0/ weakened)
      const ctxA = mapper.getContextAt(8);
      expect(ctxA.char).toBe('a');
      expect(ctxA.word).toBe('and');
      expect(ctxA.isWeakenedPhoneme).toBe(true);
      expect(ctxA.associatedPhenomena).toContain('REDUCTION');

      // 't' at 14 (in 'sit', has GLOTTAL_STOP and ELISION)
      const ctxT = mapper.getContextAt(14);
      expect(ctxT.char).toBe('t');
      expect(ctxT.word).toBe('sit');
      expect(ctxT.associatedPhenomena).toContain('GLOTTAL_STOP');
      expect(ctxT.associatedPhenomena).toContain('ELISION');
    });
  });

  // ---------------------------------------------------------------------------
  // Module C: Required Test Scenarios
  // ---------------------------------------------------------------------------
  describe('Module C: Cognitive Bottleneck Diagnosis Rules', () => {
    it('Scenario 1: Simulates rapid typo + immediate backspace, asserting MOTOR_TYPO', () => {
      // User types 'x' mistakenly instead of 's' at charIndex 12 with rapid IKI (140ms),
      // followed immediately by Backspace within 150ms (< 250ms limit).
      const rawEvents: RawKeystrokeEvent[] = [
        {
          key: 'x',
          expectedChar: 's',
          keydownTimestamp: 1000,
          ikiMs: 140, // < 180ms
          dwellTimeMs: 70,
          isCorrect: false,
          charIndex: 12,
        },
        {
          key: 'Backspace',
          expectedChar: 's',
          keydownTimestamp: 1150, // 150ms later (< 250ms)
          ikiMs: 150,
          dwellTimeMs: 60,
          isCorrect: false,
          charIndex: 12,
        },
        {
          key: 's',
          expectedChar: 's',
          keydownTimestamp: 1350,
          ikiMs: 200,
          dwellTimeMs: 80,
          isCorrect: true,
          charIndex: 12,
        },
      ];

      const report = classifier.classifyChunk(mockChunk, rawEvents);

      // The mistake 'x' must be classified as MOTOR_TYPO
      expect(report.keystrokes[0].cognitiveState).toBe('MOTOR_TYPO');
      expect(report.typoCount).toBeGreaterThanOrEqual(1);
      // Correct retry is NORMAL_FLOW
      expect(report.keystrokes[2].cognitiveState).toBe('NORMAL_FLOW');
    });

    it('Scenario 2: Simulates 800ms IKI latency pause at "and" (/AH0/ reduction), asserting PERCEPTUAL_BLINDSPOT', () => {
      // User pauses 800ms at charIndex 8 ('a' of "and", which is weakened /AH0/ + REDUCTION)
      const rawEvents: RawKeystrokeEvent[] = [
        // "on " completed
        {
          key: ' ',
          expectedChar: ' ',
          keydownTimestamp: 1000,
          ikiMs: 220,
          dwellTimeMs: 70,
          isCorrect: true,
          charIndex: 7,
        },
        // At 'a' of "and": acoustic perceptual blackout (800ms pause)
        {
          key: 'a',
          expectedChar: 'a',
          keydownTimestamp: 1800,
          ikiMs: 800, // > 650ms blindspot threshold
          dwellTimeMs: 90,
          isCorrect: true,
          charIndex: 8,
        },
        {
          key: 'n',
          expectedChar: 'n',
          keydownTimestamp: 2020,
          ikiMs: 220,
          dwellTimeMs: 80,
          isCorrect: true,
          charIndex: 9,
        },
      ];

      const report = classifier.classifyChunk(mockChunk, rawEvents);

      // Event at index 1 ('a' in 'and') must be identified as PERCEPTUAL_BLINDSPOT
      const blindspotEvent = report.keystrokes[1];
      expect(blindspotEvent.charIndex).toBe(8);
      expect(blindspotEvent.key).toBe('a');
      expect(blindspotEvent.isWeakenedPhoneme).toBe(true);
      expect(blindspotEvent.associatedPhenomena).toContain('REDUCTION');
      expect(blindspotEvent.cognitiveState).toBe('PERCEPTUAL_BLINDSPOT');

      expect(report.blindspotCount).toBe(1);
    });

    it('Scenario 3: Verifies that full sentence typing generates accurate ChunkCognitiveReport and phenomenaBlindspotStats', () => {
      // Simulate full sentence: "hold on and sit down"
      // Insert:
      // 1. One blindspot at 'd' of 'hold' (LINKING) with 750ms IKI
      // 2. One blindspot at 'a' of 'and' (REDUCTION) with 850ms IKI
      // 3. One motor typo at 'd' of 'down' with fast 120ms IKI + quick backspace
      // 4. Normal flow for other keys (< 300ms)
      const text = mockChunk.text;
      const rawEvents: RawKeystrokeEvent[] = [];
      let time = 1000;

      for (let i = 0; i < text.length; i++) {
        const expected = text[i];
        let iki = 240;

        if (i === 3) {
          // 'd' in 'hold' (LINKING point) -> 750ms blindspot pause
          iki = 750;
        } else if (i === 8) {
          // 'a' in 'and' (REDUCTION point) -> 850ms blindspot pause
          iki = 850;
        }

        time += iki;
        rawEvents.push({
          key: expected,
          expectedChar: expected,
          keydownTimestamp: time,
          ikiMs: iki,
          dwellTimeMs: 80,
          isCorrect: true,
          charIndex: i,
        });
      }

      // Add one motor typo at the end
      const lastTime = rawEvents[rawEvents.length - 1].keydownTimestamp;
      rawEvents.push(
        {
          key: 'm',
          expectedChar: 'n',
          keydownTimestamp: lastTime + 110,
          ikiMs: 110,
          dwellTimeMs: 70,
          isCorrect: false,
          charIndex: text.length - 1,
        },
        {
          key: 'Backspace',
          expectedChar: 'n',
          keydownTimestamp: lastTime + 220,
          ikiMs: 110,
          dwellTimeMs: 65,
          isCorrect: false,
          charIndex: text.length - 1,
        }
      );

      const report = classifier.classifyChunk(mockChunk, rawEvents);

      // Verify report top-level fields
      expect(report.chunkId).toBe('chunk_001');
      expect(report.totalDurationMs).toBeGreaterThan(0);
      expect(report.blindspotCount).toBe(2);
      expect(report.typoCount).toBeGreaterThanOrEqual(1);
      expect(report.accuracy).toBeGreaterThan(80);

      // Verify phenomena-specific blindspot breakdown
      expect(report.phenomenaBlindspotStats).toBeDefined();
      expect(report.phenomenaBlindspotStats.LINKING.blindspots).toBe(1);
      expect(report.phenomenaBlindspotStats.REDUCTION.blindspots).toBe(1);
      expect(report.phenomenaBlindspotStats.ELISION.blindspots).toBe(0);
      expect(report.phenomenaBlindspotStats.GLOTTAL_STOP.blindspots).toBe(0);

      // Total occurrences in chunk must be accounted for
      expect(report.phenomenaBlindspotStats.LINKING.totalOccurrences).toBe(2); // 'hold' and 'on'
      expect(report.phenomenaBlindspotStats.REDUCTION.totalOccurrences).toBe(1); // 'and'
      expect(report.phenomenaBlindspotStats.ELISION.totalOccurrences).toBe(2); // 'and' and 'sit'
      expect(report.phenomenaBlindspotStats.GLOTTAL_STOP.totalOccurrences).toBe(1); // 'sit'
    });

    it('Scenario 4: Smooth normal flow correctly adapts dynamic baseline without raising false alarms', () => {
      // Simulate 10 steady normal keystrokes at 220ms
      const rawEvents: RawKeystrokeEvent[] = [];
      let t = 1000;
      for (let i = 0; i < 10; i++) {
        t += 220;
        rawEvents.push({
          key: mockChunk.text[i],
          expectedChar: mockChunk.text[i],
          keydownTimestamp: t,
          ikiMs: 220,
          dwellTimeMs: 80,
          isCorrect: true,
          charIndex: i,
        });
      }

      const report = classifier.classifyChunk(mockChunk, rawEvents);
      expect(report.blindspotCount).toBe(0);
      expect(report.typoCount).toBe(0);
      expect(report.accuracy).toBe(100);
      for (const k of report.keystrokes) {
        expect(k.cognitiveState).toBe('NORMAL_FLOW');
      }
    });
  });
});
