import os
import sys
import glob
import json
import re
from faster_whisper import WhisperModel

AUDIO_DIR = '/Users/ac/Downloads/Slow_English_Podcast'
EPISODES_DIR = '/Users/ac/Development/typecast/apps/web/public/data/episodes'
MANIFEST_PATH = '/Users/ac/Development/typecast/apps/web/public/data/manifest.json'
TODO_PATH = '/Users/ac/Development/typecast/TODO_CORPUS_375.md'

def find_audio_path(ep_num: int):
    # 精准查找对应集数的 MP3 音频
    candidates = glob.glob(os.path.join(AUDIO_DIR, f'*#{ep_num} *'))
    if not candidates:
        candidates = glob.glob(os.path.join(AUDIO_DIR, f'*#{ep_num}-*'))
    if not candidates:
        candidates = glob.glob(os.path.join(AUDIO_DIR, f'*#{ep_num}*'))

    for c in candidates:
        base = os.path.basename(c)
        m = re.search(r'#(\d+)', base)
        if m and int(m.group(1)) == ep_num:
            return c
    return None

def is_pure_jingle_or_intro(text: str) -> bool:
    t = text.strip().lower()
    if re.search(r'\bpodcast episode\b', t) or re.search(r'^episode\s+(how to|how do|\d+|level|slow)', t):
        return True
    if re.search(r'^slow english(\s+podcast)?[\.\!]?$', t):
        return True
    if re.search(r'^(hi|hello|hey)\s*,?\s*(everyone|there|friends)[\.\!]?$', t):
        return True
    if re.search(r'^welcome (back )?(to )?(the |my |slow )?(english )?podcast[\.\!]?$', t):
        return True
    if re.search(r'^my name is (emily|emilie|amelia|amili)[\.\!]?$', t) or re.search(r'^i(\'m| am) (emily|emilie|amelia|amili)[\.\!]?$', t):
        return True
    if re.search(r'\bwith emil[iy]\b', t) and len(t.split()) <= 8:
        return True
    return False

def is_catalog_or_transition(text: str) -> bool:
    t = text.strip().lower()
    t_clean = re.sub(r'[^a-z0-9\s]', ' ', t)
    t_clean = ' '.join(t_clean.split())
    if re.search(r'^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(how to|what|when|why|extra)', t_clean):
        return True
    if re.search(r'\b(are you ready|let s (begin|start|get started))\b', t_clean):
        return True
    if re.search(r'\b(in this episode|by the end of this episode|in today s episode)\b.*(i will teach|you will|we will|help you)', t_clean):
        return True
    if re.search(r'\bi will also give you\b', t_clean):
        return True
    return False

def is_trailing_garbage(text: str) -> bool:
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

def build_raw_sentences_from_words(all_words):
    raw_sentences = []
    curr_words = []
    for i, w in enumerate(all_words):
        curr_words.append(w)
        txt = w['word']
        is_punct_end = bool(re.search(r'[\.\!\?]+[\"\']?$', txt))
        is_big_gap = False
        if i < len(all_words) - 1:
            next_w = all_words[i+1]
            gap = next_w['start'] - w['end']
            if gap >= 1.4 and next_w['word'] and next_w['word'][0].isupper():
                is_big_gap = True
                
        if is_punct_end or is_big_gap or i == len(all_words) - 1:
            s_text = ' '.join(x['word'] for x in curr_words)
            s_text = re.sub(r'\s+([,\.\!\?;:])', r'\1', s_text)
            raw_sentences.append({
                'start': curr_words[0]['start'],
                'end': curr_words[-1]['end'],
                'text': s_text,
                'words': list(curr_words)
            })
            curr_words = []
    return raw_sentences

