/**
 * AcousticRadarView (Module C.3).
 * Lightweight, pure SVG 5-Dimensional Acoustic Perception Radar.
 * Plots mastery scores (0~100) across LINKING, REDUCTION, ELISION, ASSIMILATION, GLOTTAL_STOP,
 * alongside Power Law latency convergence metrics. Zero external chart dependencies.
 */

import React from 'react';
import type { AcousticRadarProfile, PhenomenonType } from '@typecast/core';

interface AcousticRadarViewProps {
  profile: AcousticRadarProfile;
  size?: number;
}

const AXIS_CONFIG: Array<{ key: PhenomenonType; label: string; angle: number }> = [
  { key: 'LINKING', label: '连读 (Linking)', angle: -90 },
  { key: 'REDUCTION', label: '弱读 (Reduction)', angle: -18 },
  { key: 'ELISION', label: '失爆 (Elision)', angle: 54 },
  { key: 'GLOTTAL_STOP', label: '喉塞音 (Glottal)', angle: 126 },
  { key: 'ASSIMILATION', label: '同化 (Assimilation)', angle: 198 },
];

export const AcousticRadarView: React.FC<AcousticRadarViewProps> = ({ profile, size = 280 }) => {
  const center = size / 2;
  const radius = (size / 2) * 0.72;

  // Degrees to radians
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Compute point coordinates on radar
  const getPoint = (angleDeg: number, valNorm: number) => {
    const r = radius * Math.min(1.0, Math.max(0.0, valNorm));
    const rad = toRad(angleDeg);
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  // Generate background concentric rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Polygon path for current user scores
  const polygonPoints = AXIS_CONFIG.map(({ key, angle }) => {
    const score = profile.radarVector[key] ?? 50;
    const pt = getPoint(angle, score / 100);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between w-full mb-2">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          五维声学知觉雷达图
        </h3>
        <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
          FSRS-DSR 认知模型
        </span>
      </div>

      {/* SVG Radar */}
      <div className="relative my-2">
        <svg width={size} height={size} className="overflow-visible">
          {/* Concentric grid rings */}
          {rings.map((ring, idx) => {
            const ringPts = AXIS_CONFIG.map(({ angle }) => {
              const pt = getPoint(angle, ring);
              return `${pt.x},${pt.y}`;
            }).join(' ');
            return (
              <polygon
                key={idx}
                points={ringPts}
                fill="none"
                stroke="#334155"
                strokeWidth={idx === rings.length - 1 ? '1.5' : '1'}
                strokeDasharray={idx < rings.length - 1 ? '3 3' : undefined}
                opacity={0.6}
              />
            );
          })}

          {/* Radial axis lines */}
          {AXIS_CONFIG.map(({ angle }, idx) => {
            const edgePt = getPoint(angle, 1.0);
            return (
              <line
                key={idx}
                x1={center}
                y1={center}
                x2={edgePt.x}
                y2={edgePt.y}
                stroke="#475569"
                strokeWidth="1"
                opacity={0.7}
              />
            );
          })}

          {/* Filled User Mastery Polygon */}
          <polygon
            points={polygonPoints}
            fill="rgba(6, 182, 212, 0.25)"
            stroke="#06b6d4"
            strokeWidth="2.5"
            className="transition-all duration-500 ease-out"
          />

          {/* Data point vertices */}
          {AXIS_CONFIG.map(({ key, angle }, idx) => {
            const score = profile.radarVector[key] ?? 50;
            const pt = getPoint(angle, score / 100);
            return (
              <g key={idx}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  fill="#06b6d4"
                  stroke="#0f172a"
                  strokeWidth="2"
                  className="transition-all duration-500"
                />
              </g>
            );
          })}

          {/* Axis Labels */}
          {AXIS_CONFIG.map(({ key, label, angle }, idx) => {
            const labelPt = getPoint(angle, 1.22);
            const score = profile.radarVector[key] ?? 50;
            return (
              <text
                key={idx}
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-300 text-[10px] font-mono font-medium"
              >
                {label} ({score})
              </text>
            );
          })}
        </svg>
      </div>

      {/* Cognitive Metrics Footer */}
      <div className="grid grid-cols-2 gap-3 w-full mt-3 pt-3 border-t border-slate-800 text-center">
        <div className="rounded-lg bg-slate-800/40 p-2 border border-slate-700/40">
          <span className="block text-[11px] text-slate-400">击键潜伏期下降率</span>
          <span className="text-base font-mono font-bold text-emerald-400">
            {profile.meanLatencyReductionPercent > 0 ? `-${profile.meanLatencyReductionPercent}%` : '0%'}
          </span>
        </div>
        <div className="rounded-lg bg-slate-800/40 p-2 border border-slate-700/40">
          <span className="block text-[11px] text-slate-400">累计攻破盲区数</span>
          <span className="text-base font-mono font-bold text-cyan-400">
            {profile.totalOvercomeCount} 次
          </span>
        </div>
      </div>
    </div>
  );
};
