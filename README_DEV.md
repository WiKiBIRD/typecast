# TypeCast — Developer Technical Guide

A psychoacoustic deliberate practice and podcast dictation platform built on a pnpm Monorepo (Turborepo).  
Live Application: **[https://typecast.51.edu.kg](https://typecast.51.edu.kg)**

---

## 🏗️ Architecture & Monorepo Topology

```
typecast/
├── apps/
│   └── web/                         # React 19 + Vite 6 + Tailwind CSS 3
│       ├── public/data/
│       │   ├── episodes/            # 375 episode metadata & Whisper word boundaries (.json)
│       │   ├── acoustic/            # 375 production acoustic alignment databases (ep-*.acoustic.json)
│       │   └── manifest.json        # Global episode catalog
│       └── src/
│           ├── components/          # SentenceDisplay, ChallengeResultModal, AcousticRadarView
│           ├── hooks/               # usePracticeSession (state orchestration & audio guards)
│           └── pages/               # PracticePage
├── packages/
│   ├── core/                        # Headless typing, psychoacoustic & memory engine
│   │   ├── src/
│   │   │   ├── dynamics/            # Phase 2: KeystrokeTracker, CognitiveBottleneckClassifier
│   │   │   ├── scaffolding/         # Phase 3: MicroLensTimeScheduler, AcousticLensAudioPlayer
│   │   │   ├── scheduler/           # Phase 4: AcousticFSRSEngine, AcousticStorage (IndexedDB)
│   │   │   ├── TypingEngineCore.ts  # Low-level character cursor & error FSM
│   │   │   └── ChunkAudioPlayer.ts  # Web Audio / HTML5 audio chunk player
│   │   └── dist/
│   └── shared-types/                # Shared TypeScript contracts & schemas
├── acoustic_pipeline/               # Phase 1: Python phoneme-level forced alignment & Praat pipeline
│   ├── aligner.py                   # MFA driver + VAD fallback acoustic aligner
│   ├── acoustic_features.py         # Parselmouth LLD extractor (Intensity, F0, Burg Formants)
│   ├── phenomena_detector.py        # Rule engine for 5 connected speech phenomena
│   ├── prosody_chunker.py           # Cognitive thought group chunker (7±2 words)
│   └── schema.py                    # Strict Pydantic models for acoustic JSON output
├── batch_processor.py               # Industrial batch processor with multi-worker & checkpoint resume
├── batch_progress.json              # 375-episode batch execution checkpoint ledger
└── tests/                           # Python acoustic & batch pipeline test suite
```

**Tech Stack:** React 19 · Vite 6 · Tailwind 3 · Dexie 4 · Praat-Parselmouth · Turborepo · Vitest · Pytest  
**CI/CD:** GitHub Actions → Oracle VPS via rsync over SSH

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/WiKiBIRD/typecast.git
cd typecast

# Install monorepo dependencies
pnpm install

# Start local development server (Vite)
pnpm dev       # http://localhost:5173

# Run TypeScript core test suite (45 tests across 7 test suites)
pnpm test

# Run Python acoustic pipeline test suite (9 tests)
pytest tests/

# Production build (Turborepo compiles shared-types, core, and web)
pnpm build     # outputs to apps/web/dist/
```

---

## 🎙️ Production Acoustic Pipeline & Batch Worker

The repository contains an industrial-grade batch processing pipeline (`batch_processor.py`) capable of aligning hundreds of audio episodes into physical acoustic databases with multi-process workers and checkpoint resume.

### CLI Usage:
```bash
# Verification run on first 3 episodes
python batch_processor.py --limit 3

# Full production run across all 375 episodes using 4 parallel workers
python batch_processor.py --workers 4

# Process specific episode range
python batch_processor.py --start-ep 10 --end-ep 25
```

### Key Features:
- **Praat Parselmouth Feature Extraction**: Computes continuous speech intensity, fundamental frequency (F0), and Burg formants (F1, F2) to detect:
  1. `REDUCTION` (弱读): Vowel duration < 55ms or formant centralization toward neutral Schwa.
  2. `LINKING` (连读): Consonant-vowel juncture with energy continuity and silence gap < 25ms.
  3. `ELISION` (失爆): Stop consonant coda followed by a consonant without release burst.
  4. `GLOTTAL_STOP` (喉塞音): Stop /T/ accompanied by voicing creak or unreleased glottal closure.
  5. `ASSIMILATION` (同化): Alveolar consonant before palatal glide with place migration.
- **Checkpoint & Fault Tolerance**: Maintains `batch_progress.json`. Rerunning automatically skips completed episodes in sub-millisecond time.
- **Frontend Asynchronous Hydration**: `usePracticeSession.ts` asynchronously fetches `apps/web/public/data/acoustic/ep-*.acoustic.json`. If real acoustic data is present, it directly hydrates; if missing, it gracefully falls back to the client-side `sentenceToAcousticChunk` phonemizer.

---

## 🧠 FSRS-DSR Memory & IndexedDB Persistence

User learning data is managed via the `AcousticStorage` module (`packages/core/src/scheduler/AcousticStorage.ts`):
- **Object Stores**:
  - `fsrs_states`: Difficulty, stability, retrievability, and review count across the 5 phenomena.
  - `keystroke_history`: Historical inter-key interval (IKI) latency trajectories modeling the *Power Law of Practice*.
  - `overcome_records`: Historical count of overcome perceptual blindspots.
- **Atomic Session Sync**: Eliminates race conditions when restoring progress from local checkpoints, ensuring that typing cursor, displayed text, bottom progress indicator, and earphone audio time-windows are 100% synchronized.

---

## 🧪 Testing Verification Matrix

| Test Suite | Framework | Scope | Result |
| :--- | :--- | :--- | :--- |
| `@typecast/core` | Vitest 3.2.7 | TypingEngine, FSM, KeystrokeTracker, CognitiveClassifier, MicroLensScheduler, ScaffoldStateMachine, AcousticFSRS, AcousticStorage | **45 / 45 PASS** |
| `acoustic_pipeline` | Pytest 9.0.3 | Forced alignment, Parselmouth features, phenomena detection, prosodic chunking, batch processor | **9 / 9 PASS** |
| `@typecast/web` | Vite + TSC | Production tree-shaking, strict TypeScript typing, Tailwind CSS bundling | **0 Errors** |

---

## 🚢 CI/CD Deployment

Push to `main` branch automatically triggers GitHub Actions workflow:
1. Setup Node 22 + pnpm
2. `pnpm install --frozen-lockfile`
3. `pnpm build`
4. Deploy artifact via `rsync` to `/var/www/typecast` on Oracle VPS

---

## 📜 License & Audio Attribution

- **Software**: [MIT](LICENSE) © 2026 WiKiBIRD
- **Audio Assets**: © *Slow English Podcast with Emilie*. All audio streams are referenced via public open RSS feeds under Fair Use principles for non-commercial educational listening practice.
