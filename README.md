<div align="center">

# TypeCast — 听写铸键 🎧⌨️
### Psychoacoustic Deliberate Practice & Real-world Scene Typing Trainer
**基于心理声学微透镜与 FSRS 记忆调度的硬核英语跟打特训营 · 磨耳朵 · 破音变 · 练拼写 · 记单词**

<p align="center">
  <a href="https://typecast.51.edu.kg">
    <img src="https://img.shields.io/badge/🚀_Live_Demo-typecast.51.edu.kg-22c55e?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo" />
  </a>
  <a href="https://github.com/WiKiBIRD/typecast/actions">
    <img src="https://img.shields.io/badge/CI%2FCD-Passing-22c55e?style=for-the-badge&logo=githubactions&logoColor=white" alt="Deploy" />
  </a>
  <img src="https://img.shields.io/badge/Episodes-375_Full_Scenes-3b82f6?style=for-the-badge" alt="Episodes" />
  <img src="https://img.shields.io/badge/Acoustic_Phenomena-224%2C648_Annotated-f59e0b?style=for-the-badge" alt="Acoustics" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" />
</p>

### 🌐 [https://typecast.51.edu.kg](https://typecast.51.edu.kg)
*Instant access in modern browsers. Zero setup, zero login, local privacy-first storage.*

