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

  // 盲听模式 (HIDDEN): 单词边界自适应换行，避免超长横跨卡片
  return (
    <div className="text-xl sm:text-2xl md:text-3xl font-mono leading-loose text-center select-none max-w-full break-words px-2 flex flex-wrap items-center justify-center">
      {text.split('').map((char, i) => {
        // 空格处渲染可折行的间距，允许自然换行
        if (char === ' ') {
          return (
            <span
              key={i}
              className={`inline-block w-2.5 sm:w-3.5 ${
                i < cursorIndex ? 'border-b-2 border-transparent' : ''
              }`}
            >
              {' '}
            </span>
          );
        }

        // 已正确键入的字符
        if (i < cursorIndex) {
          return (
            <span key={i} className="text-emerald-400 font-semibold inline-block">
              {char}
            </span>
          );
        }

        // 当前正在等待输入的字符
        if (i === cursorIndex) {
          if (showHint) {
            return (
              <span
                key={i}
                className="text-amber-400 underline decoration-amber-400 animate-pulse font-bold inline-block"
              >
                {char}
              </span>
            );
          }
          return (
            <span
              key={i}
              className="text-white border-b-2 border-blue-400 animate-pulse inline-block min-w-[0.6em]"
            >
              _
            </span>
          );
        }

        // 未输入的盲听占位符
        return (
          <span key={i} className="text-gray-700/80 inline-block min-w-[0.6em]">
            _
          </span>
        );
      })}
    </div>
  );
}
