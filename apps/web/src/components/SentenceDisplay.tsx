/**
 * SentenceDisplay.
 * Minimalist, distraction-free typing interface for acoustic deliberate practice.
 * 
 * Round 1: 明文识音 (Clean text display: completed / cursor / uncompleted)
 * Round 2: 模糊抓词 (Targeted slot masking for connected speech words; grey text for context)
 * Round 3: 单句盲听 (Pure auditory typing with minimalist underline slots)
 * Round 4: 全文大考 (Standard auditory examination slots)
 */

import React from 'react';
import type { Sentence } from '@typecast/shared-types';
import type { AcousticChunkData, WordScaffoldState } from '@typecast/core';

interface Props {
  sentence: Sentence;
  acousticChunk?: AcousticChunkData | null;
  cursorIndex: number;
  errorCount?: number;
  consecutiveErrors: number;
  hintMode: 'SHOW' | 'BLUR' | 'HIDDEN';
  round?: 1 | 2 | 3 | 4;
  activeScaffoldState?: WordScaffoldState;
  isLensActive?: boolean;
}

export const SentenceDisplay: React.FC<Props> = ({
  sentence,
  acousticChunk,
  cursorIndex,
  consecutiveErrors,
  hintMode,
  round = 1,
}) => {
  const text = sentence.text;
  const showHint = consecutiveErrors >= 3;

  // Split text into words and preserve character indices
  const words = text.split(' ');
  const acousticWords = acousticChunk?.words || [];

  // ---------------------------------------------------------------------------
  // Round 1: 明文识音 (Phonetic Translucency - Pure Text Stream)
  // ---------------------------------------------------------------------------
  if (round === 1 || hintMode === 'SHOW') {
    let charTracker = 0;

    return (
      <div className="max-w-full flex flex-wrap items-center justify-center gap-x-3 gap-y-3 select-none px-2 py-4 font-mono text-2xl sm:text-3xl md:text-4xl tracking-wide leading-relaxed">
        {words.map((wordStr, wIdx) => {
          const wordStart = charTracker;
          charTracker += wordStr.length + 1; // +1 space

          return (
            <span key={wIdx} className="inline-block">
              {wordStr.split('').map((char, cOffset) => {
                const globalIdx = wordStart + cOffset;
                let cls = 'text-gray-400 font-medium';
                if (globalIdx < cursorIndex) cls = 'text-emerald-400 font-bold';
                else if (globalIdx === cursorIndex) cls = 'text-white underline decoration-blue-500 decoration-4 font-bold';

                return (
                  <span key={cOffset} className={cls}>
                    {char}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Round 2: 模糊抓词 (Natural Word-Flow Typography with Optical Frosted Blur)
  // ---------------------------------------------------------------------------
  if (round === 2) {
    let charTracker = 0;
    const hasAnyPhenomena = acousticWords.some((w) => w.phenomena && w.phenomena.length > 0);

    // 智能均衡遮罩密度：避免连续多个单词全部陷入模糊，保证上下文锚点可读
    let prevMasked = false;
    const maskFlags = words.map((_, wIdx) => {
      const acousticWord = acousticWords[wIdx];
      const hasPhenomena = acousticWord && acousticWord.phenomena && acousticWord.phenomena.length > 0;
      let mask = hasAnyPhenomena ? !!hasPhenomena : wIdx % 2 === 1;
      if (mask && prevMasked) {
        mask = false;
      }
      prevMasked = mask;
      return mask;
    });

    return (
      <div className="max-w-full flex flex-wrap items-center justify-center gap-x-3 gap-y-3 select-none px-2 py-4 font-mono text-2xl sm:text-3xl md:text-4xl tracking-wide leading-relaxed">
        {words.map((wordStr, wIdx) => {
          const wordStart = charTracker;
          charTracker += wordStr.length + 1; // +1 space
          const shouldMask = maskFlags[wIdx];

          return (
            <span
              key={wIdx}
              className={`inline-block transition-all duration-200 ${
                shouldMask ? 'group cursor-help' : ''
              }`}
              title={shouldMask ? '悬浮临时预览单词' : undefined}
            >
              {wordStr.split('').map((char, cOffset) => {
                const globalIdx = wordStart + cOffset;
                const isCompleted = globalIdx < cursorIndex;
                const isCurrent = globalIdx === cursorIndex;
                const isPunctuation = /[.,!?;:'"()[\]{}]/.test(char);

                if (isCompleted) {
                  return (
                    <span key={cOffset} className="text-emerald-400 font-bold">
                      {char}
                    </span>
                  );
                }

                if (isCurrent) {
                  const currentCls = showHint
                    ? 'text-amber-400 underline decoration-amber-400 decoration-4 font-bold animate-pulse'
                    : 'text-white underline decoration-blue-500 decoration-4 font-bold';
                  return (
                    <span key={cOffset} className={currentCls}>
                      {char}
                    </span>
                  );
                }

                // 未输入字符：如果是标点符号，保持中灰自然排版，不模糊
                if (isPunctuation) {
                  return (
                    <span key={cOffset} className="text-gray-500 font-medium">
                      {char}
                    </span>
                  );
                }

                // 遮罩难点词：呈现自然高斯毛玻璃模糊，hover时临时清晰
                if (shouldMask) {
                  return (
                    <span
                      key={cOffset}
                      className={`text-gray-300 font-medium inline-block transition-all duration-200 ${
                        showHint ? '' : 'blur-[5px] group-hover:blur-none'
                      }`}
                    >
                      {char}
                    </span>
                  );
                }

                // 普通未遮罩上下文单词：清晰中灰
                return (
                  <span key={cOffset} className="text-gray-500 font-medium">
                    {char}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Round 3 & Round 4: 盲听模式 (Pure Auditory Typing Slots - Zero Clutter)
  // ---------------------------------------------------------------------------
  let charTracker = 0;

  return (
    <div className="max-w-full flex flex-wrap items-center justify-center gap-y-4 select-none px-2 py-4">
      {words.map((word, wordIdx) => {
        const chars = word.split('');
        const wordStartIdx = charTracker;
        charTracker += word.length + 1; // +1 space

        return (
          <div key={wordIdx} className="inline-flex items-center mx-2 sm:mx-3">
            {chars.map((char, charOffset) => {
              const i = wordStartIdx + charOffset;
              const isCompleted = i < cursorIndex;
              const isCurrent = i === cursorIndex;

              if (isCompleted) {
                return (
                  <div
                    key={i}
                    className="w-5 sm:w-6 h-9 sm:h-10 mx-[1.5px] border-b-2 border-emerald-500/70 inline-flex items-center justify-center font-mono text-lg sm:text-2xl text-emerald-400 font-bold transition-all"
                  >
                    {char}
                  </div>
                );
              }

              if (isCurrent) {
                return (
                  <div
                    key={i}
                    className={`w-5 sm:w-6 h-9 sm:h-10 mx-[1.5px] border-b-2 inline-flex items-center justify-center font-mono text-lg sm:text-2xl transition-all ${
                      showHint
                        ? 'border-amber-400 text-amber-400 font-bold animate-pulse'
                        : 'border-blue-400 bg-blue-500/10 text-white animate-pulse'
                    }`}
                  >
                    {showHint ? char : ''}
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className="w-5 sm:w-6 h-9 sm:h-10 mx-[1.5px] border-b-2 border-gray-700 inline-flex items-center justify-center font-mono text-lg sm:text-2xl text-transparent"
                >
                  &nbsp;
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
