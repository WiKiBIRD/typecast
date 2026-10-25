import React from 'react';
import type { ChallengeScoreResult, AcousticRadarProfile } from '@typecast/core';
import confetti from 'canvas-confetti';
import { AcousticRadarView } from './acoustic/AcousticRadarView';

interface Props {
  currentResult: ChallengeScoreResult;
  bestScore?: number;
  radarProfile?: AcousticRadarProfile | null;
  onRetry: () => void;
  onNextEpisode?: () => void;
  onBackToList: () => void;
}

export function ChallengeResultModal({
  currentResult,
  bestScore,
  radarProfile,
  onRetry,
  onNextEpisode,
  onBackToList,
}: Props) {
  React.useEffect(() => {
    if (currentResult.passed) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
    }
  }, [currentResult.passed]);

  const isNewRecord = bestScore !== undefined && currentResult.score > bestScore;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-lg w-full p-8 shadow-2xl text-center relative overflow-hidden">
        {/* 顶部光晕装饰 */}
        <div
          className={`absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-60 rounded-full blur-3xl opacity-30 ${
            currentResult.passed ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />

        <div className="relative">
          <div className="text-4xl mb-3">
            {currentResult.passed ? '🎉' : '💪'}
          </div>

          <h2 className="text-2xl font-black text-white mb-1">
            {currentResult.passed ? 'Round 4 全文大挑战合格！' : '大挑战未达标 (需 ≥ 80分)'}
          </h2>

          <p className="text-sm text-gray-400 mb-6">{currentResult.feedback}</p>

          {/* 分数核心看板 */}
          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-around">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">本次大考得分</div>
                <div
                  className={`text-5xl font-black font-mono ${
                    currentResult.passed ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {currentResult.score}
                  <span className="text-lg text-gray-500 font-normal"> / 100</span>
                </div>
              </div>

              <div className="h-12 w-[1px] bg-gray-800" />

              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">历史最高纪录</div>
                <div className="text-3xl font-black font-mono text-gray-300">
                  {bestScore ?? currentResult.score}
                  <span className="text-xs text-gray-500 font-normal"> 分</span>
                </div>
                {isNewRecord && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-full">
                    👑 新纪录 (+{currentResult.score - bestScore})
                  </span>
                )}
              </div>
            </div>

            {/* 详细指标 */}
            <div className="mt-6 pt-4 border-t border-gray-800/80 grid grid-cols-2 gap-4 text-xs">
              <div className="flex justify-between items-center text-gray-400">
                <span>听写准确率:</span>
                <span className="font-mono text-gray-200 font-bold">
                  {(currentResult.accuracy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>实测打字语速:</span>
                <span className="font-mono text-gray-200 font-bold">{currentResult.wpm} WPM</span>
              </div>
            </div>

            {/* FSRS 五维声学知觉雷达图 */}
            {radarProfile && (
              <div className="mt-6 pt-4 border-t border-gray-800/80 flex flex-col items-center">
                <AcousticRadarView profile={radarProfile} size={250} />
              </div>
            )}
          </div>

          {/* 交互按钮 */}
          <div className="flex flex-col gap-3">
            {currentResult.passed && onNextEpisode ? (
              <button
                onClick={onNextEpisode}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              >
                解锁并进入下一集 ➔
              </button>
            ) : null}

            <div className="flex gap-3">
              <button
                onClick={onRetry}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-xl transition-all cursor-pointer text-sm"
              >
                再测一次
              </button>

              <button
                onClick={onBackToList}
                className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-gray-200 font-medium rounded-xl transition-all cursor-pointer text-sm"
              >
                返回集数列表
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
