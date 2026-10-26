#!/usr/bin/env python3
"""
High-Performance Multi-Worker Energy-VAD Batch Calibrator (MFA/VAD Calibration Stage).
Iterates over all 375 episode JSONs and production MP3 streams using parallel multiprocessing workers,
inspecting physical Praat intensity curves, automatically restoring clipped unstressed syllables (e.g. Desserts)
and snapping cutpoints to zero-crossing phase minima. Supports fault-tolerant resume.
"""

import argparse
import glob
import json
import os
import sys
import tempfile
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Dict, Any, List, Optional
import parselmouth

# Add project root to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
from acoustic_pipeline.energy_snapper import AcousticEnergySnapper


PROGRESS_FILE = os.path.join(PROJECT_ROOT, "calibration_progress.json")


def load_progress() -> Dict[str, Any]:
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            return {}
    return {}


def save_progress(progress: Dict[str, Any]) -> None:
    tmp = PROGRESS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fp:
        json.dump(progress, fp, indent=2)
    os.replace(tmp, PROGRESS_FILE)


def download_audio_to_temp(audio_url: str, output_path: str) -> bool:
    cmd = [
        "ffmpeg", "-y", "-i", audio_url,
        "-ac", "1", "-ar", "16000",
        "-loglevel", "error",
        output_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return res.returncode == 0


def process_single_episode(json_path: str) -> Dict[str, Any]:
    ep_name = os.path.basename(json_path)
    try:
        with open(json_path, "r", encoding="utf-8") as fp:
            data = json.load(fp)

        audio_url = data.get("audioUrl")
        if not audio_url:
            return {"status": "skipped", "episode": ep_name, "reason": "no audioUrl"}

        sentences = data.get("sentences", [])
        if not sentences:
            return {"status": "skipped", "episode": ep_name, "reason": "no sentences"}

        # Use unique temp file per process
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp_file:
            tmp_wav = tmp_file.name
            ok = download_audio_to_temp(audio_url, tmp_wav)
            if not ok or not os.path.exists(tmp_wav) or os.path.getsize(tmp_wav) < 1000:
                return {"status": "error", "episode": ep_name, "reason": "audio download failed"}

            snd = parselmouth.Sound(tmp_wav)
            snapper = AcousticEnergySnapper(snd)

            calibrated_count = 0
            total_lead_shift_ms = 0.0

            for i, s in enumerate(sentences):
                orig_start = s["start"]
                orig_end = s["end"]
                prev_end = sentences[i - 1]["end"] if i > 0 else 0.0
                next_start = sentences[i + 1]["start"] if i < len(sentences) - 1 else None

                # 1. Calibrate onset (lookback into gap for unstressed prefixes)
                new_start = snapper.calibrate_sentence_onset(
                    current_start=orig_start,
                    prev_end=prev_end,
                    max_lookback_sec=0.80,
                )

                # 2. Calibrate offset (prevent harsh vowel cutoff, snap to zero-crossing)
                new_end = snapper.calibrate_sentence_offset(
                    current_end=orig_end,
                    next_start=next_start,
                    max_lookahead_sec=0.15,
                )

                # Enforce safety invariant
                if new_start < prev_end + 0.020 and prev_end > 0:
                    new_start = prev_end + 0.020

                if next_start is not None and new_end > next_start - 0.020:
                    new_end = next_start - 0.020

                shift_ms = (orig_start - new_start) * 1000.0
                if abs(shift_ms) >= 30.0:
                    calibrated_count += 1
                    total_lead_shift_ms += shift_ms

                # Update sentence boundaries
                s["start"] = round(new_start, 3)
                s["end"] = round(new_end, 3)

                # If sentence words exist, update first word start if it was aligned to orig_start
                words = s.get("words") or []
                if words:
                    if abs(words[0].get("start", orig_start) - orig_start) < 0.05:
                        words[0]["start"] = round(new_start, 3)
                    if abs(words[-1].get("end", orig_end) - orig_end) < 0.05:
                        words[-1]["end"] = round(new_end, 3)

            # Atomic write back to JSON
            tmp_json = json_path + ".tmp"
            with open(tmp_json, "w", encoding="utf-8") as fp:
                json.dump(data, fp, indent=2, ensure_ascii=False)
            os.replace(tmp_json, json_path)

            avg_shift = (total_lead_shift_ms / calibrated_count) if calibrated_count > 0 else 0.0
            return {
                "status": "success",
                "episode": ep_name,
                "sentences": len(sentences),
                "adjusted": calibrated_count,
                "avg_shift_ms": round(avg_shift, 1),
            }
    except Exception as e:
        return {"status": "error", "episode": ep_name, "reason": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Parallel Energy-VAD Calibrator across 375 episodes.")
    parser.add_argument("--workers", type=int, default=6, help="Parallel worker processes (default: 6)")
    parser.add_argument("--force", action="store_true", help="Force re-calibrate completed episodes")
    args = parser.parse_args()

    base_dir = os.path.join(PROJECT_ROOT, "apps", "web", "public", "data", "episodes")
    all_json_files = sorted(glob.glob(os.path.join(base_dir, "slow-english-*.json")))
    total_files = len(all_json_files)

    progress = load_progress() if not args.force else {}
    pending = [f for f in all_json_files if os.path.basename(f) not in progress]

    print("=" * 60)
    print(f"🎙️ TypeCast 375-Episode Energy-VAD Batch Calibrator")
    print(f"Total episodes : {total_files}")
    print(f"Already done   : {len(progress)}")
    print(f"To process     : {len(pending)}")
    print(f"Worker threads : {args.workers}")
    print("=" * 60)

    if not pending:
        print("🎉 All episodes have already been calibrated!")
        return

    start_time = time.time()
    completed_in_run = 0
    total_adjusted_sentences = 0

    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        future_map = {executor.submit(process_single_episode, f): f for f in pending}

        for future in as_completed(future_map):
            res = future.result()
            ep = res["episode"]

            if res["status"] == "success":
                completed_in_run += 1
                total_adjusted_sentences += res["adjusted"]
                progress[ep] = {
                    "status": "done",
                    "adjusted": res["adjusted"],
                    "avg_shift_ms": res["avg_shift_ms"],
                    "timestamp": time.time(),
                }
                save_progress(progress)

                elapsed = time.time() - start_time
                avg_time = elapsed / completed_in_run
                eta_sec = avg_time * (len(pending) - completed_in_run)
                eta_min = eta_sec / 60.0

                print(
                    f"[{len(progress)}/{total_files}] ✓ {ep}: "
                    f"{res['adjusted']}/{res['sentences']} sentences fixed "
                    f"(avg lead-in: {res['avg_shift_ms']}ms) | ETA: {eta_min:.1f}m"
                )
            else:
                print(f"[ERROR] {ep}: {res.get('reason')}")

    total_time = (time.time() - start_time) / 60.0
    print("\n" + "=" * 60)
    print(f"✨ Full batch calibration completed in {total_time:.2f} minutes!")
    print(f"Total sentences adjusted: {total_adjusted_sentences}")
    print("=" * 60)


if __name__ == "__main__":
    main()
