#!/usr/bin/env python3
"""
Production Batch Pipeline & Checkpoint Worker for TypeCast Acoustic Assets.
Processes full podcast episode archives into phoneme-level, phenomena-annotated
acoustic JSON databases with checkpointing, fault tolerance, and multi-worker execution.

Usage:
    # Test run: process first 3 episodes
    python batch_processor.py --limit 3

    # Production full run with 4 worker processes
    python batch_processor.py --workers 4

    # Process specific episode range
    python batch_processor.py --start-ep 1 --end-ep 10
"""

import argparse
import concurrent.futures
import glob
import json
import math
import os
import re
import sys
import tempfile
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from acoustic_pipeline.aligner import (
    normalize_audio,
    get_word_phonemes,
    extract_stress_from_phone,
    clean_transcript,
)
from acoustic_pipeline.acoustic_features import AcousticFeatureExtractor
from acoustic_pipeline.phenomena_detector import PhenomenaDetector
from acoustic_pipeline.schema import (
    WordModel,
    PhonemeModel,
    ChunkModel,
    AudioPipelineOutput,
)


DEFAULT_EPISODES_DIR = PROJECT_ROOT / "apps/web/public/data/episodes"
DEFAULT_MANIFEST = PROJECT_ROOT / "apps/web/public/data/manifest.json"
DEFAULT_AUDIO_DIR = Path("/Users/ac/Downloads/Slow_English_Podcast")
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "apps/web/public/data/acoustic"
DEFAULT_PROGRESS_FILE = PROJECT_ROOT / "batch_progress.json"
DEFAULT_AUDIO_CACHE_DIR = PROJECT_ROOT / ".audio_cache"


# --------------------------------------------------------------------------
# Asset Discovery & Audio Matching
# --------------------------------------------------------------------------
def find_audio_file(ep_num: int, audio_dir: Path) -> Optional[str]:
    """
    Scans local audio directory for episode audio file matching #ep_num.
    Uses strict regex matching on #digits to avoid substring collisions.
    """
    if not audio_dir.exists():
        return None

    patterns = [
        str(audio_dir / f"*#{ep_num} *"),
        str(audio_dir / f"*#{ep_num}-*"),
        str(audio_dir / f"*#{ep_num}*"),
        str(audio_dir / f"*#{ep_num:02d}*"),
        str(audio_dir / f"*#{ep_num:03d}*"),
    ]

    matches: List[str] = []
    for pat in patterns:
        matches.extend(glob.glob(pat))

    for m in matches:
        base = os.path.basename(m)
        num_m = re.search(r"#(\d+)", base)
        if num_m and int(num_m.group(1)) == ep_num:
            return os.path.abspath(m)

    return None


