#!/usr/bin/env python3
"""
Read-only Episode & Acoustic Data Health Check (M0/M6).
Outputs statistical metrics across all episodes and acoustic alignment files.
"""

import glob
import json
import os
import statistics as st

def main() -> None:
    base_dir = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "data")
    ep_files = sorted(glob.glob(os.path.join(base_dir, "episodes", "*.json")))
    ac_ep_files = sorted(glob.glob(os.path.join(base_dir, "acoustic", "ep-*.acoustic.json")))
    ac_dup_files = sorted(glob.glob(os.path.join(base_dir, "acoustic", "slow-english-ep-*.acoustic.json")))

    total_sentences = 0
    zero_lead_in = 0
    zero_tail = 0
    overlaps = 0
    tight_gaps_80ms = 0
    zero_dur_words = 0
    words_outside_sentence = 0
    long_sentences_20s = 0
    word_count_mismatches = 0
    gaps = []

    for f in ep_files:
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
        sentences = data.get("sentences", [])
        for i, s in enumerate(sentences):
            total_sentences += 1
            dur = s["end"] - s["start"]
            if dur > 20.0:
                long_sentences_20s += 1
            words = s.get("words") or []
            if words:
                if abs(words[0]["start"] - s["start"]) < 1e-6:
                    zero_lead_in += 1
                if abs(words[-1]["end"] - s["end"]) < 1e-6:
                    zero_tail += 1
            if len(s.get("text", "").split()) != len(words):
                word_count_mismatches += 1
            for w in words:
                if w["end"] - w["start"] <= 1e-4:
                    zero_dur_words += 1
                if w["start"] < s["start"] - 1e-6 or w["end"] > s["end"] + 1e-6:
                    words_outside_sentence += 1
            if i > 0:
                gap = s["start"] - sentences[i - 1]["end"]
                gaps.append(gap)
                if gap < 0:
                    overlaps += 1
                elif gap < 0.08:
                    tight_gaps_80ms += 1

    report = {
        "episodes_count": len(ep_files),
        "acoustic_ep_files": len(ac_ep_files),
        "acoustic_duplicate_files": len(ac_dup_files),
        "total_sentences": total_sentences,
        "zero_lead_in_sentences": zero_lead_in,
        "zero_tail_sentences": zero_tail,
        "sentence_overlaps": overlaps,
        "tight_gaps_under_80ms": tight_gaps_80ms,
        "median_gap_sec": round(st.median(gaps), 3) if gaps else 0,
        "long_sentences_over_20s": long_sentences_20s,
        "zero_duration_words": zero_dur_words,
        "words_outside_sentence_bounds": words_outside_sentence,
        "episode_word_count_mismatches_p3": word_count_mismatches,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
