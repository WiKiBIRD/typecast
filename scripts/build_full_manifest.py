import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import re
import json
import os

RSS_URL = 'https://anchor.fm/s/101e4fb7c/podcast/rss'
OUTPUT_PATH = '/Users/ac/Development/typecast/apps/web/public/data/manifest.json'

def parse_duration(d_str: str) -> float:
    if not d_str:
        return 0.0
    parts = d_str.strip().split(':')
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except Exception:
        return 0.0

def extract_cdn_url(raw_url: str) -> str:
    m = re.search(r'https%3A%2F%2F.*\.mp3', raw_url)
    if m:
        return urllib.parse.unquote(m.group(0))
    return raw_url

def main():
    print(f"正在从官方 RSS 获取节目流: {RSS_URL}")
    req = urllib.request.Request(RSS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    content = urllib.request.urlopen(req, timeout=30).read()
    root = ET.fromstring(content)
    channel = root.find('channel')
    items = channel.findall('item')
    print(f"解析到原始条目: {len(items)} 条")

    episodes_by_num = {}

    for item in items:
        raw_title = item.find('title').text or ''
        m = re.search(r'#\s*(\d+)', raw_title)
        if not m:
            continue
        ep_num = int(m.group(1))

        # 提取清晰标题
        clean_title = re.sub(r'^Slow English Podcast\s*(With Video)?\s*[-–—]?\s*#\s*\d+\s*[-–—:]?\s*', '', raw_title, flags=re.I).strip()
        if not clean_title:
            clean_title = f"Episode {ep_num}"

        enc = item.find('enclosure')
        raw_audio = enc.attrib.get('url') if enc is not None else ''
        cdn_audio = extract_cdn_url(raw_audio)

        dur_elem = item.find('{http://www.itunes.com/dtds/podcast-1.0.dtd}duration')
        dur_str = dur_elem.text if dur_elem is not None else ''
        duration_sec = parse_duration(dur_str)

        # 优先保留更规范/带 Video 标记的条目
        is_video = 'with video' in raw_title.lower()
        if ep_num not in episodes_by_num or is_video:
            episodes_by_num[ep_num] = {
                'epNumber': ep_num,
                'title': clean_title,
                'duration': round(duration_sec, 1),
                'audioUrl': cdn_audio,
            }

    sorted_nums = sorted(episodes_by_num.keys())
    print(f"去重整合后唯一剧集数: {len(sorted_nums)} 期 (范围: #{sorted_nums[0]} ~ #{sorted_nums[-1]})")

    episodes_list = []
    for num in sorted_nums:
        ep = episodes_by_num[num]
        ep_id = f"slow-english-ep-{num:03d}"
        
        # 检查本地是否已有转录数据文件
        data_file_name = f"slow-english-{num:02d}.json" if num < 100 else f"slow-english-{num}.json"
        has_local_data = os.path.exists(f"/Users/ac/Development/typecast/apps/web/public/data/episodes/{data_file_name}")
        
        episodes_list.append({
            "id": ep_id,
            "episodeNumber": num,
            "title": ep["title"],
            "duration": ep["duration"],
            "dataFile": f"/data/episodes/{data_file_name}",
            "audioFile": ep["audioUrl"],
            "sentenceCount": 10 if has_local_data else 0,
            "ready": has_local_data
        })

    manifest = {
        "series": [
            {
                "id": "slow-english",
                "title": "Slow English Podcast With Emilie",
                "author": "Emilie",
                "description": "慢速英语日常精听口语 · 词汇与句型沉浸训练 (全 375 期官方正版索引)",
                "avatarUrl": "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/37452627/37452627-1698246473489-f5979f187a5aa.jpg",
                "episodes": episodes_list
            }
        ]
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"成功写入完整选集索引: {OUTPUT_PATH} (共包含 {len(episodes_list)} 集官方直链)")

if __name__ == '__main__':
    main()
