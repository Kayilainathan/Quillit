import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Radar } from 'lucide-react';
import type {
  ErrorPatternAnalyticsResult,
  ErrorPatternWindow,
  PracticeWeaknessPayload,
} from '../../utils/errorPatternAnalytics';
import { ERROR_TAG_META } from '../../utils/errorPatternAnalytics';

interface MistakeRadarCardProps {
  analytics: ErrorPatternAnalyticsResult;
  windowFilter: ErrorPatternWindow;
  onChangeWindow: (next: ErrorPatternWindow) => void;
  onPracticeWeakness?: (payload: PracticeWeaknessPayload) => void;
}

const WINDOW_OPTIONS: Array<{ id: ErrorPatternWindow; label: string }> = [
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
  { id: 'all', label: 'All time' },
];

export function MistakeRadarCard({
  analytics,
  windowFilter,
  onChangeWindow,
  onPracticeWeakness,
}: MistakeRadarCardProps) {
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  return (
    <section
      aria-label="Recurring mistake radar"
      data-testid="dashboard-mistake-radar"
      className="card-surface p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Radar className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            <span>Recurring mistake radar</span>
          </div>
          <h2 className="font-display text-lg sm:text-xl font-medium text-ink-primary">
            What Is Holding You Back
          </h2>
          <p className="text-xs text-ink-muted">
            {analytics.sessionsAnalyzed > 0
              ? `Ranked from ${analytics.totalIssuesTracked} pinpointed edits across ${analytics.sessionsAnalyzed} evaluated ${
                  analytics.sessionsAnalyzed === 1 ? 'session' : 'sessions'
                }.`
              : 'Complete evaluated sessions to surface recurring grammar, tone, and clarity habits.'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Mistake radar time window"
          className="segmented-track inline-flex items-center gap-0.5"
        >
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={windowFilter === opt.id}
              data-active={windowFilter === opt.id ? 'true' : 'false'}
              data-testid={`mistake-window-${opt.id}`}
              onClick={() => onChangeWindow(opt.id)}
              className="segmented-item px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {analytics.topPatterns.length === 0 ? (
        <div className="py-8 px-4 rounded-md border border-dashed border-border-default text-center space-y-1">
          <div className="text-sm font-medium text-ink-primary">
            No recurring friction detected in this window
          </div>
          <p className="text-xs text-ink-muted max-w-md mx-auto">
            Try switching to &ldquo;All time&rdquo; or run a fresh evaluation in WriteStudio to map your top recurring patterns.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {analytics.topPatterns.map((item, idx) => {
            const isExpanded = expandedTag === item.errorTag;
            const meta = ERROR_TAG_META[item.errorTag];
            const trendTextClass =
              item.trend === 'Improving'
                ? 'text-status-success'
                : item.trend === 'New'
                  ? 'text-status-warning'
                  : 'text-ink-muted';

            return (
              <div
                key={item.errorTag}
                data-testid={`mistake-row-${item.errorTag}`}
                className="py-3.5 first:pt-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono-tabular text-[11px] text-ink-muted">
                        0{idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-ink-primary">
                        {item.label}
                      </span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono-tabular text-xs font-medium text-ink-secondary">
                        {item.count}×
                      </span>
                      <span className="text-ink-muted" aria-hidden="true">
                        ·
                      </span>
                      <span className={`text-xs font-medium ${trendTextClass}`}>
                        {item.trend}
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      {item.diagnosis}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid={`inspect-examples-${item.errorTag}`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedTag((curr) =>
                          curr === item.errorTag ? null : item.errorTag
                        )
                      }
                      className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                    >
                      <span>Examples ({item.examples.length})</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>

                    {onPracticeWeakness && (
                      <button
                        type="button"
                        onClick={() =>
                          onPracticeWeakness({
                            pillarKey: meta.pillar,
                            pillarLabel: item.label,
                            topic: meta.practiceTopic,
                            mode: meta.practiceMode,
                            tone: meta.practiceTone,
                            audience: meta.practiceAudience,
                            feedbackReminder: `Focus: ${item.label} — ${item.microHabit}`,
                            targetErrorTag: item.errorTag,
                          })
                        }
                        className="btn-ghost inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-ink-primary whitespace-nowrap"
                      >
                        <span>Drill</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div
                    data-testid={`mistake-examples-drawer-${item.errorTag}`}
                    className="drawer-reveal pt-2.5 mt-1 border-t border-border-subtle/70 space-y-2.5"
                  >
                    <div className="text-xs text-ink-secondary">
                      <span className="font-semibold text-ink-primary">
                        Micro-habit:{' '}
                      </span>
                      {item.microHabit}
                    </div>

                    <div className="space-y-2">
                      {item.examples.map((ex, exIdx) => (
                        <div
                          key={`${ex.sessionId}-${exIdx}`}
                          className="p-3 rounded-md border border-border-subtle bg-subtle/45 space-y-1 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-ink-muted">
                            <span className="truncate">{ex.topic}</span>
                            <span>{ex.date}</span>
                          </div>
                          <div className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
                            <span className="line-through text-ink-muted">
                              &ldquo;{ex.original}&rdquo;
                            </span>
                            <ArrowRight
                              className="w-3 h-3 text-ink-muted inline shrink-0"
                              aria-hidden="true"
                            />
                            <span className="font-medium text-ink-primary">
                              &ldquo;{ex.improved}&rdquo;
                            </span>
                          </div>
                          <div className="text-[11px] text-ink-secondary">
                            {ex.rule}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
