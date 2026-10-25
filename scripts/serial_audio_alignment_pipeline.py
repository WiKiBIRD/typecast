import os
import sys
import glob
import json
import re
from faster_whisper import WhisperModel

AUDIO_DIR = '/Users/ac/Downloads/Slow_English_Podcast'
EPISODES_DIR = '/Users/ac/Development/typecast/apps/web/public/data/episodes'
MANIFEST_PATH = '/Users/ac/Development/typecast/apps/web/public/data/manifest.json'

def find_audio_for_episode(ep_num: int):
    """精准查找某集对应的本地 MP3 音频"""
    pattern = os.path.join(AUDIO_DIR, f'*#{ep_num} *')
    matches = glob.glob(pattern)
    if not matches:
        # 兼容带横杠的命名 如 #375-
        matches = glob.glob(os.path.join(AUDIO_DIR, f'*#{ep_num}-*'))
    if not matches:
        # 兼容无空格的命名 如 #12_
        matches = glob.glob(os.path.join(AUDIO_DIR, f'*#{ep_num}*'))
    
    # 严格校验数字匹配，避免 #1 匹配到 #10
    valid_matches = []
    for m in matches:
        base = os.path.basename(m)
        num_m = re.search(r'#(\d+)', base)
        if num_m and int(num_m.group(1)) == ep_num:
            valid_matches.append(m)
            
    return valid_matches[0] if valid_matches else None

def is_head_junk(text: str, start: float) -> bool:
    t = text.strip().lower()
    if re.search(r'\bpodcast episode\b', t) or re.search(r'^episode\s+(how to|how do|\d+|level|slow)', t):
        return True
    if re.search(r'^slow english(\s+podcast)?[\.\!]?$', t):
        return True
    if re.search(r'^(hi|hello|hey)\s*,?\s*(everyone|there|friends)[\.\!]?$', t):
        return True
    if re.search(r'^welcome (back )?(to )?(the |my |slow )?(english )?podcast[\.\!]?$', t):
        return True
    if re.search(r'^my name is emil[iy][\.\!]?$', t) or re.search(r'^i(\'m| am) emil[iy][\.\!]?$', t):
        return True
    if re.search(r'\bwith emil[iy]\b', t) and len(t.split()) <= 8:
        return True
    return False

def is_tail_junk(text: str) -> bool:
    t = text.strip().lower()
    if re.search(r'^(goodbye|bye\s*bye|bye|bye\s*now|see you( next time| soon)?|farewell)[\.\!]?$', t):
        return True
    if re.search(r'^thank you for listening[\.\!]?$', t):
        return True
    if re.search(r'if you (liked|enjoyed|like|enjoy) this episode\b', t):
        return True
    if re.search(r'subscribe to (my|the) podcast\b', t) or re.search(r'see you next time\b', t):
        return True
    if re.search(r'\bor (as )?(they|people) say in\b', t):
        return True
    return False

def align_single_episode(model: WhisperModel, ep_num: int):
    """严格按照 SOP 对单集进行音频与文本声学对齐"""
    audio_path = find_audio_for_episode(ep_num)
    if not audio_path:
        print(f"❌ EP #{ep_num}: 未找到匹配音频，跳过！")
        return False

    json_file = f'slow-english-{ep_num:02d}.json' if ep_num < 100 else f'slow-english-{ep_num}.json'
    json_path = os.path.join(EPISODES_DIR, json_file)
    if not os.path.exists(json_path):
        json_file = f'slow-english-{ep_num}.json'
        json_path = os.path.join(EPISODES_DIR, json_file)
    if not os.path.exists(json_path):
        print(f"❌ EP #{ep_num}: 未找到脚本文件 {json_path}，跳过！")
        return False

    print(f"\n=======================================================")
    print(f"🎧 正在严格执行 SOP 阶段 1 & 2: EP #{ep_num}")
    print(f"   音频: {os.path.basename(audio_path)}")
    print(f"=======================================================")

    # 1. 声音声学转录 (Word-level)
    segments, info = model.transcribe(audio_path, language='en', word_timestamps=True)
    all_segs = list(segments)
    if not all_segs:
        print(f"❌ EP #{ep_num}: 音频转录为空！")
        return False

    # 2. 寻找教学起始锚点（以核心主题引入句为铁律基准）
    start_idx = -1
    for idx, seg in enumerate(all_segs[:15]):  # 通常发生在前15段内
        t = seg.text.strip().lower()
        if re.search(r'\b(today\b.*(we|i)\s+(will|are going to|learn)|in this episode\b.*(we|i)\s+(will|are going to|learn|talk))', t):
            start_idx = idx
            break

    # 若未找到标准 Today 句，则退化为按废话逐句向后剔除
    if start_idx == -1:
        start_idx = 0
        while start_idx < len(all_segs):
            if is_head_junk(all_segs[start_idx].text, all_segs[start_idx].start):
                start_idx += 1
            else:
                break

    # 3. 寻找教学结束锚点
    end_idx = len(all_segs) - 1
    while end_idx >= start_idx:
        seg = all_segs[end_idx]
        if is_tail_junk(seg.text):
            end_idx -= 1
        else:
            break

    valid_segs = all_segs[start_idx : end_idx + 1]
    if not valid_segs:
        print(f"❌ EP #{ep_num}: 锚定后有效句子为空！")
        return False

    # 4. 封装高精度 JSON 句子结构
    with open(json_path, 'r', encoding='utf-8') as fp:
        ep_data = json.load(fp)

    new_sentences = []
    for idx, seg in enumerate(valid_segs, start=1):
        words_data = []
        if seg.words:
            for w in seg.words:
                cw = w.word.strip()
                if cw:
                    words_data.append({
                        'word': cw,
                        'start': round(w.start, 2),
                        'end': round(w.end, 2)
                    })
        new_sentences.append({
            'id': idx,
            'start': round(seg.start, 2),
            'end': round(seg.end, 2),
            'text': seg.text.strip(),
            'words': words_data
        })

    ep_data['sentences'] = new_sentences
    ep_data['sentenceCount'] = len(new_sentences)

    # 落盘
    with open(json_path, 'w', encoding='utf-8') as fp:
        json.dump(ep_data, fp, ensure_ascii=False, indent=2)

    # 同步 Manifest
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as fp:
            m = json.load(fp)
        for s in m.get('series', []):
            for ep in s.get('episodes', []):
                if ep.get('episodeNumber') == ep_num:
                    ep['sentenceCount'] = len(new_sentences)
        with open(MANIFEST_PATH, 'w', encoding='utf-8') as fp:
            json.dump(m, fp, ensure_ascii=False, indent=2)

    print(f"✅ EP #{ep_num} 对齐完成并已物理落盘！")
    print(f"   • 有效教学句数: {len(new_sentences)} 句")
    print(f"   • 第 1 句 [{new_sentences[0]['start']}s]: {new_sentences[0]['text']}")
    print(f"   • 最后句 [{new_sentences[-1]['end']}s]: {new_sentences[-1]['text']}")
    return True

if __name__ == '__main__':
    # 接收命令行参数指定起止集数，支持单步串行推进
    start_ep = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    end_ep = int(sys.argv[2]) if len(sys.argv) > 2 else start_ep

    print(f"🚀 启动 TypeCast 串行对齐引擎: EP #{start_ep} 至 EP #{end_ep}")
    model = WhisperModel('small', device='cpu', compute_type='int8')

    for ep in range(start_ep, end_ep + 1):
        success = align_single_episode(model, ep)
        if not success:
            print(f"⚠️ EP #{ep} 处理异常，暂停推进！")
            break
