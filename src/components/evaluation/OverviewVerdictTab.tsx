import { ArrowRight, CheckCircle2, History, RotateCw, Target } from 'lucide-react';
import type { EvaluationReportData } from '../EvaluationReportView';
import { computePercentage, computeTotalScore } from '../../utils/analytics';
import { computeProseDiagnostics } from '../../utils/proseDiagnostics';
import { deriveEieEvaluationMetrics } from '../../utils/eieMetrics';

interface OverviewVerdictTabProps {
  report: EvaluationReportData;
  draftContent?: string;
  onStartRevision?: () => void;
}

export function OverviewVerdictTab({
  report,
  draftContent = '',
  onStartRevision,
}: OverviewVerdictTabProps) {
  const totalScore = computeTotalScore(report.scores);
  const pct = computePercentage(totalScore);
  const localProse = draftContent.trim()
    ? computeProseDiagnostics(draftContent)
    : null;

  const spokenReadiness =
    typeof report.spokenReadinessScore === 'number'
      ? report.spokenReadinessScore
      : localProse?.baselineSpokenReadiness ?? Math.round(pct);

  const signalNoise =
    typeof report.signalNoiseRatio === 'number'
      ? report.signalNoiseRatio
      : localProse?.signalNoiseRatio ?? Math.round(pct);

  const eieMetrics = deriveEieEvaluationMetrics({
    scores: report.scores,
    content: draftContent,
    modeLabel: report.modeLabel,
    spokenReadinessScore: spokenReadiness,
    signalNoiseRatio: signalNoise,
    internationalMetrics: report.internationalMetrics,
  });

  const audienceReaction =
    report.toneCheck?.audienceReaction || report.audienceReaction || report.toneVerdict;
  const toneMatch = report.toneCheck?.match;
  const toneFix = report.toneCheck?.toneFix;
  const nextPriority =
    report.nextDraftPriority?.trim() || report.strictImprovements?.trim() || '';

  return (
    <div data-testid="eval-tab-panel-overview" className="space-y-4 editorial-enter">
      {/* Score Headline + Spoken Readiness + Revision Delta */}
      <div className="p-4 rounded-lg border border-border-subtle bg-subtle/45 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">
              Evaluation Verdict · {report.modeLabel}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold font-mono-tabular text-ink-primary">
                {totalScore}
              </span>
              <span className="text-sm font-mono-tabular text-ink-muted">/60</span>
              <span className="text-xs font-mono-tabular text-status-success font-medium">
                {pct.toFixed(0)}% · CEFR {report.cefrLevel}
              </span>
              {typeof report.revisionDelta === 'number' && (
                <span
                  className={`text-xs font-mono-tabular font-semibold ${
                    report.revisionDelta >= 0
                      ? 'text-status-success'
                      : 'text-status-danger'
                  }`}
                >
                  ({report.revisionDelta >= 0 ? '+' : ''}
                  {report.revisionDelta} rev)
                </span>
              )}
            </div>
          </div>

          {onStartRevision && (
            <button
              type="button"
              data-testid="report-start-revision"
              onClick={onStartRevision}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Revise &amp; Re-Score</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-border-subtle/80 text-xs">
          <div>
            <span className="text-ink-muted">Spoken Readiness</span>
            <div className="font-mono-tabular text-base font-semibold text-ink-primary">
              {spokenReadiness}%
            </div>
          </div>
          <div>
            <span className="text-ink-muted">Signal-to-Noise</span>
            <div className="font-mono-tabular text-base font-semibold text-ink-primary">
              {signalNoise}%
            </div>
          </div>
        </div>
      </div>

      {/* EIE 6th-Semester Engineering Readiness Scorecard */}
      <div
        data-testid="eie-readiness-scorecard"
        className="p-4 rounded-lg border border-border-subtle bg-elevated space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-muted">
            EIE 6th-Sem Readiness
          </span>
          <span className="text-xs font-semibold text-ink-primary">
            {eieMetrics.readinessBand}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Panel Ready', value: eieMetrics.placementPanelScore },
            { label: 'Tech Clarity', value: eieMetrics.technicalClarityScore },
            { label: 'IEEE Polish', value: eieMetrics.ieeeDocPolishScore },
          ].map((item) => (
            <div
              key={item.label}
              className="p-2.5 rounded-md border border-border-subtle bg-subtle/40 space-y-1"
            >
              <div className="text-[11px] text-ink-muted truncate">
                {item.label}
              </div>
              <div className="font-mono-tabular text-base font-semibold text-ink-primary">
                {item.value}%
              </div>
              <div className="h-1 rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          <span className="font-medium text-ink-primary">Next EIE lever: </span>
          {eieMetrics.focusLever}
        </p>
      </div>

      {/* Target Audience Gut-Reaction & Tone Match */}
      {audienceReaction && (
        <div className="p-3.5 rounded-lg border border-border-subtle space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-ink-muted">
            <span>
              Audience Reaction{report.audience ? ` · ${report.audience}` : ''}
            </span>
            {toneMatch && (
              <span
                className={`font-medium normal-case ${
                  toneMatch === 'On Target'
                    ? 'text-status-success'
                    : toneMatch === 'Slightly Off'
                      ? 'text-status-warning'
                      : 'text-status-danger'
                }`}
              >
                {toneMatch}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-ink-primary leading-relaxed italic">
            &ldquo;{audienceReaction}&rdquo;
          </p>
          {toneFix && toneMatch && toneMatch !== 'On Target' && (
            <p className="text-xs text-ink-secondary">
              <span className="font-medium text-ink-primary">Tone adjustment: </span>
              {toneFix}
            </p>
          )}
        </div>
      )}

      {/* Drill Verdict (4/3/2, Skeleton, 3 Rooms, Time Capsule) */}
      {report.drillVerdict && (
        <div
          data-testid="drill-verdict-card"
          className="p-3.5 rounded-lg border border-border-default bg-subtle/40 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-muted">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Drill Verdict</span>
            </span>
            {report.drillVerdict.badge && (
              <span className="font-mono-tabular text-[11px] font-semibold text-ink-primary">
                {report.drillVerdict.badge}
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm font-semibold text-ink-primary">
            {report.drillVerdict.headline}
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {report.drillVerdict.summary}
          </p>
        </div>
      )}

      {/* Strengths & Closed-Loop Feedback Check */}
      <div className="space-y-2.5 text-xs">
        {report.whatImprovedPoints && report.whatImprovedPoints.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">
              What Landed Well
            </div>
            <ul className="space-y-1.5">
              {report.whatImprovedPoints.slice(0, 3).map((pt, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-ink-secondary leading-relaxed"
                >
                  <CheckCircle2
                    className="w-3.5 h-3.5 mt-0.5 text-status-success shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-ink-primary font-medium">
                      {pt.title}:{' '}
                    </strong>
                    {pt.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : report.whatImproved ? (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">
              What Landed Well
            </div>
            <p className="text-ink-secondary leading-relaxed">
              {report.whatImproved}
            </p>
          </div>
        ) : null}

        {report.feedbackImplemented !== 'Baseline' && (
          <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-2 text-[11px]">
            <span className="text-ink-muted">Previous Feedback Applied</span>
            <span className="font-semibold text-ink-primary">
              {report.feedbackImplemented}
              {report.feedbackCheck?.implemented
                ? ` — ${report.feedbackCheck.implemented}`
                : ''}
            </span>
          </div>
        )}
      </div>

      {/* Prominent Bordered Next-Draft Priority Callout */}
      {nextPriority && (
        <div
          data-testid="next-draft-priority-callout"
          className="p-3.5 rounded-lg border-l-2 border-l-ink-primary border border-border-default bg-subtle/50 space-y-1"
        >
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-ink-primary">
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Next-Draft Priority</span>
          </div>
          <p className="text-xs sm:text-sm text-ink-primary leading-relaxed">
            {nextPriority}
          </p>
          {report.flowVerdict && (
            <p className="text-[11px] text-ink-muted inline-flex items-center gap-1 pt-0.5">
              <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{report.flowVerdict}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
