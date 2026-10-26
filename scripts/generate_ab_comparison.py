#!/usr/bin/env python3
"""
Generate an interactive HTML A/B comparison review page for calibrated episodes.
Includes audio snippets (base64) for Before (Whisper) vs After (Calibrated MMS_FA + VAD).
"""

import os
import sys
import json
import base64
import io
import re
import numpy as np
import parselmouth
from scipy.io import wavfile

HTML_OUTPUT_PATH = "/Users/ac/.gemini/antigravity/brain/adb777eb-3bd9-4633-8fb1-e05f688f70bf/acoustic_calibration_ab_review.html"

def audio_slice_to_base64_wav(sound: parselmouth.Sound, t_start: float, t_end: float) -> str:
    """Extract slice and return as base64 data URI."""
    sr = int(sound.sampling_frequency)
    samples = sound.as_array()[0]
    idx_s = max(0, int(round(t_start * sr)))
    idx_e = min(len(samples), int(round(t_end * sr)))
    sub = samples[idx_s:idx_e]
    
    # Scale to 16-bit PCM
    scaled = np.int16(sub / np.max(np.abs(sub) + 1e-6) * 32767 * 0.9)
    buf = io.BytesIO()
    wavfile.write(buf, sr, scaled)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:audio/wav;base64,{b64}"

