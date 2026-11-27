import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type {
  PracticeWeaknessPayload,
  SkillPillarKey,
  SkillPillarPlaybook,
} from '../../utils/errorPatternAnalytics';

interface SkillPillarGridProps {
  pillars: SkillPillarPlaybook[];
  onPracticeWeakness: (payload: PracticeWeaknessPayload) => void;
}

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <span className="text-[10px] font-mono-tabular text-ink-muted">
        —
      </span>
    );
  }
  const w = 54;
  const h = 18;
  const min = Math.min(...points, 4);
  const max = Math.max(...points, 10);
  const span = Math.max(1, max - min);
  const coords = points
    .map((val, idx) => {
      const x = (idx / (points.length - 1)) * (w - 4) + 2;
      const y = h - 2 - ((val - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <polyline
        fill="none"
        stroke="var(--ink-primary)"
        strokeOpacity="0.65"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

export function SkillPillarGrid({
  pillars,
  onPracticeWeakness,
}: SkillPillarGridProps) {
  // Default select lowest-scoring pillar so the "How to Improvise" playbook is immediately actionable
  const lowestKey =
    [...pillars].sort((a, b) => a.avgScore - b.avgScore)[0]?.key ?? 'grammar';
  const [selectedKey, setSelectedKey] = useState<SkillPillarKey>(lowestKey);

  const activePillar =
    pillars.find((p) => p.key === selectedKey) ?? pillars[0] ?? null;

  return (
    <section
      aria-label="Writing skill pillars and improvisation playbook"
      data-testid="dashboard-skill-pillars"
      className="card-surface p-4 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            6 Skill Pillars
          </div>
          <h2 className="font-display text-lg sm:text-xl font-medium text-ink-primary mt-0.5">
            Where to Level Up &amp; How to Improvise
          </h2>
        </div>
        <span className="text-xs text-ink-muted">
          Select any pillar to open its focused micro-habit &amp; 1-click drill
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pillars.map((pillar) => {
          const isSelected = activePillar?.key === pillar.key;
          const pct = Math.min(100, Math.max(0, pillar.avgScore * 10));
          return (
            <button
              key={pillar.key}
              type="button"
              data-testid={`skill-pillar-${pillar.key}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedKey(pillar.key)}
              className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer space-y-2.5 ${
                isSelected
                  ? 'border-ink-primary bg-subtle/80'
                  : 'border-border-subtle bg-elevated hover:border-border-strong'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-primary">
                  {pillar.label}
                </span>
                <MiniSparkline points={pillar.sparkline} />
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <div className="font-mono-tabular text-xl font-semibold text-ink-primary">
                  {pillar.avgScore > 0 ? pillar.avgScore.toFixed(1) : '—'}
                  <span className="text-xs font-normal text-ink-muted">/10</span>
                </div>
                {pillar.delta30d !== null ? (
                  <span
                    className={`font-mono-tabular text-[11px] font-medium ${
                      pillar.delta30d >= 0
                        ? 'text-status-success'
                        : 'text-status-danger'
                    }`}
                  >
                    {pillar.delta30d >= 0 ? '+' : ''}
                    {pillar.delta30d.toFixed(1)} (30d)
                  </span>
                ) : (
                  <span className="font-mono-tabular text-[11px] text-ink-muted">
                    Baseline
                  </span>
                )}
              </div>

              <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {activePillar && (
        <div
          data-testid="skill-pillar-playbook"
          className="drawer-reveal p-4 sm:p-5 rounded-lg border border-border-default bg-subtle/45 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-muted">
              <Sparkles className="w-3.5 h-3.5 text-ink-primary" aria-hidden="true" />
              <span>How to Improvise · {activePillar.label} Playbook</span>
            </div>
            <p className="text-xs sm:text-sm text-ink-primary leading-relaxed">
              <span className="font-semibold">Weakest Pattern: </span>
              {activePillar.weakestRule}
            </p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              <span className="font-semibold text-ink-primary">
                Concrete Micro-Habit:{' '}
              </span>
              {activePillar.microHabit}
            </p>
          </div>

          <button
            type="button"
            data-testid="practice-this-weakness-cta"
            onClick={() => onPracticeWeakness(activePillar.practicePayload)}
            className="btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap shrink-0"
          >
            <span>Practice This Weakness</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
