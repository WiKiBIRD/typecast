/**
 * PhoneticRealityCard (Module C.1).
 * Cognitive contrast card exposing the discrepancy between Citation IPA and
 * Physical Surface IPA, piercing auditory illusions during connected speech.
 */

import React from 'react';
import type { WordScaffoldState } from '@typecast/core';
import { ScaffoldLevel } from '@typecast/core';

interface PhoneticRealityCardProps {
  scaffoldState: WordScaffoldState;
}

const PHENOMENON_BADGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  LINKING: { bg: 'bg-emerald-900/40 border-emerald-500/50', text: 'text-emerald-400', label: '辅音连读 (Linking)' },
  REDUCTION: { bg: 'bg-amber-900/40 border-amber-500/50', text: 'text-amber-400', label: '弱读弱化 (Reduction)' },
  ELISION: { bg: 'bg-rose-900/40 border-rose-500/50', text: 'text-rose-400', label: '失去爆破 (Elision)' },
  GLOTTAL_STOP: { bg: 'bg-indigo-900/40 border-indigo-500/50', text: 'text-indigo-400', label: '喉塞音 (Glottal Stop)' },
  ASSIMILATION: { bg: 'bg-purple-900/40 border-purple-500/50', text: 'text-purple-400', label: '部位同化 (Assimilation)' },
};

export const PhoneticRealityCard: React.FC<PhoneticRealityCardProps> = ({ scaffoldState }) => {
  const { currentLevel, hint, skeleton } = scaffoldState;

  if (currentLevel < ScaffoldLevel.LEVEL_2_PHONETIC_REVEAL && !hint) {
    return null;
  }

  const badge = hint ? PHENOMENON_BADGE_STYLE[hint.phenomenon] || {
    bg: 'bg-cyan-900/40 border-cyan-500/50',
    text: 'text-cyan-400',
    label: hint.phenomenon,
  } : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {/* Glow highlight */}
      <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />

      {/* Header Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-cyan-300">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          Level {currentLevel}: 声学物理现实揭示
        </span>
        {badge && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* IPA Contrast Panel */}
      {hint && (
        <div className="grid grid-cols-2 gap-3 my-3">
          <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
            <span className="block text-[11px] font-mono text-slate-400 mb-1">字典标准音标 (Citation)</span>
            <span className="text-lg font-serif text-slate-200 tracking-wide">{hint.ipaCitation}</span>
          </div>

          <div className="rounded-lg bg-cyan-950/40 p-3 border border-cyan-500/40 shadow-inner">
            <span className="block text-[11px] font-mono text-cyan-300 font-semibold mb-1">
              物理表面实际音标 (Surface)
            </span>
            <span className="text-lg font-serif font-bold text-cyan-300 tracking-wide">
              {hint.ipaActual}
            </span>
          </div>
        </div>
      )}

      {/* Auditory guidance explanation */}
      {hint && (
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-2.5 rounded-md border border-slate-700/40 mt-2">
          💡 <span className="font-medium text-slate-200">听觉线索：</span>{hint.acousticExplanation}
        </p>
      )}

      {/* Level 3 minimal skeleton */}
      {currentLevel >= ScaffoldLevel.LEVEL_3_SKELETON && skeleton && (
        <div className="mt-3 p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/40 flex items-center justify-between">
          <span className="text-xs font-mono text-indigo-300 font-medium">辅音骨架脚手架：</span>
          <span className="font-mono text-lg font-bold tracking-widest text-indigo-200 bg-slate-900/60 px-3 py-0.5 rounded border border-indigo-500/30">
            {skeleton}
          </span>
        </div>
      )}
    </div>
  );
};