def generate_ab_page(episode_id: str, original_sentences: list, calibrated_sentences: list, audio_path: str, output_path: str = HTML_OUTPUT_PATH):
    sound = parselmouth.Sound(audio_path)
    
    # Select sentences for review:
    # 1. Known regressions: S24 (index 23), S25 (index 24)
    # 2. Largest shift sentences
    # 3. Random sample across episode
    total = len(original_sentences)
    items = []
    
    for i in range(total):
        orig = original_sentences[i]
        calib = calibrated_sentences[i]
        shift_s = abs(calib["start"] - orig["start"])
        shift_e = abs(calib["end"] - orig["end"])
        total_shift = shift_s + shift_e
        items.append({
            "index": i,
            "text": orig["text"],
            "orig_start": orig["start"],
            "orig_end": orig["end"],
            "calib_start": calib["start"],
            "calib_end": calib["end"],
            "lead_change_ms": round((orig["start"] - calib["start"]) * 1000),
            "tail_change_ms": round((calib["end"] - orig["end"]) * 1000),
            "total_shift": total_shift
        })
    
    # Sort by total shift descending
    sorted_by_shift = sorted(items, key=lambda x: x["total_shift"], reverse=True)
    
    selected_indices = set()
    # Always include S24 and S25
    selected_indices.add(23)
    selected_indices.add(24)
    
    # Top 15 largest shift
    for item in sorted_by_shift:
        if len(selected_indices) >= 15:
            break
        selected_indices.add(item["index"])
    
    # Add random spread to reach 20-25 samples
    step = total // 10
    for i in range(0, total, max(1, step)):
        selected_indices.add(i)
        if len(selected_indices) >= 22:
            break
            
    selected_items = [items[i] for i in sorted(selected_indices)]
    
    # Generate HTML cards
    cards_html = []
    for rank, it in enumerate(selected_items):
        idx = it["index"]
        # Generate base64 audio for before and after
        audio_before = audio_slice_to_base64_wav(sound, it["orig_start"], it["orig_end"])
        audio_after = audio_slice_to_base64_wav(sound, it["calib_start"], it["calib_end"])
        
        is_known = (idx in (23, 24))
        badge_class = "badge-known" if is_known else "badge-normal"
        badge_text = "🌟 用户反馈核心案例" if is_known else f"案例 #{rank+1}"
        
        lead_sign = "+" if it["lead_change_ms"] > 0 else ""
        tail_sign = "+" if it["tail_change_ms"] > 0 else ""
        
        card = f"""
        <div class="card {'highlight-card' if is_known else ''}">
            <div class="card-header">
                <span class="badge {badge_class}">{badge_text}</span>
                <span class="sent-idx">第 {idx+1} 句 (ep-001)</span>
                <span class="shift-info">开头扩展: <b>{lead_sign}{it['lead_change_ms']}ms</b> | 结尾扩展: <b>{tail_sign}{it['tail_change_ms']}ms</b></span>
            </div>
            <div class="sentence-text">"{it['text']}"</div>
            <div class="comparison-grid">
                <div class="compare-col before-col">
                    <div class="col-title">🔴 修复前 (Whisper 原版)</div>
                    <div class="bounds-text">{it['orig_start']:.3f}s ➔ {it['orig_end']:.3f}s (时长: {it['orig_end']-it['orig_start']:.2f}s)</div>
                    <audio controls src="{audio_before}"></audio>
                </div>
                <div class="compare-col after-col">
                    <div class="col-title">🟢 修复后 (MMS_FA 声学强制对齐)</div>
                    <div class="bounds-text">{it['calib_start']:.3f}s ➔ {it['calib_end']:.3f}s (时长: {it['calib_end']-it['calib_start']:.2f}s)</div>
                    <audio controls src="{audio_after}"></audio>
                </div>
            </div>
        </div>
        """
        cards_html.append(card)

    cards_joined = "\n".join(cards_html)
    
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>TypeCast 音频切片校准 A/B 试听评审页</title>
<style>
    body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        margin: 0;
        padding: 24px;
        line-height: 1.5;
    }}
    .container {{
        max-width: 1000px;
        margin: 0 auto;
    }}
    header {{
        border-bottom: 1px solid #334155;
        padding-bottom: 20px;
        margin-bottom: 24px;
    }}
    h1 {{
        color: #f8fafc;
        margin: 0 0 8px 0;
        font-size: 24px;
    }}
    .subtitle {{
        color: #94a3b8;
        font-size: 14px;
    }}
    .card {{
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 18px 20px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }}
    .highlight-card {{
        border: 2px solid #38bdf8;
        background: #1e293b;
    }}
    .card-header {{
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
        font-size: 13px;
    }}
    .badge {{
        padding: 3px 8px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 12px;
    }}
    .badge-known {{
        background: #0284c7;
        color: #fff;
    }}
    .badge-normal {{
        background: #475569;
        color: #f1f5f9;
    }}
    .sent-idx {{
        font-weight: 600;
        color: #94a3b8;
    }}
    .shift-info {{
        margin-left: auto;
        color: #38bdf8;
        font-family: monospace;
    }}
    .sentence-text {{
        font-size: 17px;
        font-weight: 500;
        color: #f1f5f9;
        margin-bottom: 16px;
        background: #0f172a;
        padding: 10px 14px;
        border-radius: 8px;
        border-left: 4px solid #38bdf8;
    }}
    .comparison-grid {{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }}
    .compare-col {{
        padding: 12px;
        border-radius: 8px;
    }}
    .before-col {{
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.2);
    }}
    .after-col {{
        background: rgba(34, 197, 94, 0.08);
        border: 1px solid rgba(34, 197, 94, 0.2);
    }}
    .col-title {{
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 4px;
    }}
    .before-col .col-title {{ color: #f87171; }}
    .after-col .col-title {{ color: #4ade80; }}
    .bounds-text {{
        font-size: 12px;
        font-family: monospace;
        color: #94a3b8;
        margin-bottom: 10px;
    }}
    audio {{
        width: 100%;
        height: 36px;
    }}
</style>
</head>
<body>
<div class="container">
    <header>
        <h1>🎧 TypeCast 句边界声学校准 A/B 试听评审 (slow-english-01)</h1>
        <div class="subtitle">
            对比说明：左栏为 Whisper 原始切片（存在吃字、断尾缺陷），右栏为 MMS_FA 声学强制对齐校准切片。<br>
            您可直接点击播放，试听对比两者的首尾发音完整度。
        </div>
    </header>
    <div class="card-list">
        {cards_joined}
    </div>
</div>
</body>
</html>
"""
    with open(output_path, "w", encoding="utf-8") as fp:
        fp.write(html)
    print(f"HTML A/B Review Page generated at: {output_path}")

if __name__ == "__main__":
    # Test generation using existing test output
    pass
