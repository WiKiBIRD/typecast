import { useState } from 'react';
import { usePracticeSession } from '../hooks/usePracticeSession';
import { SentenceDisplay } from '../components/SentenceDisplay';
import type { Episode } from '@typecast/shared-types';

type HintMode = 'SHOW' | 'BLUR' | 'HIDDEN';

export function PracticePage() {
  const [hintMode, setHintMode] = useState<HintMode>('SHOW');
  const [episode, setEpisode] = useState<Episode | null>(null);

  const {
    viewState,
    handleEpisodeLoad,
    handleTabKey,
    handleReset,
    currentSentence,
  } = usePracticeSession(80, 'native');

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDemo = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch('/data/voa/ep-01.json');
      if (!res.ok) {
        throw new Error(`无法获取示范集数据: HTTP ${res.status}`);
      }
      const ep: Episode = await res.json();
      setEpisode(ep);
      await handleEpisodeLoad(ep);
    } catch (err: unknown) {
      console.error('加载失败:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!viewState.isReady || !currentSentence) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
            🎙️
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">TypeCast (听写铸键)</h1>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            长句精听闭环 · 肌肉记忆训练 · 纯前端无头架构
          </p>

          {loadError && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-left">
              <strong>加载出错：</strong> {loadError}
            </div>
          )}

          <button
            onClick={loadDemo}
            disabled={isLoading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 active:scale-[0.99] text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>正在加载音频与数据...</span>
              </span>
            ) : (
              <>
                <span>加载 VOA 示范集 (The Word 'Cool')</span>
                <span>➔</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const total = episode?.sentences.length ?? 1;
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
      {/* 顶部进度条 */}
      <div className="w-full h-1 bg-gray-900">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* 创作者卡片与头部导航 */}
      {episode && (
        <header className="flex items-center justify-between px-8 py-4 border-b border-gray-800/80 bg-gray-950/50 backdrop-blur">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                handleReset();
                setEpisode(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 active:scale-95 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-all cursor-pointer"
              title="返回集数选择列表"
            >
              <span>←</span>
              <span>返回列表</span>
            </button>
            <div className="h-4 w-[1px] bg-gray-800"></div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center border border-blue-500/30 text-xs">
                EP1
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-200">{episode.title}</div>
                <div className="text-xs text-gray-500">{episode.creator.name}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={episode.creator.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-blue-400 border border-gray-800 hover:border-blue-500/40 px-3 py-1.5 rounded-lg transition-colors"
            >
              Support Creator ↗
            </a>
          </div>
        </header>
      )}

      {/* 练习主区域 */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16 max-w-4xl mx-auto w-full">
        {/* 提示模式切换 */}
        <div className="flex bg-gray-900/80 border border-gray-800 p-1 rounded-xl mb-12">
          {(['SHOW', 'BLUR', 'HIDDEN'] as HintMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setHintMode(mode)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                hintMode === mode
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {mode === 'SHOW' ? '明文跟打' : mode === 'BLUR' ? '模糊轮廓' : '纯盲听写'}
            </button>
          ))}
        </div>

        {/* 核心句子跟打展示 */}
        <div 
          onClick={() => {
            const el = document.getElementById('typecast-hidden-input');
            if (el) el.focus();
          }}
          className="w-full bg-gray-900/40 border border-gray-800/80 rounded-3xl p-12 shadow-2xl flex flex-col items-center justify-center min-h-[220px] cursor-text relative"
        >
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

        {/* 状态与操控指示 */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-400">
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
            onClick={handleTabKey}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-lg text-xs font-mono transition-colors"
          >
            <span>Tab</span>
            <span className="text-gray-500">重听本句</span>
          </button>
        </div>
      </main>
    </div>
  );
}
