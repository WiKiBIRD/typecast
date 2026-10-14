import os
import re
import json
import argparse
from typing import Dict, List, Optional
from faster_whisper import WhisperModel

MANIFEST_PATH = "/Users/ac/Development/typecast/apps/web/public/data/manifest.json"
EPISODES_DIR = "/Users/ac/Development/typecast/apps/web/public/data/episodes"
LOCAL_AUDIO_DIR = "/Users/ac/Downloads/Slow_English_Podcast"

# 建立本地文件名映射表
def build_local_file_map(audio_dir: str) -> Dict[int, str]:
    file_map = {}
    if not os.path.exists(audio_dir):
        return file_map
    for f in os.listdir(audio_dir):
        if not f.endswith(".mp3"):
            continue
        m = re.search(r'#\s*(\d+)', f)
        if m:
            num = int(m.group(1))
            # 优先选择带有 'With Video' 的文件
            if num not in file_map or 'video' in f.lower():
                file_map[num] = os.path.join(audio_dir, f)
    return file_map

def is_intro_phrase(text: str) -> bool:
    """识别开场白套话，用于标注或引导跳过"""
    t = text.lower().strip()
    patterns = [
        r"subscribe to my",
        r"patreon",
        r"link in the description",
        r"myshopify\.com",
        r"download the transcript",
        r"click the link",
    ]
    for p in patterns:
        if re.search(p, t):
            return True
    return False

def process_episode(
    ep_num: int,
    manifest_item: dict,
    audio_path: str,
    model: WhisperModel,
    max_sentences: int = 15,
    padding_start_ms: int = 100,
    padding_end_ms: int = 150
) -> dict:
    print(f"\n🎙️ 正在处理 Episode #{ep_num}: {manifest_item.get('title')}...")
    print(f"   音频源: {os.path.basename(audio_path)}")

    segments, info = model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400)
    )

    clean_sentences = []
    sentence_counter = 1

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        if len(text) < 4:
            continue
        if is_intro_phrase(text):
            continue

        start_sec = max(0.0, round(segment.start - (padding_start_ms / 1000.0), 2))
        end_sec = round(segment.end + (padding_end_ms / 1000.0), 2)

        words_data = []
        if segment.words:
            for w in segment.words:
                w_text = w.word.strip()
                if not w_text:
                    continue
                words_data.append({
                    "word": w_text,
                    "startSec": round(w.start, 2),
                    "endSec": round(w.end, 2),
                    "score": round(w.probability, 2)
                })

        clean_sentences.append({
            "id": sentence_counter,
            "start": start_sec,
            "end": end_sec,
            "text": text,
            "words": words_data
        })
        sentence_counter += 1

        if len(clean_sentences) >= max_sentences:
            break

    # 组装完整的 JSON
    data_file_name = f"slow-english-{ep_num:02d}.json" if ep_num < 100 else f"slow-english-{ep_num}.json"
    dest_json_path = os.path.join(EPISODES_DIR, data_file_name)

    episode_data = {
        "episodeId": manifest_item.get("id", f"slow-english-ep-{ep_num:03d}"),
        "episodeNumber": ep_num,
        "title": f"Slow English Podcast #{ep_num}: {manifest_item.get('title')}",
        "seriesId": "slow-english",
        "audioUrl": manifest_item.get("audioFile"),
        "duration": manifest_item.get("duration", round(info.duration, 1)),
        "processedAt": "2026-10-14T03:30:00Z",
        "whisperModel": "base.en",
        "creator": {
            "name": "Slow English Podcast With Emilie",
            "supportUrl": "https://slow-english-podcast.myshopify.com",
            "avatarUrl": "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/37452627/37452627-1698246473489-f5979f187a5aa.jpg"
        },
        "sentences": clean_sentences
    }

    os.makedirs(EPISODES_DIR, exist_ok=True)
    with open(dest_json_path, "w", encoding="utf-8") as f:
        json.dump(episode_data, f, ensure_ascii=False, indent=2)

    print(f"   ✅ 完成转录与切片！生成 {len(clean_sentences)} 句精听教学内容 ➔ {data_file_name}")
    return episode_data

def main():
    parser = argparse.ArgumentParser(description="TypeCast 语料与时间戳切片批处理流水线")
    parser.add_argument("--start", type=int, default=1, help="起始期号")
    parser.add_argument("--end", type=int, default=10, help="结束期号")
    parser.add_argument("--model", type=str, default="base.en", help="Whisper 模型版本 (base.en, small.en)")
    parser.add_argument("--max-sentences", type=int, default=10, help="每期精选跟打句子数")
    parser.add_argument("--force", action="store_true", help="是否强制重新处理已有文件")
    args = parser.parse_args()

    print("==================================================")
    print(f"🚀 TypeCast 自动化音频切片对齐流水线启动")
    print(f"   处理范围: EP#{args.start} ~ EP#{args.end}")
    print(f"   Whisper 模型: {args.model}")
    print("==================================================")

    # 1. 读取 manifest
    if not os.path.exists(MANIFEST_PATH):
        print(f"❌ 错误: 找不到 {MANIFEST_PATH}")
        return

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    series = manifest["series"][0]
    ep_map = {ep["episodeNumber"]: ep for ep in series["episodes"]}

    # 2. 读取本地音频映射
    local_files = build_local_file_map(LOCAL_AUDIO_DIR)
    print(f"📁 本地音频库映射完成，共匹配到 {len(local_files)} 个音频文件")

    # 3. 初始化 Whisper 模型
    print(f"⚡ 正在加载 faster-whisper 模型 ({args.model})...")
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print("   模型加载就绪！")

    processed_count = 0
    skipped_count = 0

    for ep_num in range(args.start, args.end + 1):
        if ep_num not in ep_map:
            print(f"⚠️ 跳过 EP#{ep_num}: manifest 中未找到该期")
            continue

        item = ep_map[ep_num]
        data_file_name = f"slow-english-{ep_num:02d}.json" if ep_num < 100 else f"slow-english-{ep_num}.json"
        dest_json_path = os.path.join(EPISODES_DIR, data_file_name)

        # 检查是否已存在
        if os.path.exists(dest_json_path) and not args.force:
            print(f"⏩ EP#{ep_num} 已存在 ({data_file_name})，跳过")
            item["ready"] = True
            item["sentenceCount"] = 10
            skipped_count += 1
            continue

        audio_path = local_files.get(ep_num)
        if not audio_path or not os.path.exists(audio_path):
            # 若本地没有，则使用官方直链远程流
            audio_path = item.get("audioFile")
            print(f"🌐 本地未找到 EP#{ep_num}，使用远程官方流: {audio_path}")

        try:
            ep_data = process_episode(
                ep_num=ep_num,
                manifest_item=item,
                audio_path=audio_path,
                model=model,
                max_sentences=args.max_sentences
            )
            item["ready"] = True
            item["sentenceCount"] = len(ep_data["sentences"])
            processed_count += 1
        except Exception as e:
            print(f"❌ EP#{ep_num} 处理出错: {e}")

    # 4. 更新并写回 manifest.json
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("\n==================================================")
    print(f"🎉 批处理完成！新生成: {processed_count} 期，跳过已有: {skipped_count} 期")
    print(f"📄 manifest.json 已同步更新！")
    print("==================================================")

if __name__ == "__main__":
    main()