**[English Documentation](#-english-documentation)** | **[简体中文说明](#-简体中文说明)**

</div>

---

## 🌐 English Documentation

### 🔗 Live Experience
👉 **Website**: **[https://typecast.51.edu.kg](https://typecast.51.edu.kg)**  
No installation or registration needed. Level progress, FSRS memory states, and keystroke dynamics are securely saved in your browser's local IndexedDB.

---

### 🎯 What is TypeCast?
Language learners often struggle with disconnected learning: memorizing word lists in isolation, listening to podcasts passively without catching details, and stumbling when trying to speak.

**TypeCast** combines speech acoustics, keystroke dynamics, and cognitive psychology into an **auditory deliberate practice** feedback loop:

1. 👂 **Acoustic Ear Training (Connected Speech Mastery)**  
   Break free from subtitles. Train your auditory reflexes on the 5 major connected speech phenomena: **Reduction (弱读)**, **Linking (连读)**, **Elision (失爆)**, **Glottal Stops (喉塞音)**, and **Assimilation (同化)**.
2. 🔍 **Web Audio Acoustic Micro-Lens (0.7x Pitch-Invariant Stretch)**  
   When your keystroke latency detects a perceptual blindspot, TypeCast doesn't just show answers—it triggers a localized 0.7x lossless time-stretch on the target phonemes (with 15ms anti-click crossfade) to sharpen auditory resolution.
3. 🧠 **FSRS-DSR Cognitive Memory Scheduling**  
   Tracks memory stability ($S$), difficulty ($D$), and retrievability ($R$) per acoustic phenomenon. Measures your reaction time reduction adhering to the *Power Law of Practice*.
4. 🗣️ **375 Authentic Real-world Episodes (33,916 Sentences)**  
   Over 375 real-world situational episodes from daily life. Typing each sentence builds muscle memory before you actually need to speak in real life.

---

### ⚔️ The 4-Stage Auditory Deliberate Practice System
TypeCast replaces passive browsing with a **gamified pass-to-unlock mechanism**:

```
Stage 1: [Round 1: 明文识音]  Phonetic Translucency · Master rhythm, spelling, and phonetic boundaries
Stage 2: [Round 2: 模糊抓词]  Targeted Acoustic Masking · Masks words carrying connected speech phenomena
Stage 3: [Round 3: 单句盲听]  Adaptive Scaffolding · Keystroke dynamics probe + 0.7x Acoustic Micro-Lens
Stage 4: [Round 4: 全文大考]  The Grand Challenge · Timed test evaluating WPM, accuracy & FSRS 5D Radar
```

> 🔒 **Passing Criteria**:  
> You must score **≥ 80 points** in Round 4 (The Grand Challenge) to unlock the next real-world episode.

- **⏸️ Play/Pause Audio**: Step away anytime without auditory clutter or timer penalty.
- **🔁 Instant Tab Replay**: Press `Tab` to loop the current sentence seamlessly until fully grasped.
- **💾 IndexedDB Cognitive Persistence**: All FSRS memory parameters, keystroke latency history, and level progress persist across browser sessions with atomic breakpoint sync.

---

### 📻 Production Acoustic Assets & Precision
- **375 Full Episodes**: 33,916 sentences with 224,648 physical acoustic phenomena annotated via Praat Parselmouth.
- **Acoustic Padding**: Each sentence features `-200ms` head padding and `+180ms` tail padding to eliminate word clipping.
- **Pure Learning Content**: Intros, outros, Patreon plugs, and promotional links are filtered out.

---

### 💻 Quick Start & Deployment
```bash
# Clone and install dependencies
git clone https://github.com/WiKiBIRD/typecast.git
cd typecast
pnpm install

# Start local dev server
pnpm dev

# Run unit tests (Vitest 45 tests + Pytest 9 tests)
pnpm test
pytest tests/

# Production build
pnpm build
```

---

<br />

## 🇨🇳 简体中文说明

### 🌐 在线体验入口
👉 **官方直达网址**：**[https://typecast.51.edu.kg](https://typecast.51.edu.kg)**  
无需安装任何软件或配置环境，使用任何现代浏览器打开即可开始沉浸式听写，关卡进度与认知数据自动保存在本地。

---

### 🎯 为什么叫「一举多得」？
很多英语学习者面临脱节困境：抱着单词书死记硬背、刷播客模模糊糊不知所云、开口说话吞吞吐吐。

**TypeCast 将语音声学、击键动力学与认知心理学深度融合，打造「听觉刻意练习」闭环：**

1. 👂 **真·磨耳朵（攻破五大连读音变）**：摆脱字幕依赖，在敲击中精准捕捉 **弱读 (Reduction)**、**辅音连读 (Linking)**、**失爆 (Elision)**、**喉塞音 (Glottal Stop)** 与 **同化 (Assimilation)**。
2. 🔍 **局部声学显微透镜（0.7x 保调无损慢放）**：打字停滞暴露知觉盲区时，系统在毫秒级时间窗内启动局部 0.7x 保调慢放重听（带 15ms 抗爆音淡入淡出），迫使耳朵重新聚焦微弱辅音与气流摩擦。
3. 🧠 **FSRS 认知记忆衰减调度与五维雷达**：基于 FSRS-DSR 模型实时计算各项音变难点记忆稳定性，量化击键反应潜伏期的收敛率（练习幂定律），生成专属知觉雷达图。
4. 🗣️ **全量 375 期真实生活语境（33,916 句）**：涵盖点餐、机场、就医、面试等 375 个纯正生活场景，逐句敲击预演，日常交流脱口而出。

---

### ⚔️ 四阶梯硬核闯关机制（通关解锁制）
TypeCast 引入了**严格的关卡考核机制**，必须考核合格才能解锁下一个生活场景：

```
第一阶梯：【Round 1: 明文识音】  纯净看打 · 熟悉整句音律节奏与正字法拼写框架
第二阶梯：【Round 2: 模糊抓词】  定向挖空 · 优先针对携带五大物理音变的难点单词隐式遮罩
第三阶梯：【Round 3: 单句盲听】  动态脚手架 · 击键动力学探针 + 0.7x 局部声学显微透镜慢放
第四阶梯：【Round 4: 全文大考】  硬核大考 · 综合考核打字时速 WPM 与正确率，输出五维声学雷达图
```

> 🔒 **硬核考核规则**：  
> 第四轮大挑战成绩必须达到 **≥ 80 分（合格）** 才能达成通关解锁下一集！

- **⏸️ 随心暂停**：临时离席一键暂停音频与计时，杜绝听觉污染与计时失真。
- **🔁 Tab 键快速重听**：生难句单键无限回听，音频播放守卫保证重听与当前句 100% 吻合。
- **💾 认知数据本地持久化**：采用原生 IndexedDB（`AcousticStorage`），五维知觉雷达图、各项音变掌握度与中断断点永久保存，刷新重连严丝合缝。

---

### 📊 生产级语料与声学数据大盘
- **全量 375 期场景**：33,916 个教学句，全部由 Praat Parselmouth 物理声学特征（F0 基频、强度、Burg 共振峰）完成细粒度扫描。
- **224,648 处物理音变标注**：涵盖弱读 38,200+ 处、连读 41,500+ 处、失爆 58,100+ 处、喉塞音 72,000+ 处等，支持前端异步毫秒级拉取。
- **首尾声学缓冲保护**：每句配置 `-200ms` 前置缓冲与 `+180ms` 后置余量，杜绝单词被吃音截断。

---

### ☕ 支持与赞助 (Sponsor)
如果 TypeCast 帮助到了你的英语听写与口语训练，欢迎请作者喝一杯咖啡，支持项目的持续维护与功能迭代！

<p align="left">
  <a href="https://afdian.com">
    <img src="https://img.shields.io/badge/爱发电-微信与支付宝赞助-946ce6?style=for-the-badge&logo=kofi&logoColor=white" alt="爱发电" />
  </a>
  &nbsp;&nbsp;
  <a href="https://www.buymeacoffee.com">
    <img src="https://img.shields.io/badge/Buy_Me_A_Coffee-支持作者-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
  </a>
</p>

> 🛠️ **开发者完整指南**：  
> 了解 Turborepo Monorepo 架构、MFA 强对齐流水线、Parselmouth 批处理 Worker 与单测规范？  
> 请参阅专用的 [开发者完整技术指南 (README_DEV.md)](README_DEV.md)。

---

## 📜 License & Disclaimer (开源许可与免责声明)

- **Software License**: [MIT License](LICENSE) © 2026 WiKiBIRD
- **Audio Disclaimer**: Audio content © *Slow English Podcast with Emilie*. All audio streams are referenced directly from public open RSS feeds under Fair Use principles for non-commercial educational listening practice.
