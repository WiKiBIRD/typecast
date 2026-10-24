import { useState, useEffect } from 'react';
import { usePracticeSession, type TrainingRound } from '../hooks/usePracticeSession';
import { SentenceDisplay } from '../components/SentenceDisplay';
import { ChallengeResultModal } from '../components/ChallengeResultModal';
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
  const PAGE_SIZE = 12;

  const {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    restartFromBeginning,
    selectRound,
    togglePlayPause,
    isAudioPaused,
    dismissChallengeModal,
    resumePrompt,
    currentSentence,
  } = usePracticeSession(80, 'native');

  // 载入 manifest 与数据库中的历史进度
  useEffect(() => {
    async function initCatalog() {
      try {
        const res = await fetch(`/data/manifest.json?t=${Date.now()}`, { cache: 'no-cache' });
        if (res.ok) {
          const data: ManifestData = await res.json();
          setManifest(data);
        }

        // 读取所有关卡进度
        const allRecords = await db.progress.toArray();
        const map: Record<string, EpisodeProgressRecord> = {};
        for (const r of allRecords) {
          map[r.episodeId] = r;
        }
        setProgressMap(map);
      } catch (e) {
        console.warn('获取目录数据失败:', e);
      }
    }
    initCatalog();
  }, [viewState.roundCompleted, selectedEpisode]);

  // 切句时自动聚焦隐形输入框
  useEffect(() => {
    if (viewState.isReady && currentSentence) {
      const el = document.getElementById('typecast-hidden-input');
      if (el) el.focus();
    }
  }, [viewState.currentSentenceIndex, viewState.isReady, currentSentence]);

  const loadEpisodeData = async (epItem: ManifestEpisode) => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch(`${epItem.dataFile}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) {
        throw new Error(`无法获取集数数据: HTTP ${res.status}`);
      }
      const epData: Episode = await res.json();
      setSelectedEpisode(epData);
      await handleEpisodeLoad(epData);
    } catch (err: unknown) {
      console.error('加载集数失败:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 检查某集是否解锁（上一集 Round 4 必须 >= 80 分）
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
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-700 bg-gray-800"
                  />
                  <div>
                    <h2 className="text-xl font-bold text-white">{series.title}</h2>
                    <p className="text-xs text-gray-400 mt-1">{series.description}</p>
                  </div>
                </div>

                {/* 搜索过滤框 */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="🔍 搜索期号或主题 (如 #1, Restaurant)..."
                    className="w-full md:w-72 px-4 py-2 bg-gray-950/80 border border-gray-800 focus:border-blue-500 rounded-xl text-xs text-gray-200 placeholder-gray-500 outline-none transition-all"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* 集数列表卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paginatedEpisodes.map((ep) => {
                  const unlocked = isEpisodeUnlocked(ep.episodeNumber);
                  const record = progressMap[ep.id] || progressMap[`slow-english-ep-0${ep.episodeNumber}`];
                  const hasPassed = record?.bestScore && record.bestScore.score >= 80;
                  const isReady = ep.ready !== false;

                  return (
                    <div
                      key={ep.id}
                      onClick={() => {
                        if (!unlocked) return;
                        if (!isReady) {
                          alert(`EPISODE #${ep.episodeNumber} 《${ep.title}》 正在自动化对齐流水线中，请先挑战已就绪的示范集（如 #1 Restaurant）！`);
                          return;
                        }
                        if (!isLoading) loadEpisodeData(ep);
                      }}
                      className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                        unlocked && isReady
                          ? 'bg-gray-950/70 border-gray-800 hover:border-blue-500/50 hover:bg-gray-900 cursor-pointer shadow-lg group'
                          : unlocked && !isReady
                          ? 'bg-gray-950/40 border-gray-800/80 hover:border-amber-500/40 cursor-pointer opacity-75'
                          : 'bg-gray-950/30 border-gray-900 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 bg-blue-500/10 rounded">
                            EPISODE #{ep.episodeNumber}
                          </span>
                          {!unlocked ? (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              🔒 需前一集大考 ≥80分
                            </span>
                          ) : !isReady ? (
                            <span className="text-xs text-amber-400/90 font-medium px-2 py-0.5 bg-amber-500/10 rounded">
                              ⏳ 待生成对齐
                            </span>
                          ) : hasPassed ? (
                            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                              ⭐ 最好成绩: {record.bestScore?.score}分
                            </span>
                          ) : (
                            <span className="text-xs text-amber-400 font-medium">待通关</span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-gray-100 group-hover:text-blue-300 transition-colors">
                          {ep.title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {isReady ? `共 ${ep.sentenceCount} 句教学精听内容` : `时长 ${Math.round(ep.duration / 60)} 分钟 · 官方音频已直链`}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-900 flex items-center justify-between text-xs text-gray-400">
                        <span>{record ? `当前进度: Round ${record.currentRound}` : isReady ? '未开始' : '待对齐'}</span>
                        <span className="text-blue-400 group-hover:translate-x-1 transition-transform">
                          {!unlocked ? '锁定中' : isReady ? '开始练习 ➔' : '排队中 ⏱️'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 分页控制栏 */}
              {totalPages > 1 && (
                <div className="mt-8 pt-6 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
                  <div>
                    共 <span className="text-gray-200 font-bold">{filteredEpisodes.length}</span> 期节目 · 第{' '}
                    <span className="text-blue-400 font-bold">{currentPage}</span> / {totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white"
                    >
                      上一页
                    </button>
                    <span className="px-2 font-mono">{currentPage}</span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-lg hover:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 hover:text-white"
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

  // 练习界面
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

      {/* 结算结果弹窗 */}
      {viewState.challengeResult && (
        <ChallengeResultModal
          currentResult={viewState.challengeResult}
          bestScore={viewState.bestScore?.score}
          onRetry={() => {
            dismissChallengeModal();
            selectRound(4);
          }}
          onNextEpisode={() => {
            dismissChallengeModal();
            handleReset();
            setSelectedEpisode(null);
          }}
          onBackToList={() => {
            dismissChallengeModal();
            handleReset();
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
            onClick={() => {
              handleReset();
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
        {/* 4 阶梯关卡控制器 */}
        <div className="flex bg-gray-900/80 border border-gray-800 p-1.5 rounded-2xl mb-12 gap-1.5">
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
            return (
              <button
                key={item.round}
                onClick={(e) => {
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
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* 核心句子展示卡片 */}
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
            cursorIndex={viewState.cursorIndex}
            errorCount={viewState.errorCount}
            consecutiveErrors={viewState.consecutiveErrors}
            hintMode={hintMode}
          />
        </div>

        {/* 底部指标指示 */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">进度:</span>
            <span className="font-mono text-gray-200">{current} / {total} 句</span>
          </div>
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
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30 font-semibold'
                : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-gray-300 hover:text-white'
            }`}
            title="离开电脑或暂停音频循环"
          >
            <span>{isAudioPaused ? '▶️' : '⏸️'}</span>
            <span>{isAudioPaused ? '继续播放' : '暂停音频'}</span>
          </button>

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
      </main>
    </div>
  );
}
