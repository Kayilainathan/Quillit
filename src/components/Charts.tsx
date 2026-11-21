import { useMemo, useState } from 'react';
import type { RubricScores, WritingSession } from '../types';
import { RUBRIC_DIMENSIONS, computeAverageRubric } from '../utils/analytics';

interface TrendChartProps {
  sessions: WritingSession[];
}

export function ScoreTrendChart({ sessions }: TrendChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (completed.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-ink-muted">
        Complete a writing evaluation to see your score trajectory.
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padX = 44;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = completed.map((s, idx) => {
    const x =
      completed.length === 1
        ? padX + innerW / 2
        : padX + (idx / (completed.length - 1)) * innerW;
    const clampedPct = Math.max(0, Math.min(100, s.percentage));
    const y = padY + innerH - (clampedPct / 100) * innerH;
    return { x, y, session: s };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`
      : '';

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            Mastery &amp; Rubric Trajectory
          </h3>
          <p className="text-xs text-ink-muted">
            Percentage score across completed writing sessions
          </p>
        </div>
        {activePoint && (
          <div className="text-xs font-mono-tabular text-ink-secondary">
            {activePoint.session.date} · {activePoint.session.totalScore}/60 (
            {activePoint.session.percentage.toFixed(1)}%)
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label="Line chart of writing mastery percentage across sessions"
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padY + innerH - (tick / 100) * innerH;
          return (
            <g key={tick}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX / 2}
                y2={y}
                stroke="var(--chart-grid)"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text
                x={padX - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--ink-muted)"
                className="text-[10px] font-mono"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {areaPath && (
          <path
            d={areaPath}
            fill="var(--chart-primary-soft)"
          />
        )}

        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--chart-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((pt, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <g key={pt.session.id}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 4}
                fill="var(--bg-surface)"
                stroke="var(--chart-primary)"
                className="cursor-pointer transition-all"
                strokeWidth={2}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              <text
                x={pt.x}
                y={height - 4}
                textAnchor="middle"
                fill="var(--ink-muted)"
                className="text-[10px] font-mono"
              >
                {pt.session.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface RubricComparisonProps {
  sessions: WritingSession[];
}

export function RubricProfileChart({ sessions }: RubricComparisonProps) {
  const [displayMode, setDisplayMode] = useState<'web' | 'bars'>('web');
  const [hoveredDimIdx, setHoveredDimIdx] = useState<number | null>(null);

  const completed = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'Completed')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions]
  );

  const latest: RubricScores | null = completed[0]?.scores ?? null;
  const average = useMemo(() => computeAverageRubric(completed), [completed]);
  const personalBest: RubricScores | null = useMemo(() => {
    if (completed.length === 0) return null;
    return [...completed].sort((a, b) => b.totalScore - a.totalScore)[0].scores;
  }, [completed]);

  const radarGeometry = useMemo(() => {
    const cx = 170;
    const cy = 140;
    const maxR = 98;
    const n = RUBRIC_DIMENSIONS.length;

    const getPoint = (idx: number, val10: number) => {
      const angle = ((idx * 360) / n - 90) * (Math.PI / 180);
      const r = (Math.max(0, Math.min(10, val10)) / 10) * maxR;
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      };
    };

    const ringLevels = [2, 4, 6, 8, 10];
    const rings = ringLevels.map((lvl) =>
      RUBRIC_DIMENSIONS.map((_, idx) => {
        const pt = getPoint(idx, lvl);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ')
    );

    const axes = RUBRIC_DIMENSIONS.map((dim, idx) => {
      const outer = getPoint(idx, 10);
      const labelPos = getPoint(idx, 12.2);
      return {
        dim,
        outer,
        labelPos,
        latestVal: latest ? latest[dim.key] : 0,
        avgVal: average[dim.key],
        bestVal: personalBest ? personalBest[dim.key] : 0,
        latestPt: getPoint(idx, latest ? latest[dim.key] : 0),
        avgPt: getPoint(idx, average[dim.key]),
        bestPt: getPoint(idx, personalBest ? personalBest[dim.key] : 0),
      };
    });

    const toPoly = (pts: Array<{ x: number; y: number }>) =>
      pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    return {
      cx,
      cy,
      rings,
      axes,
      latestPoly: toPoly(axes.map((a) => a.latestPt)),
      avgPoly: toPoly(axes.map((a) => a.avgPt)),
      bestPoly: toPoly(axes.map((a) => a.bestPt)),
    };
  }, [latest, average, personalBest]);

  const focusedAxis =
    hoveredDimIdx !== null ? radarGeometry.axes[hoveredDimIdx] : radarGeometry.axes[0];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            6-Axis Rubric Web
          </h3>
          <p className="text-xs text-ink-muted">
            Latest vs average vs personal best (/10)
          </p>
        </div>

        <div className="segmented-track inline-flex items-center gap-0.5 text-[11px]">
          <button
            type="button"
            data-active={displayMode === 'web' ? 'true' : 'false'}
            onClick={() => setDisplayMode('web')}
            className="segmented-item px-2.5 py-0.5 font-medium"
          >
            Web
          </button>
          <button
            type="button"
            data-active={displayMode === 'bars' ? 'true' : 'false'}
            onClick={() => setDisplayMode('bars')}
            className="segmented-item px-2.5 py-0.5 font-medium"
          >
            Bars
          </button>
        </div>
      </div>

      {displayMode === 'web' ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle">
            <span className="font-sans font-medium text-ink-primary">
              {focusedAxis.dim.label}
            </span>
            <span className="text-ink-secondary">
              Latest <strong className="text-ink-primary">{focusedAxis.latestVal}</strong> · Avg {focusedAxis.avgVal} · Best{' '}
              <strong className="text-status-success">{focusedAxis.bestVal}</strong>
            </span>
          </div>

          <svg
            viewBox="0 0 340 280"
            className="w-full h-64 select-none overflow-visible"
            role="img"
            aria-label="6-axis rubric radar chart comparing latest, average, and personal best scores"
          >
            {radarGeometry.rings.map((pts, i) => (
              <polygon
                key={i}
                points={pts}
                fill="none"
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
            ))}

            {radarGeometry.axes.map((axis, idx) => (
              <line
                key={`axis-line-${idx}`}
                x1={radarGeometry.cx}
                y1={radarGeometry.cy}
                x2={axis.outer.x}
                y2={axis.outer.y}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
            ))}

            {personalBest && (
              <polygon
                points={radarGeometry.bestPoly}
                fill="var(--chart-secondary-soft)"
                stroke="var(--chart-secondary)"
                strokeOpacity={0.75}
                strokeWidth={1.5}
              />
            )}

            <polygon
              points={radarGeometry.avgPoly}
              fill="var(--accent-soft)"
              stroke="var(--ink-muted)"
              strokeWidth={1.4}
              strokeDasharray="4 3"
            />

            {latest && (
              <polygon
                points={radarGeometry.latestPoly}
                fill="var(--chart-primary-soft)"
                stroke="var(--chart-primary)"
                strokeWidth={2}
              />
            )}

            {radarGeometry.axes.map((axis, idx) => {
              const active = hoveredDimIdx === idx;
              return (
                <g
                  key={axis.dim.key}
                  onMouseEnter={() => setHoveredDimIdx(idx)}
                  onMouseLeave={() => setHoveredDimIdx(null)}
                  className="cursor-pointer"
                >
                  {latest && (
                    <circle
                      cx={axis.latestPt.x}
                      cy={axis.latestPt.y}
                      r={active ? 5.5 : 4}
                      fill="var(--bg-surface)"
                      stroke="var(--chart-primary)"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={axis.labelPos.x}
                    y={axis.labelPos.y + 3}
                    textAnchor="middle"
                    fill={active ? 'var(--ink-primary)' : 'var(--ink-secondary)'}
                    className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}
                  >
                    {axis.dim.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="flex items-center justify-center gap-5 text-[11px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: 'var(--chart-primary)' }}
              />
              Latest
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs border border-dashed"
                style={{ borderColor: 'var(--ink-muted)' }}
              />
              Average
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: 'var(--chart-secondary)' }}
              />
              Best
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5 pt-1">
          {RUBRIC_DIMENSIONS.map((dim) => {
            const latestVal = latest ? latest[dim.key] : 0;
            const avgVal = average[dim.key];
            return (
              <div key={dim.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink-primary font-medium">
                    {dim.label}
                  </span>
                  <span className="font-mono-tabular text-ink-secondary">
                    {latestVal}/10 <span className="text-ink-muted">· avg {avgVal}</span>
                  </span>
                </div>
                <div className="relative h-2.5 rounded-sm bg-subtle overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${Math.min(100, avgVal * 10)}%`,
                      backgroundColor: 'var(--border-default)',
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-accent rounded-sm transition-all duration-200"
                    style={{ width: `${Math.min(100, latestVal * 10)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ConsistencyGridProps {
  sessions: WritingSession[];
  referenceDateISO: string;
}

export function ConsistencyGrid({
  sessions,
  referenceDateISO,
}: ConsistencyGridProps) {
  const wordsByDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === 'Completed') {
      wordsByDate.set(s.date, (wordsByDate.get(s.date) ?? 0) + s.wordCount);
    }
  }

  const [y, m, d] = referenceDateISO.split('-').map(Number);
  const end = new Date(y, (m || 1) - 1, d || 1);
  const days: Array<{ iso: string; words: number }> = [];
  for (let i = 41; i >= 0; i -= 1) {
    const dt = new Date(end);
    dt.setDate(end.getDate() - i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    days.push({ iso, words: wordsByDate.get(iso) ?? 0 });
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            42-Day Writing Consistency
          </h3>
          <p className="text-xs text-ink-muted">
            Daily practice cadence ending {referenceDateISO}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-ink-muted">
          <span>{days.filter((day) => day.words > 0).length} active days</span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs border"
              style={{
                backgroundColor: 'var(--chart-empty)',
                borderColor: 'var(--chart-empty-border)',
              }}
            />
            0
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs"
              style={{ backgroundColor: 'var(--chart-ramp-1)' }}
            />
            &lt;180w
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs"
              style={{ backgroundColor: 'var(--chart-ramp-3)' }}
            />
            180w+
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs"
              style={{ backgroundColor: 'var(--chart-ramp-4)' }}
            />
            260w+
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="42 day writing activity grid">
        {days.map((day) => {
          let bgVar = 'var(--chart-empty)';
          let borderVar = 'var(--chart-empty-border)';
          let inkVar = 'var(--ink-muted)';
          if (day.words > 0 && day.words < 180) {
            bgVar = 'var(--chart-ramp-1)';
            borderVar = 'transparent';
            inkVar = 'var(--chart-cell-ink-low)';
          } else if (day.words >= 180 && day.words < 260) {
            bgVar = 'var(--chart-ramp-3)';
            borderVar = 'transparent';
            inkVar = 'var(--chart-cell-ink-high)';
          } else if (day.words >= 260) {
            bgVar = 'var(--chart-ramp-4)';
            borderVar = 'transparent';
            inkVar = 'var(--chart-cell-ink-high)';
          }
          return (
            <div
              key={day.iso}
              title={`${day.iso}: ${day.words} words`}
              aria-label={`${day.iso}: ${day.words} words`}
              style={{
                backgroundColor: bgVar,
                borderColor: borderVar,
                color: inkVar,
              }}
              className="h-7 rounded-sm border flex items-center justify-center text-[10px] font-mono transition-colors"
            >
              {day.iso.slice(8)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WordVolumeChart({ sessions }: { sessions: WritingSession[] }) {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);

  if (completed.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-ink-muted">
        Complete sessions to track word volume per draft.
      </div>
    );
  }

  const maxWords = Math.max(250, ...completed.map((s) => s.wordCount));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">
            Word Output per Session
          </h3>
          <p className="text-xs text-ink-muted">
            Recent drafts vs 200-word target baseline
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-ink-muted">
          Peak {Math.max(...completed.map((s) => s.wordCount))}w
        </span>
      </div>

      <div className="h-40 flex items-end gap-3 pt-4 border-b border-border-subtle">
        {completed.map((s) => {
          const pct = Math.max(10, Math.round((s.wordCount / maxWords) * 100));
          const hitGoal = s.wordCount >= 200;
          return (
            <div
              key={s.id}
              className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0"
            >
              <span className="text-[10px] font-mono-tabular text-ink-secondary">
                {s.wordCount}
              </span>
              <div
                title={`${s.date} · ${s.topicDescription}: ${s.wordCount} words`}
                className={`w-full max-w-[44px] rounded-t-md transition-all duration-200 ${
                  hitGoal ? 'bg-accent' : ''
                }`}
                style={{
                  height: `${pct}%`,
                  backgroundColor: hitGoal ? undefined : 'var(--border-default)',
                }}
              />
              <span className="text-[10px] font-mono-tabular text-ink-muted pb-1">
                {s.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