def process_single_episode_sop(model: WhisperModel, ep_num: int):
    audio_path = find_audio_path(ep_num)
    if not audio_path:
        print(f"⚠️ EP #{ep_num}: 未找到音频文件，跳过")
        return False

    json_file = f'slow-english-{ep_num:02d}.json' if ep_num < 100 else f'slow-english-{ep_num}.json'
    json_path = os.path.join(EPISODES_DIR, json_file)
    if not os.path.exists(json_path):
        json_file = f'slow-english-{ep_num}.json'
        json_path = os.path.join(EPISODES_DIR, json_file)
    if not os.path.exists(json_path):
        print(f"⚠️ EP #{ep_num}: 未找到脚本文件，跳过")
        return False

    print(f"\n=======================================================")
    print(f"🎙️ [SOP 自动处理] EP #{ep_num}: {os.path.basename(audio_path)}")
    print(f"=======================================================")

    # 1. 完整提取音频声学词流 (Word-Level Timestamps)
    segments, info = model.transcribe(audio_path, language='en', word_timestamps=True)
    all_words = []
    for s in segments:
        if s.words:
            for w in s.words:
                all_words.append({
                    'word': w.word.strip(),
                    'start': round(w.start, 2),
                    'end': round(w.end, 2)
                })

    if not all_words:
        print(f"⚠️ EP #{ep_num}: 音频词流提取为空")
        return False

    # 2. 纯物理词流精准断句聚合 (Word-Level Sentence Aggregation)
    raw_sentences = build_raw_sentences_from_words(all_words)
    if not raw_sentences:
        print(f"⚠️ EP #{ep_num}: 断句聚合为空")
        return False

    # 3. 语义锚定核心起始句 (Start Anchor)
    # 查找前 20 句内的核心教学句
    start_idx = -1
    for idx, s in enumerate(raw_sentences[:20]):
        t = s['text'].strip().lower()
        if re.search(r'\b(today\b.*(we|i)\s+(will|are going to|learn)|in this episode\b.*(we|i)\s+(will|are going to|learn|talk)|today\'?s topic\b)', t):
            start_idx = idx
            break
        if re.search(r'^[a-z\s]+ is in (europe|africa|asia|south america|north america|central america|oceania)', t):
            start_idx = idx
            break

    if start_idx == -1:
        # 若未找到标准格式引入句，逐句剥离台标和姓名介绍
        start_idx = 0
        while start_idx < len(raw_sentences):
            if is_pure_jingle_or_intro(raw_sentences[start_idx]['text']):
                start_idx += 1
            else:
                break

    # 4. 逆向锚定结尾句 (End Anchor)
    end_idx = len(raw_sentences) - 1
    while end_idx >= start_idx:
        if is_trailing_garbage(raw_sentences[end_idx]['text']):
            end_idx -= 1
        else:
            break

    # 5. 提取主体切片，并剥离前导目录/过渡套话
    candidate_segs = raw_sentences[start_idx : end_idx + 1]
    filtered_segs = []

    for idx, s in enumerate(candidate_segs):
        t = s['text'].strip().lower()
        # 仅在前 15 句内严格审查并过滤目录套话
        if idx < 15 and is_catalog_or_transition(s['text']):
            continue
        filtered_segs.append(s)

    if not filtered_segs:
        filtered_segs = candidate_segs

    # 6. 注入自适应声学呼吸垫 (Acoustic Tail Cushion)，彻底杜绝断音卡音
    assembled_sentences = []
    for idx in range(len(filtered_segs)):
        s_obj = filtered_segs[idx]
        cur_words = [dict(w) for w in s_obj['words']]

        # 呼吸垫算法
        if idx < len(filtered_segs) - 1:
            next_start = filtered_segs[idx + 1]['start']
            gap = next_start - s_obj['end']
            if gap > 0.08:
                cushion = min(0.40, gap * 0.6)
                cur_end = round(s_obj['end'] + cushion, 2)
            else:
                cur_end = round(s_obj['end'], 2)
        else:
            cur_end = round(s_obj['end'] + 0.35, 2)

        if cur_words:
            cur_words[-1]['end'] = cur_end

        assembled_sentences.append({
            'id': idx + 1,
            'start': round(s_obj['start'], 2),
            'end': cur_end,
            'text': s_obj['text'],
            'words': cur_words
        })

    # 7. 本地原子落盘 (只写文件，严禁推送 Git)
    with open(json_path, 'r', encoding='utf-8') as fp:
        ep_data = json.load(fp)

    ep_data['sentences'] = assembled_sentences
    ep_data['sentenceCount'] = len(assembled_sentences)

    with open(json_path, 'w', encoding='utf-8') as fp:
        json.dump(ep_data, fp, ensure_ascii=False, indent=2)

    # 8. 同步 Manifest
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as fp:
            m = json.load(fp)
        for s in m.get('series', []):
            for ep in s.get('episodes', []):
                if ep.get('episodeNumber') == ep_num:
                    ep['sentenceCount'] = len(assembled_sentences)
        with open(MANIFEST_PATH, 'w', encoding='utf-8') as fp:
            json.dump(m, fp, ensure_ascii=False, indent=2)

    print(f"✅ EP #{ep_num} 落盘完毕！有效教学句: {len(assembled_sentences)} 句")
    print(f"   起始句: [{assembled_sentences[0]['start']}s - {assembled_sentences[0]['end']}s] {assembled_sentences[0]['text']}")
    print(f"   直连正文句[4]: [{assembled_sentences[4]['start']}s - {assembled_sentences[4]['end']}s] {assembled_sentences[4]['text']}")
    print(f"   结语句: [{assembled_sentences[-1]['start']}s - {assembled_sentences[-1]['end']}s] {assembled_sentences[-1]['text']}")
    return True

if __name__ == '__main__':
    start_ep = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    end_ep = int(sys.argv[2]) if len(sys.argv) > 2 else 375

    print(f"🚀 启动全自动单集顺序推进流水线: EP #{start_ep} ~ EP #{end_ep}")
    print(f"⚙️ 模式：词流断句聚合 ➔ 教学引入锚定 ➔ 目录套话剥离 ➔ 呼吸垫注入 ➔ 本地落盘 (绝不中途推送)")
    
    model = WhisperModel('small', device='cpu', compute_type='int8')

    success_count = 0
    for ep in range(start_ep, end_ep + 1):
        ok = process_single_episode_sop(model, ep)
        if ok:
            success_count += 1
            # 实时更新 TODO_CORPUS_375.md 记录
            try:
                with open(TODO_PATH, 'r') as fp:
                    todo_content = fp.read()
                todo_content = todo_content.replace(f"- [ ] **EP #{ep}:", f"- [x] **EP #{ep}:")
                with open(TODO_PATH, 'w') as fp:
                    fp.write(todo_content)
            except Exception as e:
                pass

    print(f"\n🎉 全线顺序处理完成！成功切片落盘 {success_count} 集！")
