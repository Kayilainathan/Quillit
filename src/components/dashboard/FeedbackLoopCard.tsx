import { ArrowRight, CheckCircle2, History, Lock } from 'lucide-react';
import type { WritingSession } from '../../types';
import type { FeedbackAppliedSummary } from '../../utils/errorPatternAnalytics';
import type { TimeCapsuleStatus } from '../../utils/timeCapsule';

interface FeedbackLoopCardProps {
  feedback: FeedbackAppliedSummary;
  timeCapsuleStatus: TimeCapsuleStatus;
  latestTimeCapsuleSession: WritingSession | null;
  onLaunchTimeCapsule?: (originSession: WritingSession) => void;
}

export function FeedbackLoopCard({
  feedback,
  timeCapsuleStatus,
  latestTimeCapsuleSession,
  onLaunchTimeCapsule,
}: FeedbackLoopCardProps) {
  const candidate = timeCapsuleStatus.candidate;

  return (
    <section
      aria-label="Closed-loop feedback applied rate and blind time capsule"
      className="grid grid-cols-1 lg:grid-cols-12 gap-4"
    >
      {/* Closed-Loop Feedback Applied Rate */}
      <div
        data-testid="dashboard-feedback-loop"
        className="card-surface lg:col-span-6 p-4 sm:p-5 flex flex-col justify-between gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-muted">
              <CheckCircle2 className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              <span>Closed-Loop Feedback Rate</span>
            </div>
            <div className="text-sm font-medium text-ink-primary">
              {feedback.trendLabel}
            </div>
          </div>
          <div className="text-right font-mono-tabular">
            <div className="text-2xl font-semibold text-ink-primary">
              {feedback.evaluatedCount > 0 ? `${feedback.appliedRatePct}%` : '—'}
            </div>
            <div className="text-[10px] text-ink-muted">applied rate</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${feedback.appliedRatePct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-ink-muted">
            <span className="text-status-success">Yes: {feedback.yesCount}</span>
            <span>Partial: {feedback.partialCount}</span>
            <span>No: {feedback.noCount}</span>
            <span>Baseline: {feedback.baselineCount}</span>
          </div>
        </div>
      </div>

      {/* Blind Time Capsule */}
      <div
        data-testid="dashboard-time-capsule"
        className="card-surface lg:col-span-6 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="space-y-1 min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-muted">
            <History className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            <span>30-Day Blind Time Capsule</span>
          </div>
          {candidate ? (
            <>
              <div className="text-sm font-semibold text-ink-primary truncate">
                {!candidate.isFull30Day
                  ? `Early Retest Ready · "${candidate.session.topicDescription}"`
                  : `${candidate.daysOld}d Retest Ready · "${candidate.session.topicDescription}"`}
              </div>
              <div className="text-[11px] text-ink-muted font-mono-tabular">
                Sealed {candidate.session.totalScore}/60 on {candidate.session.date} · Rewrite blind to prove growth
              </div>
            </>
          ) : latestTimeCapsuleSession ? (
            <>
              <div className="text-sm font-semibold text-ink-primary">
                {latestTimeCapsuleSession.drillVerdict?.headline ||
                  'Blind Retest Logged'}
              </div>
              <div className="text-[11px] text-ink-secondary line-clamp-2">
                {latestTimeCapsuleSession.drillVerdict?.summary}
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
                <Lock className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                <span>
                  {timeCapsuleStatus.completedCount} of {timeCapsuleStatus.requiredCount} entries sealed
                </span>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                {timeCapsuleStatus.naturalMessage}
              </p>
              <div className="flex items-center gap-1.5 max-w-[180px] pt-0.5">
                {Array.from({ length: timeCapsuleStatus.requiredCount }).map(
                  (_, idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 flex-1 rounded-full ${
                        idx < timeCapsuleStatus.completedCount
                          ? 'bg-accent'
                          : 'bg-border-default'
                      }`}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {candidate && onLaunchTimeCapsule && (
          <button
            type="button"
            data-testid="dashboard-launch-time-capsule"
            onClick={() => onLaunchTimeCapsule(candidate.session)}
            className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0"
          >
            <span>Blind Retest</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
