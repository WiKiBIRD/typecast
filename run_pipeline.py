#!/usr/bin/env python3
"""
Unified CLI Entrypoint for Phoneme-Level MFA Alignment & Acoustic Pipeline (Phase 1).

Usage:
    python run_pipeline.py --audio ./test.wav --transcript "Hold on and sit down" --output ./output.json
    python run_pipeline.py --audio ./test.wav --transcript ./transcript.txt --output ./output.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from acoustic_pipeline import (
    AudioPipelineOutput,
    AcousticFeatureExtractor,
    PhenomenaDetector,
    ProsodyChunker,
    align_audio_and_transcript,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run Phoneme-Level Forced Alignment and Acoustic Feature Analysis Pipeline"
    )
    parser.add_argument("--audio", required=True, help="Path to input audio file (.wav, .mp3, etc.)")
    parser.add_argument(
        "--transcript",
        required=True,
        help="Transcript text string or path to a .txt/.lab file containing transcript"
    )
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    parser.add_argument("--audio_id", default=None, help="Optional audio identifier (defaults to audio stem)")
    parser.add_argument(
        "--mfa-dict",
        default="english_us_arpa",
        help="MFA pronunciation dictionary name or path (default: english_us_arpa)"
    )
    parser.add_argument(
        "--mfa-model",
        default="english_us_arpa",
        help="MFA acoustic model name or path (default: english_us_arpa)"
    )
    parser.add_argument(
        "--force-fallback",
        action="store_true",
        help="Force using the built-in acoustic VAD fallback aligner"
    )
    return parser.parse_args()


def load_transcript(transcript_arg: str) -> str:
    """Reads transcript from file if path exists, otherwise uses string directly."""
    if os.path.isfile(transcript_arg):
        with open(transcript_arg, "r", encoding="utf-8") as f:
            return f.read().strip()
    return transcript_arg.strip()


def main():
    args = parse_args()

    audio_path = os.path.abspath(args.audio)
    if not os.path.exists(audio_path):
        print(f"Error: Audio file does not exist: {audio_path}", file=sys.stderr)
        sys.exit(1)

    transcript_text = load_transcript(args.transcript)
    if not transcript_text:
        print("Error: Transcript text is empty.", file=sys.stderr)
        sys.exit(1)

    audio_id = args.audio_id or Path(audio_path).stem
    print(f"\n🚀 [Phase 1 Pipeline] Processing: {audio_id}")
    print(f"   Audio file: {audio_path}")
    print(f"   Transcript: \"{transcript_text}\"")

    try:
        # Step 1: Preprocessing & Forced Alignment
        print("\n🔹 Step 1/4: Audio Normalization & Phoneme Alignment...")
        norm_wav_path, words, duration_ms = align_audio_and_transcript(
            audio_path=audio_path,
            transcript=transcript_text,
            mfa_dictionary=args.mfa_dict,
            mfa_acoustic_model=args.mfa_model,
            force_fallback=args.force_fallback
        )
        print(f"   Aligned {len(words)} words over {duration_ms} ms.")

        # Step 2: Acoustic Feature Extraction
        print("\n🔹 Step 2/4: Physical Acoustic Feature Extraction (Parselmouth)...")
        extractor = AcousticFeatureExtractor(norm_wav_path)
        print(f"   Extracted Intensity, Pitch (F0), and Burg Formants (F1/F2).")

        # Step 3: Phenomena Detection
        print("\n🔹 Step 3/4: Acoustic Phenomena Rule Detection...")
        detector = PhenomenaDetector(extractor)
        words_with_phenomena = detector.detect_all(words)

        phenomena_count = sum(len(w.phenomena) for w in words_with_phenomena)
        print(f"   Detected {phenomena_count} total phenomenon occurrences across {len(words_with_phenomena)} words.")

        # Step 4: Cognitive & Prosodic Chunking
        print("\n🔹 Step 4/4: Prosodic Thought Group Chunking (7±2 words & pause >= 250ms)...")
        chunker = ProsodyChunker(pause_threshold_ms=250)
        chunks = chunker.chunk(words_with_phenomena)
        print(f"   Constructed {len(chunks)} prosodic chunk(s).")

        # Step 5: Serialize Output Schema
        output_data = AudioPipelineOutput(
            audio_id=audio_id,
            duration_ms=duration_ms,
            chunks=chunks
        )

        output_path = os.path.abspath(args.output)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        json_str = output_data.model_dump_json(indent=2)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(json_str)

        print(f"\n✅ Pipeline completed successfully! Result written to: {output_path}")

        # Summary preview
        print("\n--- Summary Preview ---")
        for c in chunks:
            print(f"[{c.chunk_id}] ({c.start_ms}ms - {c.end_ms}ms) \"{c.text}\"")
            for w in c.words:
                phen_str = f" -> {w.phenomena}" if w.phenomena else ""
                phone_str = " ".join(p.phoneme for p in w.phonemes)
                print(f"   • {w.word:<10} [{w.start_ms:4d}-{w.end_ms:4d}ms] ({phone_str}){phen_str}")
        print("-----------------------\n")

    except Exception as e:
        print(f"\n❌ Pipeline execution failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
