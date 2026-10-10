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

  if (hintMode === 'SHOW') {
    return (
      <div className="text-3xl font-mono tracking-wide leading-relaxed text-center select-none">
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
      <div className="text-center select-none">
        <span className="text-3xl font-mono text-emerald-400 font-semibold">
          {text.slice(0, cursorIndex)}
        </span>
        <span
          className="text-3xl font-mono text-gray-300 transition-all duration-200"
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

  const showHint = consecutiveErrors >= 3;

  return (
    <div className="text-3xl font-mono tracking-widest text-center select-none">
      {text.split('').map((char, i) => {
        if (i < cursorIndex) {
          return (
            <span key={i} className="text-emerald-400 font-semibold">
              {char}
            </span>
          );
        }
        if (i === cursorIndex) {
          if (showHint && char.trim()) {
            return (
              <span key={i} className="text-amber-400 underline decoration-amber-400 animate-pulse font-bold">
                {char}
              </span>
            );
          }
          return (
            <span key={i} className="text-white border-b-2 border-blue-400 animate-pulse">
              {char === ' ' ? '\u00a0' : '_'}
            </span>
          );
        }
        return (
          <span key={i} className="text-gray-700">
            {char === ' ' ? '\u00a0' : '_'}
          </span>
        );
      })}
    </div>
  );
}
