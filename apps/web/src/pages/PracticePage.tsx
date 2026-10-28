import { useState, useEffect } from 'react';
import { usePracticeSession, type TrainingRound } from '../hooks/usePracticeSession';
import { SentenceDisplay } from '../components/SentenceDisplay';
import { ChallengeResultModal } from '../components/ChallengeResultModal';
import { PhoneticRealityCard } from '../components/acoustic/PhoneticRealityCard';
import { db, type EpisodeProgressRecord } from '@typecast/core';
import type { Episode } from '@typecast/shared-types';

interface ManifestEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  duration: number;
  dataFile: string;
  audioFile: string;
  sentenceCount: number;
  ready?: boolean;
}

interface ManifestSeries {
  id: string;
  title: string;
  author: string;
  description: string;
  avatarUrl: string;
  episodes: ManifestEpisode[];
}

interface ManifestData {
  series: ManifestSeries[];
}

export function PracticePage() {
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, EpisodeProgressRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const PAGE_SIZE = 12;

  const {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    restartFromBeginning,
    selectRound,
    jumpToSentence,
    togglePlayPause,
    isAudioPaused,
    dismissChallengeModal,
    resumePrompt,
    currentSentence,
    triggerLensReplay,
  } = usePracticeSession(80, 'native');

  // 载入 manifest 与数据库中的历史进度
  const refreshProgress = async () => {
    try {
      const allProgress = await db.progress.toArray();
      const pMap: Record<string, EpisodeProgressRecord> = {};
      allProgress.forEach((p: EpisodeProgressRecord) => {
        pMap[p.episodeId] = p;
      });
      setProgressMap(pMap);
    } catch (err) {
      console.warn('刷新进度映射失败:', err);
    }
  };

  useEffect(() => {
    async function initCatalog() {
      try {
        const res = await fetch(`/data/manifest.json?t=${Date.now()}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error('无法拉取集数清单文件');
        const data: ManifestData = await res.json();
        setManifest(data);

        await refreshProgress();
      } catch (err) {
        console.error('初始化失败:', err);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    }
    initCatalog();
  }, []);

  // 点击单集进行加载并直接开始练习
  const onSelectEpisode = async (dataFile: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(dataFile);
      if (!res.ok) throw new Error(`加载单集数据失败 (${res.status})`);
      const episode: Episode = await res.json();
      sessionStorage.setItem('typecast_active_episode', dataFile);
      setSelectedEpisode(episode);
      await handleEpisodeLoad(episode);
    } catch (err) {
      console.error('加载集数失败:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 页面刷新或重新进入时若存在上次活跃集数则自动恢复
  useEffect(() => {
    const lastDataFile = sessionStorage.getItem('typecast_active_episode');
    if (lastDataFile && !selectedEpisode && !isLoading) {
      onSelectEpisode(lastDataFile);
    }
  }, []);

  // 检查某集是否解锁（上一集 Round 4 必须 >= 80 分）
  const isEpisodeUnlocked = (epNumber: number): boolean => {
    if (epNumber === 1) return true; // 第 1 集天然解锁
    const prevEpIdFormatted = `slow-english-ep-${String(epNumber - 1).padStart(3, '0')}`;
    const prevEpIdLegacy = `slow-english-ep-0${epNumber - 1}`;
    const prevRecord = progressMap[prevEpIdFormatted] || progressMap[prevEpIdLegacy];
    return !!(prevRecord?.bestScore && prevRecord.bestScore.score >= 80);
  };

  // 选集列表首页
  if (!viewState.isReady || !currentSentence || !selectedEpisode) {
    const series = manifest?.series[0];

    const filteredEpisodes = (series?.episodes || []).filter((ep) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        ep.title.toLowerCase().includes(term) ||
        String(ep.episodeNumber).includes(term)
      );
    });

    const totalPages = Math.ceil(filteredEpisodes.length / PAGE_SIZE) || 1;
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paginatedEpisodes = filteredEpisodes.slice(startIndex, startIndex + PAGE_SIZE);

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-6 md:p-12 font-sans">
        <div className="max-w-4xl w-full">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-xs font-semibold mb-4">
              <span>🎙️ 4 阶梯硬核听写特训营</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">TypeCast (听写铸键)</h1>
            <p className="text-gray-400 text-sm max-w-xl mx-auto leading-relaxed">
              明文识音 → 模糊抓词 → 单句盲听 → <span className="text-amber-400 font-semibold">全文大挑战 (≥80分晋级)</span>
            </p>
          </div>

          {loadError && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-sm">
              <strong>加载出错：</strong> {loadError}
            </div>
          )}

          {/* 专辑展示 */}
          {series && (
            <div className="bg-gray-900/60 border border-gray-800/80 rounded-3xl p-6 md:p-8 backdrop-blur mb-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-800">
                <div className="flex items-center gap-4">
                  <img
                    src={series.avatarUrl || '/avatar.jpg'}
                    alt={series.author}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/avatar.jpg';
                    }}
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-700 shadow-md"
                  />
                  <div>
                    <h2 className="text-xl font-bold text-gray-100">{series.title}</h2>
                    <p className="text-xs text-gray-400 mt-1">主讲人：{series.author}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">总集数</div>
                    <div className="text-2xl font-black text-gray-200 font-mono">{series.episodes.length} 集</div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed mb-6">{series.description}</p>

              {/* 搜索与筛选 */}
              <div className="relative mb-6">
                <input
                  type="text"
                  placeholder="搜索集数标题、序号 (如: Restaurant, 1, 01)..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* 集数网格卡片 */}
              {isLoading ? (
                <div className="py-20 text-center text-gray-500 font-medium animate-pulse text-sm">
                  正在初始化听写语料库与音频流...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {paginatedEpisodes.map((ep) => {
                    const epKeyFormatted = `slow-english-ep-${String(ep.episodeNumber).padStart(3, '0')}`;
                    const epKeyLegacy = `slow-english-ep-0${ep.episodeNumber}`;
                    const progress = progressMap[epKeyFormatted] || progressMap[epKeyLegacy];
                    const unlocked = isEpisodeUnlocked(ep.episodeNumber);
                    const best = progress?.bestScore;

                    return (
                      <button
                        key={ep.id}
                        disabled={!unlocked}
                        onClick={() => onSelectEpisode(ep.dataFile)}
                        className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative group flex flex-col justify-between min-h-[96px] ${
                          unlocked
                            ? 'bg-gray-950/60 hover:bg-blue-600/10 border-gray-800 hover:border-blue-500/40 hover:scale-[1.01]'
                            : 'bg-gray-950/20 border-gray-900 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-gray-400 group-hover:text-blue-400">
                            EP{String(ep.episodeNumber).padStart(2, '0')}
                          </span>
                          {!unlocked ? (
                            <span className="text-xs text-gray-600">🔒 锁定</span>
                          ) : best ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                              ★ {best.score}分
                            </span>
                          ) : null}
                        </div>

                        <div className="text-xs font-medium text-gray-200 line-clamp-1 group-hover:text-white transition-colors">
                          {ep.title.replace(/^Slow English Podcast #\d+:\s*/, '')}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-gray-600 font-mono pt-1 border-t border-gray-900">
                          <span>{ep.sentenceCount} 句</span>
                          <span>{Math.round(ep.duration / 60)} 分钟</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 分页控制器 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800/80 text-xs text-gray-400 font-mono">
                  <span>
                    第 {startIndex + 1} - {Math.min(startIndex + PAGE_SIZE, filteredEpisodes.length)} 条 (共 {filteredEpisodes.length} 条)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <span className="px-3 py-1 bg-gray-900 border border-gray-800 rounded-lg text-gray-200 font-bold">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 主打字练习模式界面
  // ---------------------------------------------------------------------------
  const currentRound = viewState.currentRound;
  const hintMode = currentRound === 1 ? 'SHOW' : currentRound === 2 ? 'BLUR' : 'HIDDEN';

  const total = selectedEpisode.sentences.length;
  const current = viewState.currentSentenceIndex + 1;
  const completionPct = Math.round((viewState.currentSentenceIndex / total) * 100);

  const avgWpm = viewState.completedSentences.length > 0
    ? Math.round(
        viewState.completedSentences.reduce((a, s) => a + s.wpm, 0) /
          viewState.completedSentences.length
      )
    : '—';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* 断点恢复气泡 */}
      {resumePrompt && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-blue-600/90 text-white text-xs font-semibold rounded-full shadow-xl backdrop-blur animate-in fade-in slide-in-from-top-4">
          ✨ {resumePrompt}
        </div>
      )}

      {/* 结算结果弹窗 (注入五维声学雷达图) */}
      {viewState.challengeResult && (
        <ChallengeResultModal
          currentResult={viewState.challengeResult}
          bestScore={viewState.bestScore?.score}
          radarProfile={viewState.radarProfile}
          onRetry={() => {
            dismissChallengeModal();
            selectRound(4);
          }}
          onNextEpisode={async () => {
            dismissChallengeModal();
            await handleReset();
            await refreshProgress();
            setSelectedEpisode(null);
          }}
          onBackToList={async () => {
            dismissChallengeModal();
            await handleReset();
            await refreshProgress();
            setSelectedEpisode(null);
          }}
        />
      )}

      {/* 顶部进度条 */}
      <div className="w-full h-1 bg-gray-900">
        <div
          className={`h-full transition-all duration-300 ${
            currentRound === 4 ? 'bg-amber-400' : 'bg-blue-500'
          }`}
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* 头部导航 */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gray-800/80 bg-gray-950/50 backdrop-blur">
        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              sessionStorage.removeItem('typecast_active_episode');
              await handleReset();
              await refreshProgress();
              setSelectedEpisode(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 active:scale-95 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-all cursor-pointer"
          >
            <span>←</span>
            <span>返回列表</span>
          </button>
          <button
            onClick={() => restartFromBeginning()}
            title="清空当前集进度缓存，从第 1 句重新开始打字练习"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-blue-600/20 active:scale-95 border border-gray-800 hover:border-blue-500/50 text-gray-300 hover:text-blue-300 rounded-lg text-xs font-medium transition-all cursor-pointer"
          >
            <span>↺</span>
            <span>从头开始</span>
          </button>
          <div className="h-4 w-[1px] bg-gray-800" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center border border-blue-500/30 text-xs">
              EP{selectedEpisode.episodeNumber}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-200">{selectedEpisode.title}</div>
              <div className="text-xs text-gray-500">{selectedEpisode.creator.name}</div>
            </div>
          </div>
        </div>

        {/* 历史最高分展示 */}
        <div className="flex items-center gap-3">
          {viewState.bestScore ? (
            <div className="text-xs text-gray-400 border border-amber-500/30 bg-amber-500/10 px-3 py-1 rounded-lg">
              👑 大考最高分: <span className="font-bold text-amber-400 font-mono">{viewState.bestScore.score} 分</span>
            </div>
          ) : null}

          <a
            href={selectedEpisode.creator.supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-blue-400 border border-gray-800 hover:border-blue-500/40 px-3 py-1.5 rounded-lg transition-colors"
          >
            Support Creator ↗
          </a>
        </div>
      </header>

      {/* 主练习内容区 */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 max-w-4xl mx-auto w-full">
        {/* 4 阶梯关卡控制器 (保留现有布局体系) */}
        <div className="flex flex-wrap justify-center bg-gray-900/80 border border-gray-800 p-1.5 rounded-2xl mb-12 gap-1.5">
          {[
            { round: 1, name: 'Round 1: 明文识音', locked: false },
            { round: 2, name: 'Round 2: 模糊抓词', locked: false },
            { round: 3, name: 'Round 3: 单句盲听', locked: false },
            {
              round: 4,
              name: '🏆 Round 4: 全文大考 (≥80分及格)',
              locked: !viewState.roundCompleted.round1 || !viewState.roundCompleted.round2 || !viewState.roundCompleted.round3,
            },
          ].map((item) => {
            const isCurrent = currentRound === item.round;
            const roundKey = `round${item.round}` as keyof typeof viewState.roundCompleted;
            const isCompleted = viewState.roundCompleted[roundKey];
            const savedRoundIdx = isCurrent
              ? viewState.currentSentenceIndex
              : viewState.roundSentenceIdx[roundKey];

            return (
              <button
                key={item.round}
                onClick={(e) => {
                  setIsNavigatorOpen(false);
                  selectRound(item.round as TrainingRound);
                  e.currentTarget.blur();
                  document.getElementById('typecast-hidden-input')?.focus();
                }}
                disabled={item.locked}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  isCurrent
                    ? item.round === 4
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-900/40 font-bold'
                      : 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {item.locked && <span>🔒</span>}
                {!item.locked && isCompleted && <span>✅</span>}
                {!item.locked && !isCompleted && item.round !== 4 && savedRoundIdx > 0 && (
                  <span>⏳</span>
                )}
                <span>{item.name}</span>
                {!item.locked && isCompleted && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                      isCurrent
                        ? 'bg-emerald-400/25 text-emerald-200 border border-emerald-300/40'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    已完成
                  </span>
                )}
                {!item.locked && !isCompleted && item.round !== 4 && savedRoundIdx > 0 && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full font-mono ${
                      isCurrent
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    ({savedRoundIdx + 1}/{total})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 核心句子展示卡片 (注入四大 Round 声学刻意练习能力) */}
        <div
          onClick={() => {
            const el = document.getElementById('typecast-hidden-input');
            if (el) el.focus();
          }}
          className={`w-full max-w-4xl overflow-hidden border rounded-3xl p-6 sm:p-10 md:p-12 shadow-2xl flex flex-col items-center justify-center min-h-[260px] cursor-text relative transition-all ${
            currentRound === 4
              ? 'bg-amber-950/10 border-amber-500/30'
              : 'bg-gray-900/40 border-gray-800/80'
          }`}
        >
          {isAudioPaused && (
            <div className="absolute top-4 right-4 px-3 py-1 bg-amber-500/15 border border-amber-500/30 rounded-full text-amber-300 text-xs font-semibold flex items-center gap-1.5 backdrop-blur animate-pulse">
              <span>⏸️ 音频已暂停 (点击下方按钮继续)</span>
            </div>
          )}

          <input
            id="typecast-hidden-input"
            type="text"
            className="absolute opacity-0 pointer-events-none w-0 h-0"
            autoFocus
          />
          <SentenceDisplay
            sentence={currentSentence}
            acousticChunk={viewState.currentAcousticChunk}
            cursorIndex={viewState.cursorIndex}
            errorCount={viewState.errorCount}
            consecutiveErrors={viewState.consecutiveErrors}
            hintMode={hintMode}
            round={currentRound}
            activeScaffoldState={viewState.activeScaffoldState}
            isLensActive={viewState.isLensActive}
          />
        </div>

        {/* Round 3: 盲区二次受阻时优雅滑入声学物理现实揭示对比卡片 */}
        {currentRound === 3 && viewState.activeScaffoldState && viewState.activeScaffoldState.currentLevel >= 2 && (
          <div className="w-full max-w-4xl mt-6">
            <PhoneticRealityCard scaffoldState={viewState.activeScaffoldState} />
          </div>
        )}

        {/* 底部指标指示与控制 */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-sm text-gray-400">
          {currentRound !== 4 &&
          viewState.roundCompleted[`round${currentRound}` as 'round1' | 'round2' | 'round3'] ? (
            <button
              onClick={(e) => {
                setIsNavigatorOpen(true);
                e.currentTarget.blur();
              }}
              className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-medium text-emerald-300 transition-all cursor-pointer"
              title="本轮已通关，点击自由选择任意句子进行复习"
            >
              <span>📜 进度:</span>
              <span className="font-mono text-white font-bold">
                {current} / {total} 句
              </span>
              <span className="text-[11px] text-emerald-400">(点击选句 ▾)</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">进度:</span>
              <span className="font-mono text-gray-200">{current} / {total} 句</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-gray-600">错误:</span>
            <span className="font-mono text-rose-400">{viewState.errorCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">时速:</span>
            <span className="font-mono text-blue-400 font-medium">{avgWpm} WPM</span>
          </div>
          
          <button
            onClick={(e) => {
              togglePlayPause();
              e.currentTarget.blur();
              document.getElementById('typecast-hidden-input')?.focus();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 border rounded-lg text-xs font-mono transition-all cursor-pointer ${
              isAudioPaused
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30 font-semibold shadow-md shadow-amber-950/40'
                : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-gray-300 hover:text-white'
            }`}
            title="快捷键: Esc 暂停/恢复音频"
          >
            <span>{isAudioPaused ? '▶️' : '⏸️'}</span>
            <span>{isAudioPaused ? '继续播放 (Esc)' : '暂停音频 (Esc)'}</span>
          </button>

          {/* Round 3: 局部显微慢放快捷按钮 */}
          {currentRound === 3 && (
            <button
              onClick={(e) => {
                triggerLensReplay();
                e.currentTarget.blur();
                document.getElementById('typecast-hidden-input')?.focus();
              }}
              className={`flex items-center gap-1.5 px-3 py-1 border rounded-lg text-xs font-mono transition-all cursor-pointer ${
                viewState.isLensActive
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold shadow-md shadow-cyan-900/30'
                  : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-cyan-400 hover:text-cyan-200'
              }`}
              title="对当前单词进行 0.7x 局部保调慢放"
            >
              <span>🔍</span>
              <span>显微慢放 (0.7x)</span>
            </button>
          )}

          <button
            onClick={(e) => {
              handleTabKey();
              e.currentTarget.blur();
              document.getElementById('typecast-hidden-input')?.focus();
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-lg text-xs font-mono transition-colors cursor-pointer"
          >
            <span>Tab</span>
            <span className="text-gray-500">
              {currentRound === 4 ? '重听 (-2分)' : '重听本句'}
            </span>
          </button>
        </div>

        {/* 通关轮次专属：句子漫游抽屉 (Sentence Navigator Drawer) */}
        {isNavigatorOpen &&
          currentRound !== 4 &&
          viewState.roundCompleted[`round${currentRound}` as 'round1' | 'round2' | 'round3'] && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => {
                  setIsNavigatorOpen(false);
                  document.getElementById('typecast-hidden-input')?.focus();
                }}
              />
              <div className="relative z-10 w-full max-w-md bg-gray-950 border-l border-gray-800 h-full flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        📜 自由选句漫游 (Round {currentRound})
                      </span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                        ✅ 已完成
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      点击任意句子即可直接跳转精听复习（共 {total} 句）
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsNavigatorOpen(false);
                      document.getElementById('typecast-hidden-input')?.focus();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
                  >
                    ✕ 关闭
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {selectedEpisode.sentences.map((s, idx) => {
                    const isActive = idx === viewState.currentSentenceIndex;
                    const words = s.text.trim().split(/\s+/);
                    const firstWord = words[0] || '';
                    const restWords = words.slice(1).join(' ');

                    return (
                      <button
                        key={s.id ?? idx}
                        onClick={() => {
                          jumpToSentence(idx);
                          setIsNavigatorOpen(false);
                          setTimeout(() => {
                            document.getElementById('typecast-hidden-input')?.focus();
                          }, 50);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer group ${
                          isActive
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                            : 'bg-gray-900/50 hover:bg-gray-800/80 border-gray-800/80 text-gray-300'
                        }`}
                      >
                        <span
                          className={`font-mono text-xs px-2 py-0.5 rounded-md font-bold shrink-0 mt-0.5 ${
                            isActive
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-800 text-gray-400 group-hover:text-gray-200'
                          }`}
                        >
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="flex-1 text-xs leading-relaxed font-mono">
                          {currentRound === 1 ? (
                            <span>{s.text}</span>
                          ) : (
                            <span>
                              <span className="text-gray-200 font-semibold">{firstWord}</span>{' '}
                              <span className="blur-[4px] group-hover:blur-none transition-all text-gray-400 select-none">
                                {restWords}
                              </span>
                            </span>
                          )}
                        </div>
                        {isActive && (
                          <span className="text-[10px] font-bold text-blue-400 shrink-0 mt-0.5">
                            当前句
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
      </main>
    </div>
  );
}
