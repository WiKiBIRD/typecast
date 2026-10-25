"""
Unit tests for the Phoneme-Level Acoustic Pipeline (Phase 1).
Validates schema compliance, alignment, acoustic feature extraction,
phenomena detection, prosodic chunking, and CLI execution.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
import numpy as np
import soundfile as sf

# Add repository root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from acoustic_pipeline.schema import AudioPipelineOutput, ChunkModel, WordModel, PhonemeModel
from acoustic_pipeline.aligner import align_audio_and_transcript, clean_transcript
from acoustic_pipeline.acoustic_features import AcousticFeatureExtractor
from acoustic_pipeline.phenomena_detector import PhenomenaDetector
from acoustic_pipeline.prosody_chunker import ProsodyChunker


def generate_synthetic_speech_wav(filepath: str, duration_sec: float = 3.2, sample_rate: int = 16000):
    """
    Generates a synthetic speech-like acoustic signal containing fundamental frequencies (F0 ~ 130Hz)
    and vowel-like formant resonances to test Parselmouth acoustic algorithms.
    """
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    # Fundamental frequency + harmonics (voice source)
    f0 = 135.0
    signal = 0.5 * np.sin(2 * np.pi * f0 * t) + 0.25 * np.sin(2 * np.pi * 2 * f0 * t) + 0.15 * np.sin(2 * np.pi * 3 * f0 * t)

    # Formant resonances (F1 ~ 500Hz, F2 ~ 1500Hz)
    f1_res = 0.2 * np.sin(2 * np.pi * 500 * t)
    f2_res = 0.15 * np.sin(2 * np.pi * 1500 * t)
    signal = signal + f1_res + f2_res

    # Apply speech burst and amplitude envelope
    envelope = np.ones_like(t)
    # 100ms fade in/out
    fade_len = int(sample_rate * 0.1)
    envelope[:fade_len] = np.linspace(0, 1, fade_len)
    envelope[-fade_len:] = np.linspace(1, 0, fade_len)

    # Add a short pause gap in the middle to test pause detection
    pause_start = int(sample_rate * 1.5)
    pause_end = int(sample_rate * 1.8)  # 300ms pause
    envelope[pause_start:pause_end] = 0.001

    signal = signal * envelope
    # Normalize to avoid clipping
    signal = signal / np.max(np.abs(signal)) * 0.8
    sf.write(filepath, signal.astype(np.float32), sample_rate, subtype="PCM_16")


class TestAcousticPipeline(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.test_dir = tempfile.mkdtemp(prefix="acoustic_test_")
        cls.test_wav = os.path.join(cls.test_dir, "example_001.wav")
        cls.test_transcript = "Hold on and sit down"
        generate_synthetic_speech_wav(cls.test_wav, duration_sec=3.2)

    def test_01_text_cleaning(self):
        raw = "Hold on, and sit down! -- Right now?"
        cleaned = clean_transcript(raw)
        self.assertEqual(cleaned, "hold on and sit down right now")

    def test_02_alignment_and_normalization(self):
        norm_wav, words, duration_ms = align_audio_and_transcript(
            self.test_wav,
            self.test_transcript,
            force_fallback=True
        )
        self.assertTrue(os.path.exists(norm_wav))
        self.assertGreater(duration_ms, 2500)
        self.assertEqual(len(words), 5)  # "hold", "on", "and", "sit", "down"

        # Verify word structure
        for w in words:
            self.assertIsInstance(w, WordModel)
            self.assertGreater(w.end_ms, w.start_ms)
            self.assertGreater(len(w.phonemes), 0)
            for p in w.phonemes:
                self.assertIsInstance(p, PhonemeModel)
                self.assertGreaterEqual(p.end_ms, p.start_ms)
                self.assertIn(p.stress, [0, 1, 2])
                self.assertIsInstance(p.is_weakened, bool)

    def test_03_acoustic_features_extraction(self):
        extractor = AcousticFeatureExtractor(self.test_wav)
        self.assertGreater(extractor.duration_sec, 3.0)

        # Intensity check
        mean_int = extractor.get_mean_intensity(100, 1000)
        self.assertGreater(mean_int, 20.0)

        # Pitch check
        pitch_val = extractor.get_pitch(0.5)
        self.assertIsNotNone(pitch_val)
        self.assertGreater(pitch_val, 70.0)

        # Formant check
        f1, f2 = extractor.get_mean_formants(200, 600)
        self.assertIsNotNone(f1)
        self.assertIsNotNone(f2)

    def test_04_phenomena_detector(self):
        norm_wav, words, _ = align_audio_and_transcript(
            self.test_wav,
            self.test_transcript,
            force_fallback=True
        )
        extractor = AcousticFeatureExtractor(norm_wav)
        detector = PhenomenaDetector(extractor)
        processed_words = detector.detect_all(words)

        all_phenomena = [p for w in processed_words for p in w.phenomena]
        # Verify valid phenomena set
        valid_set = {"REDUCTION", "LINKING", "ELISION", "ASSIMILATION", "GLOTTAL_STOP"}
        for ph in all_phenomena:
            self.assertIn(ph, valid_set)

    def test_05_prosody_chunker(self):
        norm_wav, words, _ = align_audio_and_transcript(
            self.test_wav,
            self.test_transcript,
            force_fallback=True
        )
        chunker = ProsodyChunker(pause_threshold_ms=250)
        chunks = chunker.chunk(words)

        self.assertGreaterEqual(len(chunks), 1)
        first_chunk = chunks[0]
        self.assertIsInstance(first_chunk, ChunkModel)
        self.assertTrue(first_chunk.chunk_id.startswith("chunk_"))
        self.assertGreater(first_chunk.end_ms, first_chunk.start_ms)
        self.assertEqual(len(first_chunk.words), len(words))

    def test_06_schema_validation_and_json(self):
        norm_wav, words, duration_ms = align_audio_and_transcript(
            self.test_wav,
            self.test_transcript,
            force_fallback=True
        )
        extractor = AcousticFeatureExtractor(norm_wav)
        detector = PhenomenaDetector(extractor)
        words = detector.detect_all(words)
        chunker = ProsodyChunker(pause_threshold_ms=250)
        chunks = chunker.chunk(words)

        output = AudioPipelineOutput(
            audio_id="example_001",
            duration_ms=duration_ms,
            chunks=chunks
        )

        json_str = output.model_dump_json()
        data = json.loads(json_str)

        # Validate Schema keys
        self.assertEqual(data["audio_id"], "example_001")
        self.assertEqual(data["duration_ms"], duration_ms)
        self.assertIn("chunks", data)
        self.assertIsInstance(data["chunks"], list)
        self.assertGreater(len(data["chunks"]), 0)

        chunk0 = data["chunks"][0]
        self.assertIn("chunk_id", chunk0)
        self.assertIn("start_ms", chunk0)
        self.assertIn("end_ms", chunk0)
        self.assertIn("text", chunk0)
        self.assertIn("words", chunk0)

        word0 = chunk0["words"][0]
        self.assertIn("word", word0)
        self.assertIn("start_ms", word0)
        self.assertIn("end_ms", word0)
        self.assertIn("phonemes", word0)
        self.assertIn("phenomena", word0)

        phone0 = word0["phonemes"][0]
        self.assertIn("phoneme", phone0)
        self.assertIn("start_ms", phone0)
        self.assertIn("end_ms", phone0)
        self.assertIn("is_weakened", phone0)
        self.assertIn("stress", phone0)

    def test_07_cli_execution(self):
        output_json = os.path.join(self.test_dir, "cli_output.json")
        cmd = [
            sys.executable,
            "run_pipeline.py",
            "--audio", self.test_wav,
            "--transcript", self.test_transcript,
            "--output", output_json,
            "--force-fallback"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        self.assertEqual(res.returncode, 0, f"CLI error: {res.stderr}")
        self.assertTrue(os.path.exists(output_json))

        with open(output_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["audio_id"], "example_001")
        self.assertGreater(len(data["chunks"]), 0)


if __name__ == "__main__":
    unittest.main()