def resolve_audio_file(
    ep_num: int,
    audio_dir: Path,
    audio_url: Optional[str] = None,
    cache_dir: Optional[Path] = None,
) -> str:
    """
    Resolves audio path from local directory, local cache, or downloads from audio_url.
    """
    local_path = find_audio_file(ep_num, audio_dir)
    if local_path and os.path.exists(local_path):
        return local_path

    # Check cache directory
    c_dir = cache_dir or DEFAULT_AUDIO_CACHE_DIR
    c_dir.mkdir(parents=True, exist_ok=True)
    cached_path = c_dir / f"ep_{ep_num:03d}.mp3"
    if cached_path.exists():
        return str(cached_path)

    # Download from audioUrl
    if audio_url:
        print(f"   [Download] Downloading audio for EP #{ep_num} from remote URL...")
        req = urllib.request.Request(
            audio_url,
            headers={"User-Agent": "TypeCast-BatchPipeline/1.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp, open(cached_path, "wb") as out_f:
            out_f.write(resp.read())
        return str(cached_path)

    raise FileNotFoundError(f"Audio file for Episode #{ep_num} could not be found locally or downloaded.")


# --------------------------------------------------------------------------
# Checkpoint & Progress Tracker
# --------------------------------------------------------------------------
class ProgressTracker:
    def __init__(self, progress_file: Path):
        self.progress_file = progress_file
        self.data: Dict[str, Any] = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "total": 0,
            "completed": 0,
            "failed": 0,
            "pending": 0,
            "episodes": {},
        }
        self.load()

    def load(self) -> None:
        if self.progress_file.exists():
            try:
                with open(self.progress_file, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                print(f"[Warning] Failed to load progress file ({e}), starting fresh.")

    def save(self) -> None:
        self.data["updated_at"] = datetime.now(timezone.utc).isoformat()
        temp_file = self.progress_file.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        temp_file.replace(self.progress_file)

    def is_completed(self, ep_id: str, expected_output: Path) -> bool:
        ep_info = self.data.get("episodes", {}).get(ep_id)
        if ep_info and ep_info.get("status") == "COMPLETED" and expected_output.exists():
            return True
        return False

    def mark_completed(
        self,
        ep_id: str,
        ep_num: int,
        sentence_count: int,
        phenomena_counts: Dict[str, int],
        output_file: str,
        duration_sec: float,
    ) -> None:
        self.data.setdefault("episodes", {})[ep_id] = {
            "episodeNumber": ep_num,
            "status": "COMPLETED",
            "sentence_count": sentence_count,
            "phenomena_counts": phenomena_counts,
            "output_file": output_file,
            "duration_sec": round(duration_sec, 2),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
        self._update_summary()
        self.save()

    def mark_failed(self, ep_id: str, ep_num: int, error_msg: str) -> None:
        self.data.setdefault("episodes", {})[ep_id] = {
            "episodeNumber": ep_num,
            "status": "FAILED",
            "error": error_msg,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        self._update_summary()
        self.save()

    def _update_summary(self) -> None:
        episodes = self.data.get("episodes", {})
        comp = sum(1 for v in episodes.values() if v.get("status") == "COMPLETED")
        fail = sum(1 for v in episodes.values() if v.get("status") == "FAILED")
        self.data["completed"] = comp
        self.data["failed"] = fail


# --------------------------------------------------------------------------
# Single Episode Processing Worker
# --------------------------------------------------------------------------
def process_episode_task(
    ep_data_path: str,
    output_dir: str,
    audio_dir: str,
    cache_dir: str,
    force: bool = False,
    verbose: bool = False,
) -> Dict[str, Any]:
    """
    Worker task to process a single episode into full acoustic alignment JSON.
    Runs normalized 16kHz audio conversion + Praat Parselmouth feature extraction
    + phenomena detection across all sentences.
    """
    start_t = time.time()
    with open(ep_data_path, "r", encoding="utf-8") as f:
        ep = json.load(f)

    ep_num = int(ep.get("episodeNumber", 0))
    ep_id = str(ep.get("episodeId", f"slow-english-ep-{ep_num:03d}"))
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    primary_out_file = out_dir / f"ep-{ep_num:03d}.acoustic.json"
    alias_out_file = out_dir / f"slow-english-ep-{ep_num:03d}.acoustic.json"

    # Resolve input audio
    audio_file = resolve_audio_file(
        ep_num=ep_num,
        audio_dir=Path(audio_dir),
        audio_url=ep.get("audioUrl"),
        cache_dir=Path(cache_dir),
    )

    # Normalize audio to 16kHz mono WAV for Parselmouth
    temp_wav = tempfile.mktemp(prefix=f"norm_ep_{ep_num:03d}_", suffix=".wav")
    try:
        _, audio_dur_ms = normalize_audio(audio_file, temp_wav)
        total_dur_ms = int(round(ep.get("duration", audio_dur_ms / 1000) * 1000))

        # Initialize physical feature extractor once for the entire episode
        extractor = AcousticFeatureExtractor(temp_wav)
        detector = PhenomenaDetector(extractor)

        chunks: List[ChunkModel] = []
        total_phenomena: Dict[str, int] = {
            "REDUCTION": 0,
            "LINKING": 0,
            "ELISION": 0,
            "GLOTTAL_STOP": 0,
            "ASSIMILATION": 0,
        }

        sentences = ep.get("sentences", [])
        for s in sentences:
            s_id = str(s.get("id", len(chunks) + 1))
            s_text = s.get("text", "").strip()
            s_start_ms = int(round(s.get("start", 0.0) * 1000))
            s_end_ms = int(round(s.get("end", 0.0) * 1000))

            words_data = s.get("words", [])
            words: List[WordModel] = []

            if words_data:
                for w in words_data:
                    raw_word = w.get("word", "").strip()
                    clean_w = re.sub(r"^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$", "", raw_word).lower()
                    if not clean_w:
                        continue

                    w_start = int(round(w.get("start", s_start_ms / 1000) * 1000))
                    w_end = int(round(w.get("end", s_end_ms / 1000) * 1000))

                    # Safety check on boundaries
                    if w_end <= w_start:
                        w_end = w_start + 120

                    phones, _ = get_word_phonemes(clean_w)
                    seg_len = max(1, (w_end - w_start) // max(1, len(phones)))
                    phone_models: List[PhonemeModel] = []

                    for idx, p in enumerate(phones):
                        p_s = w_start + idx * seg_len
                        p_e = w_end if idx == len(phones) - 1 else p_s + seg_len
                        _, stress = extract_stress_from_phone(p)
                        phone_models.append(
                            PhonemeModel(
                                phoneme=p,
                                start_ms=p_s,
                                end_ms=p_e,
                                is_weakened=False,
                                stress=stress,
                            )
                        )

                    words.append(
                        WordModel(
                            word=clean_w,
                            start_ms=w_start,
                            end_ms=w_end,
                            phonemes=phone_models,
                            phenomena=[],
                        )
                    )
            else:
                # Fallback if words timestamps are absent
                tokens = clean_transcript(s_text).split()
                if tokens:
                    span = max(50, (s_end_ms - s_start_ms) // len(tokens))
                    for idx, token in enumerate(tokens):
                        w_start = s_start_ms + idx * span
                        w_end = s_end_ms if idx == len(tokens) - 1 else w_start + span
                        phones, _ = get_word_phonemes(token)
                        p_span = max(1, (w_end - w_start) // max(1, len(phones)))
                        phone_models = []
                        for p_idx, p in enumerate(phones):
                            p_s = w_start + p_idx * p_span
                            p_e = w_end if p_idx == len(phones) - 1 else p_s + p_span
                            _, stress = extract_stress_from_phone(p)
                            phone_models.append(
                                PhonemeModel(
                                    phoneme=p,
                                    start_ms=p_s,
                                    end_ms=p_e,
                                    is_weakened=False,
                                    stress=stress,
                                )
                            )
                        words.append(
                            WordModel(
                                word=token,
                                start_ms=w_start,
                                end_ms=w_end,
                                phonemes=phone_models,
                                phenomena=[],
                            )
                        )

            # Apply physical acoustic phenomena rules
            words = detector.detect_all(words)

            for w in words:
                for ph in w.phenomena:
                    total_phenomena[ph] = total_phenomena.get(ph, 0) + 1

            chunks.append(
                ChunkModel(
                    chunk_id=s_id,
                    start_ms=s_start_ms,
                    end_ms=s_end_ms,
                    text=s_text,
                    words=words,
                )
            )

        # Build output structure
        output_payload = AudioPipelineOutput(
            audio_id=ep_id,
            duration_ms=total_dur_ms,
            chunks=chunks,
        )

        output_json = output_payload.model_dump_json(indent=2)

        # Write primary file (ep-XXX.acoustic.json)
        with open(primary_out_file, "w", encoding="utf-8") as f:
            f.write(output_json)

        # Write alias file (slow-english-ep-XXX.acoustic.json)
        with open(alias_out_file, "w", encoding="utf-8") as f:
            f.write(output_json)

        elapsed = time.time() - start_t
        return {
            "success": True,
            "ep_id": ep_id,
            "ep_num": ep_num,
            "sentence_count": len(chunks),
            "phenomena_counts": total_phenomena,
            "primary_output": str(primary_out_file),
            "elapsed_sec": elapsed,
        }

    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except OSError:
                pass


# --------------------------------------------------------------------------
# Main Orchestrator CLI
# --------------------------------------------------------------------------
def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Production Batch Pipeline for TypeCast Podcast Acoustic Alignment"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of episodes to process (e.g. --limit 3 for verification)",
    )
    parser.add_argument(
        "--start-ep",
        type=int,
        default=None,
        help="Starting episode number (inclusive)",
    )
    parser.add_argument(
        "--end-ep",
        type=int,
        default=None,
        help="Ending episode number (inclusive)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of concurrent worker processes (default: 1)",
    )
    parser.add_argument(
        "--episodes-dir",
        type=str,
        default=str(DEFAULT_EPISODES_DIR),
        help=f"Path to episodes directory (default: {DEFAULT_EPISODES_DIR})",
    )
    parser.add_argument(
        "--manifest",
        type=str,
        default=str(DEFAULT_MANIFEST),
        help=f"Path to manifest.json (default: {DEFAULT_MANIFEST})",
    )
    parser.add_argument(
        "--audio-dir",
        type=str,
        default=str(DEFAULT_AUDIO_DIR),
        help=f"Path to local audio directory (default: {DEFAULT_AUDIO_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory for .acoustic.json (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--progress-file",
        type=str,
        default=str(DEFAULT_PROGRESS_FILE),
        help=f"Path to checkpoint progress file (default: {DEFAULT_PROGRESS_FILE})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force reprocessing of already completed episodes",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose processing information",
    )
    return parser.parse_args()


def main():
    args = parse_arguments()

    episodes_dir = Path(args.episodes_dir)
    manifest_path = Path(args.manifest)
    audio_dir = Path(args.audio_dir)
    output_dir = Path(args.output_dir)
    progress_file = Path(args.progress_file)
    cache_dir = DEFAULT_AUDIO_CACHE_DIR

    output_dir.mkdir(parents=True, exist_ok=True)
    tracker = ProgressTracker(progress_file)

    # 1. Discover all episode JSON files
    if not episodes_dir.exists():
        print(f"Error: Episodes directory does not exist: {episodes_dir}", file=sys.stderr)
        sys.exit(1)

    json_files = sorted(
        episodes_dir.glob("slow-english-*.json"),
        key=lambda p: int(re.search(r"\d+", p.stem).group(0)) if re.search(r"\d+", p.stem) else 99999,
    )

    if not json_files:
        print(f"Error: No episode json files found in {episodes_dir}", file=sys.stderr)
        sys.exit(1)

    # Filter by start_ep / end_ep
    filtered_tasks: List[Tuple[int, Path]] = []
    for f in json_files:
        num_m = re.search(r"\d+", f.stem)
        if not num_m:
            continue
        ep_num = int(num_m.group(0))
        if args.start_ep is not None and ep_num < args.start_ep:
            continue
        if args.end_ep is not None and ep_num > args.end_ep:
            continue
        filtered_tasks.append((ep_num, f))

    if args.limit is not None and args.limit > 0:
        filtered_tasks = filtered_tasks[: args.limit]

    tracker.data["total"] = len(filtered_tasks)
    tracker.save()

    print("\n" + "=" * 65)
    print("🎙️  TypeCast Production Batch Acoustic Pipeline")
    print(f"   • Discovered Target Episodes: {len(filtered_tasks)}")
    print(f"   • Audio Directory:           {audio_dir}")
    print(f"   • Output Directory:          {output_dir}")
    print(f"   • Checkpoint File:           {progress_file}")
    print(f"   • Worker Processes:          {args.workers}")
    print("=" * 65 + "\n")

    tasks_to_run: List[Tuple[int, Path]] = []
    skipped_count = 0

    for ep_num, json_path in filtered_tasks:
        ep_id = f"slow-english-ep-{ep_num:03d}"
        expected_output = output_dir / f"ep-{ep_num:03d}.acoustic.json"

        if not args.force and tracker.is_completed(ep_id, expected_output):
            print(f"⏩ [EP #{ep_num:03d}] Already completed. Skipping (Checkpoint resumed).")
            skipped_count += 1
            continue

        tasks_to_run.append((ep_num, json_path))

    if not tasks_to_run:
        print(f"\n🎉 All {len(filtered_tasks)} target episodes are already processed and up to date!")
        return

    print(f"⚡ Queueing {len(tasks_to_run)} episodes to process ({skipped_count} skipped by checkpoint)...\n")

    overall_start = time.time()
    success_count = 0
    fail_count = 0

    # Sequential execution
    if args.workers <= 1:
        for ep_num, json_path in tasks_to_run:
            ep_id = f"slow-english-ep-{ep_num:03d}"
            print(f"▶️  [EP #{ep_num:03d}] Starting acoustic analysis...")
            try:
                res = process_episode_task(
                    ep_data_path=str(json_path),
                    output_dir=str(output_dir),
                    audio_dir=str(audio_dir),
                    cache_dir=str(cache_dir),
                    force=args.force,
                    verbose=args.verbose,
                )
                success_count += 1
                tracker.mark_completed(
                    ep_id=res["ep_id"],
                    ep_num=res["ep_num"],
                    sentence_count=res["sentence_count"],
                    phenomena_counts=res["phenomena_counts"],
                    output_file=res["primary_output"],
                    duration_sec=res["elapsed_sec"],
                )
                p_sum = sum(res["phenomena_counts"].values())
                print(
                    f"   ✅ [EP #{ep_num:03d}] Completed in {res['elapsed_sec']:.2f}s | "
                    f"{res['sentence_count']} sentences | {p_sum} acoustic phenomena detected"
                )
                print(
                    f"      ↳ REDUCTION: {res['phenomena_counts'].get('REDUCTION', 0)}, "
                    f"LINKING: {res['phenomena_counts'].get('LINKING', 0)}, "
                    f"GLOTTAL_STOP: {res['phenomena_counts'].get('GLOTTAL_STOP', 0)}, "
                    f"ELISION: {res['phenomena_counts'].get('ELISION', 0)}"
                )
            except Exception as e:
                fail_count += 1
                err_msg = f"{type(e).__name__}: {str(e)}"
                tracker.mark_failed(ep_id, ep_num, err_msg)
                print(f"   ❌ [EP #{ep_num:03d}] Processing failed: {err_msg}", file=sys.stderr)
                if args.verbose:
                    traceback.print_exc()

    # Multi-worker execution
    else:
        with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as executor:
            future_to_ep = {
                executor.submit(
                    process_episode_task,
                    str(json_path),
                    str(output_dir),
                    str(audio_dir),
                    str(cache_dir),
                    args.force,
                    args.verbose,
                ): ep_num
                for ep_num, json_path in tasks_to_run
            }

            for future in concurrent.futures.as_completed(future_to_ep):
                ep_num = future_to_ep[future]
                ep_id = f"slow-english-ep-{ep_num:03d}"
                try:
                    res = future.result()
                    success_count += 1
                    tracker.mark_completed(
                        ep_id=res["ep_id"],
                        ep_num=res["ep_num"],
                        sentence_count=res["sentence_count"],
                        phenomena_counts=res["phenomena_counts"],
                        output_file=res["primary_output"],
                        duration_sec=res["elapsed_sec"],
                    )
                    p_sum = sum(res["phenomena_counts"].values())
                    print(
                        f"✅ [EP #{ep_num:03d}] Processed in {res['elapsed_sec']:.2f}s | "
                        f"{res['sentence_count']} sentences | {p_sum} phenomena"
                    )
                except Exception as e:
                    fail_count += 1
                    err_msg = f"{type(e).__name__}: {str(e)}"
                    tracker.mark_failed(ep_id, ep_num, err_msg)
                    print(f"❌ [EP #{ep_num:03d}] Worker failed: {err_msg}", file=sys.stderr)

    total_time = time.time() - overall_start
    print("\n" + "=" * 65)
    print("📊 Batch Pipeline Summary Report")
    print(f"   • Total Processed:  {success_count + fail_count}")
    print(f"   • Succeeded:        {success_count}")
    print(f"   • Failed:           {fail_count}")
    print(f"   • Checkpoint File:  {progress_file}")
    print(f"   • Output Directory: {output_dir}")
    print(f"   • Total Time Taken: {total_time:.2f}s")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
