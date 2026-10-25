/**
 * AcousticTypingWorkspace (Module C.2).
 * Interactive deliberate practice stage featuring real-time acoustic micro-lens
 * highlighting, dynamic phoneme ribbons, and cognitive state awareness.
 */

import React, { useRef, useEffect } from 'react';
import { useAcousticTypingSession } from '../../hooks/useAcousticTypingSession';
import { PhoneticRealityCard } from './PhoneticRealityCard';
import { AcousticRadarView } from './AcousticRadarView';
import { ScaffoldLevel, type AcousticChunkData } from '@typecast/core';

interface AcousticTypingWorkspaceProps {
  chunk: AcousticChunkData;
  audioUrl?: string;
  onComplete?: () => void;
}

export const AcousticTypingWorkspace: React.FC<AcousticTypingWorkspaceProps> = ({
  chunk,
  audioUrl,
  onComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    currentChunk,
    cursorIndex,
    cognitiveState,
    activeScaffoldState,
    isCompleted,
    report,
    radarProfile,
    playerState,
    handleKeyDown,
    handleKeyUp,
    playCurrentChunk,
    triggerLensReplay,
    resetSession,
  } = useAcousticTypingSession({
    initialChunk: chunk,
    audioUrl,
    autoPlayOnMount: false,
  });

  // Keep focus on input area
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Trigger completion callback if provided
  useEffect(() => {
    if (isCompleted && onComplete) {
      onComplete();
    }
  }, [isCompleted, onComplete]);

  // Determine current word index from cursor
  let currentWordIdx = 0;
  let charCounter = 0;
  for (let w = 0; w < currentChunk.words.length; w++) {
    const wordLen = currentChunk.words[w].word.length;
    if (cursorIndex >= charCounter && cursorIndex <= charCounter + wordLen) {
      currentWordIdx = w;
      break;
    }
    charCounter += wordLen + 1; // including space
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className="relative flex flex-col gap-6 w-full max-w-4xl mx-auto rounded-3xl border border-slate-800 bg-slate-950/95 p-6 md:p-8 shadow-2xl outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all select-none"
    >
      {/* Top Header & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Chunk: {currentChunk.chunk_id}
            </span>
          </div>

          {/* Cognitive State Badge */}
          {cognitiveState === 'PERCEPTUAL_BLINDSPOT' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950/60 border border-rose-500/50 px-3 py-0.5 text-xs font-semibold text-rose-300 animate-bounce">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              听觉知觉盲区 (Blindspot)
            </span>
          )}
          {cognitiveState === 'MOTOR_TYPO' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/60 border border-amber-500/50 px-3 py-0.5 text-xs font-medium text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              运动手滑 (Motor Typo)
            </span>
          )}
          {cognitiveState === 'NORMAL_FLOW' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 px-3 py-0.5 text-xs font-medium text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              顺畅解码 (Normal Flow)
            </span>
          )}
        </div>

        {/* Audio Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playCurrentChunk}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              playerState === 'PLAYING'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span>🔊</span>
            原速试听 (1.0x)
          </button>

          <button
            type="button"
            onClick={triggerLensReplay}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              playerState === 'LENS_ACTIVE' || activeScaffoldState?.currentLevel === ScaffoldLevel.LEVEL_1_MICRO_LENS
                ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 ring-2 ring-indigo-500/40 shadow-lg'
                : 'bg-indigo-950/40 border-indigo-700/50 text-indigo-300 hover:bg-indigo-900/60'
            }`}
          >
            <span>🔍</span>
            显微微透镜 (0.7x 保调)
          </button>
        </div>
      </div>

      {/* Main Typing Stage */}
      <div className="py-6 px-4 md:px-8 rounded-2xl bg-slate-900/40 border border-slate-800/60 min-h-[160px] flex flex-col justify-center">
        {/* Word and Phoneme Ribbon Stream */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-8 font-mono">
          {currentChunk.words.map((w, wIdx) => {
            const isWordActive = wIdx === currentWordIdx;
            const hasBlindspot = activeScaffoldState && isWordActive;

            return (
              <div
                key={wIdx}
                className={`relative flex flex-col items-center transition-all duration-300 ${
                  hasBlindspot
                    ? 'p-2 -m-2 rounded-xl bg-cyan-950/30 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                    : ''
                }`}
              >
                {/* Phoneme Ribbon (above word) */}
                <div className="flex items-center gap-1 text-[11px] font-mono tracking-tighter text-slate-400 mb-1">
                  {w.phonemes.map((p, pIdx) => (
                    <span
                      key={pIdx}
                      className={`px-1 rounded ${
                        p.is_weakened
                          ? 'text-amber-400 font-semibold bg-amber-950/40'
                          : 'text-slate-400'
                      }`}
                    >
                      {p.phoneme}
                    </span>
                  ))}
                </div>

                {/* Word Orthography */}
                <div className="text-2xl md:text-3xl font-bold tracking-wider">
                  {w.word.split('').map((char, cIdx) => {
                    // Calculate global character index
                    let globalIdx = 0;
                    for (let prev = 0; prev < wIdx; prev++) {
                      globalIdx += currentChunk.words[prev].word.length + 1;
                    }
                    globalIdx += cIdx;

                    const isTyped = globalIdx < cursorIndex;
                    const isCursor = globalIdx === cursorIndex;

                    return (
                      <span
                        key={cIdx}
                        className={`relative inline-block transition-colors duration-150 ${
                          isTyped
                            ? 'text-emerald-400'
                            : isCursor
                            ? 'text-white underline decoration-cyan-400 decoration-2 underline-offset-4 animate-pulse'
                            : 'text-slate-500'
                        }`}
                      >
                        {char}
                      </span>
                    );
                  })}
                </div>

                {/* Phenomena Tags Ribbon (below word) */}
                {w.phenomena.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {w.phenomena.map((ph, phIdx) => (
                      <span
                        key={phIdx}
                        className="text-[9px] font-sans font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700/60"
                      >
                        {ph}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Level 2 & 3 Phonetic Contrast Scaffold Card */}
      {activeScaffoldState && activeScaffoldState.currentLevel >= ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL && (
        <PhoneticRealityCard scaffoldState={activeScaffoldState} />
      )}

      {/* Completion View */}
      {isCompleted && (
        <div className="mt-4 p-6 rounded-2xl bg-slate-900 border border-emerald-500/30 flex flex-col md:flex-row gap-6 items-center justify-between animate-in fade-in duration-500">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎉</span>
              <h4 className="text-lg font-bold text-emerald-400">意群听打完成！</h4>
            </div>
            <p className="text-xs text-slate-300">
              已完成本意群声学特征解码。FSRS 调度器已根据你的客观动力学数据完成自适应排程。
            </p>
            {report && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-800/60 p-2 rounded text-center">
                  <span className="block text-[11px] text-slate-400">打字准确率</span>
                  <span className="font-mono font-bold text-emerald-300">{report.accuracy}%</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded text-center">
                  <span className="block text-[11px] text-slate-400">平均击键间隔 (IKI)</span>
                  <span className="font-mono font-bold text-cyan-300">{report.meanIkiMs} ms</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded text-center">
                  <span className="block text-[11px] text-slate-400">攻破声学盲区</span>
                  <span className="font-mono font-bold text-indigo-300">{report.blindspotCount} 处</span>
                </div>
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => resetSession()}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                🔄 重新练习此意群
              </button>
            </div>
          </div>

          {/* Embedded Radar */}
          <div className="w-full md:w-auto flex justify-center">
            <AcousticRadarView profile={radarProfile} size={240} />
          </div>
        </div>
      )}
    </div>
  );
};
