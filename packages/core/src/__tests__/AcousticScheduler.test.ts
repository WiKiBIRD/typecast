import { describe, it, expect, beforeEach } from 'vitest';
import {
  FSRSGrade,
  AutoGrader,
  AcousticFSRSEngine,
  AdaptiveRecommender,
  AcousticMetricsExporter,
  type PhenomenonType,
} from '../scheduler';
import { ScaffoldLevel, type WordScaffoldState } from '../scaffolding';
import type { ChunkCognitiveReport, AcousticChunkData } from '../dynamics/types';

describe('Phase 4: FSRS Memory Scheduler, Recommender & Metrics Engine', () => {
  let autoGrader: AutoGrader;
  let fsrsEngine: AcousticFSRSEngine;
  let recommender: AdaptiveRecommender;
  let exporter: AcousticMetricsExporter;

  beforeEach(() => {
    autoGrader = new AutoGrader();
    fsrsEngine = new AcousticFSRSEngine();
    recommender = new AdaptiveRecommender(fsrsEngine);
    exporter = new AcousticMetricsExporter(fsrsEngine);
  });

  // ---------------------------------------------------------------------------
  // Test Case 1: Objective Auto-Grader
  // ---------------------------------------------------------------------------
  describe('Module A: AutoGrader', () => {
    it('accurately assigns AGAIN (Grade 1) when severe blindspot escalates to Level 2', () => {
      const mockReport: ChunkCognitiveReport = {
        chunkId: 'chunk_001',
        totalDurationMs: 3200,
        accuracy: 80,
        meanIkiMs: 340,
        blindspotCount: 1,
        typoCount: 0,
        phenomenaBlindspotStats: {
          ELISION: { totalOccurrences: 1, blindspots: 1 },
          LINKING: { totalOccurrences: 1, blindspots: 0 },
        },
        keystrokes: [],
      };

      const wordStates: WordScaffoldState[] = [
        {
          wordIndex: 0,
          word: 'sit',
          currentLevel: ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL,
          attempts: 2,
          blindspotTriggered: true,
          hint: {
            phenomenon: 'ELISION',
            targetWord: 'sit',
            ipaCitation: '/sɪt/',
            ipaActual: '[sɪʔ]',
            acousticExplanation: '失去爆破',
          },
        },
      ];

      const result = autoGrader.gradeChunk(mockReport, wordStates);
      expect(result.overallGrade).toBe(FSRSGrade.AGAIN);
      expect(result.phenomenaGrades.ELISION).toBe(FSRSGrade.AGAIN);
    });

    it('accurately assigns HARD (Grade 2) when blindspot is overcome using Level 1 Micro-Lens only', () => {
      const mockReport: ChunkCognitiveReport = {
        chunkId: 'chunk_002',
        totalDurationMs: 2500,
        accuracy: 90,
        meanIkiMs: 290,
        blindspotCount: 1,
        typoCount: 0,
        phenomenaBlindspotStats: {
          LINKING: { totalOccurrences: 1, blindspots: 1 },
        },
        keystrokes: [],
      };

      const wordStates: WordScaffoldState[] = [
        {
          wordIndex: 0,
          word: 'hold',
          currentLevel: ScaffoldLevel.LEVEL_1_MICRO_LENS,
          attempts: 1,
          blindspotTriggered: true,
        },
      ];

      const result = autoGrader.gradeChunk(mockReport, wordStates);
      expect(result.overallGrade).toBe(FSRSGrade.HARD);
      expect(result.phenomenaGrades.LINKING).toBe(FSRSGrade.HARD);
    });

    it('accurately assigns GOOD (Grade 3) on normal flow with zero scaffolding', () => {
      const mockReport: ChunkCognitiveReport = {
        chunkId: 'chunk_003',
        totalDurationMs: 2000,
        accuracy: 100,
        meanIkiMs: 270,
        blindspotCount: 0,
        typoCount: 0,
        phenomenaBlindspotStats: {
          REDUCTION: { totalOccurrences: 1, blindspots: 0 },
        },
        keystrokes: [],
      };

      const wordStates: WordScaffoldState[] = [
        {
          wordIndex: 0,
          word: 'and',
          currentLevel: ScaffoldLevel.LEVEL_0_NONE,
          attempts: 1,
          blindspotTriggered: false,
        },
      ];

      const result = autoGrader.gradeChunk(mockReport, wordStates);
      expect(result.overallGrade).toBe(FSRSGrade.GOOD);
      expect(result.phenomenaGrades.REDUCTION).toBe(FSRSGrade.GOOD);
    });

    it('accurately assigns EASY (Grade 4) on automated normal flow with latency below baseline', () => {
      const mockReport: ChunkCognitiveReport = {
        chunkId: 'chunk_004',
        totalDurationMs: 1500,
        accuracy: 100,
        meanIkiMs: 180, // Way below baseline (280 - 40 = 240)
        blindspotCount: 0,
        typoCount: 0,
        phenomenaBlindspotStats: {
          LINKING: { totalOccurrences: 1, blindspots: 0 },
        },
        keystrokes: [],
      };

      const wordStates: WordScaffoldState[] = [];

      const result = autoGrader.gradeChunk(mockReport, wordStates, 280, 80);
      expect(result.overallGrade).toBe(FSRSGrade.EASY);
      expect(result.phenomenaGrades.LINKING).toBe(FSRSGrade.EASY);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 2: FSRS Retrievability Decay and Exponential Stability Growth
  // ---------------------------------------------------------------------------
  describe('Module B: AcousticFSRSEngine', () => {
    it('verifies that at t = S, Retrievability R decays precisely to 0.90 ± 0.01', () => {
      const ph: PhenomenonType = 'REDUCTION';

      // Set stability to 5.0 days
      const state = fsrsEngine.getItemState(ph);
      state.stability = 5.0;
      fsrsEngine.importState({ [ph]: state } as any);

      // Query Retrievability at t = 5.0 days (t == S)
      const r = fsrsEngine.getRetrievability(ph, 5.0);

      // Expect R to be within 0.90 ± 0.01
      expect(r).toBeGreaterThanOrEqual(0.89);
      expect(r).toBeLessThanOrEqual(0.91);
      expect(Math.abs(r - 0.9)).toBeLessThan(0.005);
    });

    it('verifies exponential stability growth across consecutive GOOD ratings and collapse on AGAIN', () => {
      const ph: PhenomenonType = 'ELISION';

      // Initial stability = 1.0 day
      expect(fsrsEngine.getItemState(ph).stability).toBe(1.0);

      // Review 1: GOOD after 1 day
      const r1 = fsrsEngine.recordPractice(ph, FSRSGrade.GOOD, 1.0);
      expect(r1.stability).toBeGreaterThan(1.5);

      // Review 2: GOOD after S1 days
      const r2 = fsrsEngine.recordPractice(ph, FSRSGrade.GOOD, r1.stability);
      expect(r2.stability).toBeGreaterThan(r1.stability * 1.5);

      // Review 3: GOOD after S2 days
      const r3 = fsrsEngine.recordPractice(ph, FSRSGrade.GOOD, r2.stability);
      expect(r3.stability).toBeGreaterThan(r2.stability * 1.5);

      // Relapse on AGAIN -> Stability drops significantly
      const rAgain = fsrsEngine.recordPractice(ph, FSRSGrade.AGAIN, 0.5);
      expect(rAgain.stability).toBeLessThan(r3.stability * 0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 3: Adaptive Prosodic Recommender
  // ---------------------------------------------------------------------------
  describe('Module C: AdaptiveRecommender', () => {
    it('accurately prioritizes the chunk containing the most forgotten (lowest R) acoustic phenomenon', () => {
      // Setup 3 candidate chunks targeting different phenomena
      const chunk1: AcousticChunkData = {
        chunk_id: 'chunk_linking',
        start_ms: 0,
        end_ms: 2000,
        text: 'hold on',
        words: [
          { word: 'hold', start_ms: 0, end_ms: 500, phonemes: [], phenomena: ['LINKING'] },
          { word: 'on', start_ms: 500, end_ms: 1000, phonemes: [], phenomena: [] },
        ],
      };

      const chunk2: AcousticChunkData = {
        chunk_id: 'chunk_reduction',
        start_ms: 0,
        end_ms: 2000,
        text: 'and then',
        words: [
          { word: 'and', start_ms: 0, end_ms: 500, phonemes: [], phenomena: ['REDUCTION'] },
          { word: 'then', start_ms: 500, end_ms: 1000, phonemes: [], phenomena: [] },
        ],
      };

      const chunk3: AcousticChunkData = {
        chunk_id: 'chunk_glottal',
        start_ms: 0,
        end_ms: 2000,
        text: 'sit down',
        words: [
          { word: 'sit', start_ms: 0, end_ms: 500, phonemes: [], phenomena: ['GLOTTAL_STOP'] },
          { word: 'down', start_ms: 500, end_ms: 1000, phonemes: [], phenomena: [] },
        ],
      };

      // Set REDUCTION to low stability / high elapsed time (R ~ 0.5, severe decay)
      // Set LINKING to high stability (R ~ 0.95)
      // Set GLOTTAL_STOP to moderate stability (R ~ 0.85)
      const stRed = fsrsEngine.getItemState('REDUCTION');
      stRed.stability = 0.5;
      stRed.difficulty = 8.0;

      const stLink = fsrsEngine.getItemState('LINKING');
      stLink.stability = 10.0;
      stLink.difficulty = 3.0;

      const stGlot = fsrsEngine.getItemState('GLOTTAL_STOP');
      stGlot.stability = 3.0;
      stGlot.difficulty = 5.0;

      fsrsEngine.importState({
        REDUCTION: stRed,
        LINKING: stLink,
        GLOTTAL_STOP: stGlot,
      } as any);

      // Run recommendation after 2 elapsed days
      const results = recommender.recommend([chunk1, chunk2, chunk3], 2.0);

      expect(results).toHaveLength(3);
      // Top recommendation must be chunk2 (REDUCTION) because it has highest Acoustic Gain Score
      expect(results[0].chunk.chunk_id).toBe('chunk_reduction');
      expect(results[0].targetedPhenomena).toContain('REDUCTION');
      expect(results[0].acousticGainScore).toBeGreaterThan(results[1].acousticGainScore);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Case 4: 5D Radar Profile and Power Law Latency Convergence
  // ---------------------------------------------------------------------------
  describe('Module D: AcousticMetricsExporter', () => {
    it('verifies 5D radar vector scores fall within 0~100 and computes accurate latency reduction', () => {
      // Record latency trajectory for LINKING (demonstrating Power Law convergence from 450ms -> 220ms)
      exporter.recordLatency('LINKING', 450);
      exporter.recordLatency('LINKING', 380);
      exporter.recordLatency('LINKING', 300);
      exporter.recordLatency('LINKING', 225); // 50% latency drop

      exporter.addOvercomeCount(3);

      const conv = exporter.getLatencyConvergence('LINKING');
      expect(conv.initialIki).toBe(450);
      expect(conv.currentIki).toBe(225);
      expect(conv.reductionPercent).toBe(50.0);

      // Export Radar Profile
      const profile = exporter.exportRadarProfile(0.5);

      expect(profile.totalOvercomeCount).toBe(3);
      expect(profile.meanLatencyReductionPercent).toBe(50.0);

      // Verify all 5 radar vector dimensions exist and are within [0, 100]
      const phenomenaList: PhenomenonType[] = [
        'LINKING',
        'REDUCTION',
        'ELISION',
        'ASSIMILATION',
        'GLOTTAL_STOP',
      ];
      for (const ph of phenomenaList) {
        const score = profile.radarVector[ph];
        expect(score).toBeDefined();
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });
});
