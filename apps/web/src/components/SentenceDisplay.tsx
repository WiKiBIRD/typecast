import type { Sentence } from '@typecast/shared-types';

interface Props {
  sentence: Sentence;
  cursorIndex: number;
  errorCount: number;
  consecutiveErrors: number;
  hintMode: 'SHOW' | 'BLUR' | 'HIDDEN';
}

export function SentenceDisplay({
  sentence,
  cursorIndex,
  consecutiveErrors,
  hintMode,
}: Props) {
  const text = sentence.text;
  const showHint = consecutiveErrors >= 3;

  if (hintMode === 'SHOW') {
    return (
      <div className="text-xl sm:text-2xl md:text-3xl font-mono tracking-wide leading-relaxed text-center select-none max-w-full break-words px-2">
        {text.split('').map((char, i) => {
          let cls = 'text-gray-600';
          if (i < cursorIndex) cls = 'text-emerald-400 font-semibold';
          if (i === cursorIndex) cls = 'text-white underline decoration-blue-500 decoration-4';
          return (
            <span key={i} className={cls}>
              {char}
            </span>
          );
        })}
      </div>
    );
  }

  if (hintMode === 'BLUR') {
    return (
      <div className="text-xl sm:text-2xl md:text-3xl font-mono leading-relaxed text-center select-none max-w-full break-words px-2">
        <span className="text-emerald-400 font-semibold">
          {text.slice(0, cursorIndex)}
        </span>
        <span
          className="text-gray-300 transition-all duration-200"
          style={{ filter: 'blur(6px)', cursor: 'help' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.filter = 'blur(0)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.filter = 'blur(6px)';
          }}
          title="鼠标悬停临时查看文字"
        >
          {text.slice(cursorIndex)}
        </span>
      </div>
    );
  }

  // 盲听模式 (HIDDEN): 
  // 每个待输入字母槽位固定等宽（w-5 / sm:w-6），严格等长，拒绝长短混乱；
  // 单词间自适应折行，整体居中。
  const words = text.split(' ');
  let charTracker = 0;

  return (
    <div className="max-w-full flex flex-wrap items-center justify-center gap-y-4 select-none px-2 py-4">
      {words.map((word, wordIdx) => {
        const chars = word.split('');
        const wordStartIdx = charTracker;
        charTracker += word.length + 1; // +1 为空格

        return (
          <div key={wordIdx} className="inline-flex items-center mx-2 sm:mx-3">
            {chars.map((char, charOffset) => {
              const i = wordStartIdx + charOffset;
              const isCompleted = i < cursorIndex;
              const isCurrent = i === cursorIndex;

              // 已输入正确的字母
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

              // 当前聚焦待键入的字母槽
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

              // 未输入的占位横线：严格固定等宽（w-5/w-6），完全等长整齐
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
}
