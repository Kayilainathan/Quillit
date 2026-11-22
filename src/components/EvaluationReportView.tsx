import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  FileText,
  PenLine,
  Sparkles,
} from 'lucide-react';
import type {
  CoachHighlightPoint,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RewrittenSample,
  RubricMetricNotes,
  RubricScores,
  VocabSuggestion,
} from '../types';
import {
  RUBRIC_DIMENSIONS,
  computePercentage,
  computeTotalScore,
} from '../utils/analytics';
import { formatDetailedCoachMarkdown } from '../utils/evaluationCalibration';

export interface EvaluationReportData {
  topic: string;
  modeLabel: string;
  scores: RubricScores;
  metricNotes?: RubricMetricNotes;
  cefrLevel: string;
  internationalMetrics: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: FeedbackImplementedStatus;
  feedbackCheck?: FeedbackImplementationDetail;
  whatImproved: string;
  whatImprovedPoints?: CoachHighlightPoint[];
  strictImprovements: string;
  pinpointedRewrites?: PinpointedRewrite[];
  rewrittenSample?: RewrittenSample;
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  routingMeta?: EvaluationRoutingMeta;
  modelUsed?: string;
}

interface EvaluationReportViewProps {
  report: EvaluationReportData;
  defaultView?: 'summary' | 'detailed';
  draftContent?: string;
  savedSuccess?: boolean;
  existingVocabSet?: Set<string>;
  savedVocabKeys?: Set<string>;
  onApplyTextReplacement?: (original: string, replacement: string) => void;
  onApplyAllGrammarFixes?: () => void;
  onSaveVocabItem?: (item: VocabSuggestion) => void;
}

const LOADING_PHASES = [
  'Reading your draft and measuring spoken cadence...',
  'Pinpointing grammar slips, agreement, and run-on clauses...',
  'Crafting sentence rewrites and compiling your scorecard...',
];

export function EvaluationLoadingCard({
  wordCount,
  modeLabel,
  estimatedTierLabel,
}: {
  wordCount: number;
  modeLabel: string;
  estimatedTierLabel: string;
}) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhaseIdx((prev) => (prev + 1) % LOADING_PHASES.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      data-testid="evaluation-loading-card"
      role="status"
      aria-live="polite"
      className="card-surface p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-ink-primary">
            <PenLine className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
            <span>Evaluating Draft</span>
          </div>
          <p className="text-xs text-ink-muted font-mono-tabular">
            {wordCount} words · {modeLabel} · {estimatedTierLabel}
          </p>
        </div>
        <span className="text-[11px] font-mono-tabular text-ink-muted">
          Single-pass review
        </span>
      </div>

      {/* Tactile ink progress rail */}
      <div className="space-y-2.5">
        <div className="h-1 w-full rounded-full bg-border-subtle overflow-hidden">
          <div className="h-full w-2/3 rounded-full bg-accent animate-pulse" />
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          {LOADING_PHASES[phaseIdx]}
        </p>
      </div>

      {/* Subtle structural preview matching final layout to avoid layout shift */}
      <div className="space-y-3 pt-2 border-t border-border-subtle opacity-60">
        <div className="grid grid-cols-2 gap-2">
          {RUBRIC_DIMENSIONS.map((dim) => (
            <div
              key={dim.key}
              className="p-2.5 rounded-md border border-border-subtle bg-subtle/50 space-y-1.5"
            >
              <div className="text-[11px] text-ink-muted truncate">
                {dim.shortLabel}
              </div>
              <div className="h-3 w-12 rounded-sm bg-border-subtle animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="h-2.5 w-36 rounded-sm bg-border-subtle animate-pulse" />
          <div className="h-2.5 w-full rounded-sm bg-border-subtle/70 animate-pulse" />
          <div className="h-2.5 w-5/6 rounded-sm bg-border-subtle/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function canApplyInDraft(draftContent: string | undefined, original: string): boolean {
  if (!draftContent || !original) return false;
  return draftContent.includes(original);
}

export function EvaluationReportView({
  report,
  defaultView = 'summary',
  draftContent,
  savedSuccess = false,
  existingVocabSet,
  savedVocabKeys,
  onApplyTextReplacement,
  onApplyAllGrammarFixes,
  onSaveVocabItem,
}: EvaluationReportViewProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>(defaultView);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const totalScore = computeTotalScore(report.scores);
  const percentage = computePercentage(totalScore);
  const intl = report.internationalMetrics;

  const pinpointedRewrites: PinpointedRewrite[] =
    report.pinpointedRewrites && report.pinpointedRewrites.length > 0
      ? report.pinpointedRewrites
      : report.rewrittenSample
        ? [
            {
              original: report.rewrittenSample.original,
              rewrite: report.rewrittenSample.improved,
              rule: report.rewrittenSample.why,
              category: 'Sentence Flow & Clarity',
            },
          ]
        : [];

  // Surgical grammar fixes that are not exact duplicates of a pinpointed rewrite
  const pinpointedOriginalSet = new Set(
    pinpointedRewrites.map((p) => p.original.trim().toLowerCase())
  );
  const surgicalGrammarFixes = report.grammarFixes.filter(
    (g) => !pinpointedOriginalSet.has(g.original.trim().toLowerCase())
  );

  const hasAnyGrammarOrRewrite =
    pinpointedRewrites.length > 0 || surgicalGrammarFixes.length > 0;

  const feedbackStatus =
    report.feedbackCheck?.status ?? report.feedbackImplemented ?? 'Baseline';

  const tierCaption =
    report.routingMeta?.tierLabel ||
    (report.modelUsed === 'offline-rubric'
      ? 'Offline Rubric'
      : 'AI Coach');

  async function handleCopyDetailedMarkdown() {
    const md = formatDetailedCoachMarkdown({
      topic: report.topic,
      modeLabel: report.modeLabel,
      scores: report.scores,
      metricNotes: report.metricNotes,
      totalScore,
      percentage,
      cefrLevel: report.cefrLevel,
      ieltsBand: intl.ieltsBand,
      toeflEquivalent: intl.toeflEquivalent,
      feedbackImplemented: report.feedbackImplemented,
      feedbackCheck: report.feedbackCheck,
      whatImproved: report.whatImproved,
      whatImprovedPoints: report.whatImprovedPoints,
      pinpointedRewrites,
      grammarFixes: report.grammarFixes,
      vocabUpgrades: report.vocabUpgrades,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      window.setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Scorecard Header + Summary / Detailed Toggle */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-muted font-mono-tabular">
              CEFR {report.cefrLevel} · IELTS {intl.ieltsBand.toFixed(1)} · TOEFL{' '}
              {intl.toeflEquivalent}/30
            </div>
            <div
              data-testid="evaluation-score-headline"
              className="text-2xl font-semibold font-mono-tabular text-ink-primary mt-0.5"
            >
              {totalScore} / 60{' '}
              <span className="text-sm font-medium text-ink-secondary">
                ({percentage.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            {savedSuccess && (
              <span
                data-testid="auto-logged-indicator"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-status-success"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Logged to journal</span>
              </span>
            )}
            <span
              data-testid="evaluation-tier-label"
              className="text-[11px] font-mono-tabular text-ink-muted"
            >
              {tierCaption}
              {report.routingMeta?.latencyMs
                ? ` · ${(report.routingMeta.latencyMs / 1000).toFixed(1)}s`
                : ''}
            </span>
          </div>
        </div>

        {/* Clean Segmented Mode Switcher: Summary vs Detailed Coach Report */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div
            role="tablist"
            aria-label="Evaluation report view"
            className="segmented-track inline-flex items-center gap-0.5"
          >
            <button
              type="button"
              role="tab"
              data-testid="eval-tab-summary"
              aria-selected={viewMode === 'summary'}
              data-active={viewMode === 'summary' ? 'true' : 'false'}
              onClick={() => setViewMode('summary')}
              className="segmented-item px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            >
              Summary
            </button>
            <button
              type="button"
              role="tab"
              data-testid="eval-tab-detailed"
              aria-selected={viewMode === 'detailed'}
              data-active={viewMode === 'detailed' ? 'true' : 'false'}
              onClick={() => setViewMode('detailed')}
              className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>Detailed Report</span>
            </button>
          </div>

          {viewMode === 'detailed' && (
            <button
              type="button"
              data-testid="copy-detailed-report-button"
              onClick={() => void handleCopyDetailedMarkdown()}
              className="inline-link-tactile inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="w-3 h-3 text-status-success" aria-hidden="true" />
                  <span className="text-status-success">Copied Markdown</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" aria-hidden="true" />
                  <span>Copy Report</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* VIEW 1: COMPACT PRIORITY SUMMARY (Scores -> Grammar/Rewrites -> Vocab) */}
      {/* ================================================================= */}
      {viewMode === 'summary' && (
        <div data-testid="evaluation-summary-view" className="space-y-5">
          {/* 1. SCORECARD (Highest Priority) */}
          <section aria-label="Rubric scorecard" className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <h3 className="font-semibold text-ink-primary">1. Scorecard</h3>
              <span className="font-mono-tabular text-[11px] text-ink-muted">
                Feedback check: {feedbackStatus}
              </span>
            </div>

            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {RUBRIC_DIMENSIONS.map((dim) => {
                const score = report.scores[dim.key];
                const note = report.metricNotes?.[dim.key];
                return (
                  <div key={dim.key} className="py-2.5 space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-ink-primary">
                        {dim.label}
                      </span>
                      <span className="text-xs font-semibold font-mono-tabular text-ink-primary shrink-0">
                        {score} / 10
                      </span>
                    </div>
                    {note && (
                      <p className="text-[11px] text-ink-secondary leading-relaxed">
                        {note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. PINPOINTED GRAMMAR FLAWS & SUGGESTED SENTENCE VARIATIONS / CORRECTIONS */}
          <section
            aria-label="Grammar flaws and sentence improvements"
            data-testid="summary-grammar-section"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-ink-primary">
                  2. Grammar Flaws &amp; Suggested Sentence Improvements
                </h3>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Exact lines pinpointed with cleaner spoken rewrites and rules
                </p>
              </div>
              {onApplyAllGrammarFixes && report.grammarFixes.length > 0 && (
                <button
                  type="button"
                  onClick={onApplyAllGrammarFixes}
                  className="inline-link-tactile text-[11px] font-medium whitespace-nowrap cursor-pointer shrink-0"
                >
                  Apply All Fixes
                </button>
              )}
            </div>

            {!hasAnyGrammarOrRewrite ? (
              <div className="py-2 text-xs text-ink-secondary leading-relaxed">
                Clean mechanics in this draft.{' '}
                {report.strictImprovements ? report.strictImprovements : ''}
              </div>
            ) : (
              <div className="space-y-3">
                {pinpointedRewrites.map((item, idx) => {
                  const applicable =
                    Boolean(onApplyTextReplacement) &&
                    canApplyInDraft(draftContent, item.original);
                  return (
                    <div
                      key={`rw-${idx}`}
                      className="p-3 rounded-md bg-subtle border border-border-subtle space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-ink-muted leading-relaxed">
                          &ldquo;{item.original}&rdquo;
                        </p>
                        {applicable && onApplyTextReplacement && (
                          <button
                            type="button"
                            onClick={() =>
                              onApplyTextReplacement(item.original, item.rewrite)
                            }
                            className="inline-link-tactile text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Apply Rewrite
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-ink-primary leading-relaxed">
                        <span className="font-semibold text-status-success">
                          Rewrite:{' '}
                        </span>
                        &ldquo;{item.rewrite}&rdquo;
                      </p>
                      <p className="text-[11px] text-ink-secondary leading-relaxed">
                        <span className="font-semibold text-ink-primary">
                          Rule:{' '}
                        </span>
                        {item.rule}
                      </p>
                    </div>
                  );
                })}

                {surgicalGrammarFixes.length > 0 && (
                  <div className="space-y-1.5">
                    {surgicalGrammarFixes.map((fix, idx) => {
                      const applicable =
                        Boolean(onApplyTextReplacement) &&
                        canApplyInDraft(draftContent, fix.original);
                      return (
                        <div
                          key={`gf-${idx}`}
                          className="p-2.5 rounded-md bg-subtle/70 border border-border-subtle text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="leading-snug">
                              <span className="line-through text-ink-muted">
                                {fix.original}
                              </span>{' '}
                              →{' '}
                              <span className="font-semibold text-status-success">
                                {fix.corrected}
                              </span>
                            </span>
                            {applicable && onApplyTextReplacement && (
                              <button
                                type="button"
                                onClick={() =>
                                  onApplyTextReplacement(
                                    fix.original,
                                    fix.corrected
                                  )
                                }
                                className="inline-link-tactile text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Apply Fix
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-muted leading-relaxed">
                            {fix.rule}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. ALTERNATIVE VOCABULARY SUGGESTIONS (Explicitly Lowest Weightage) */}
          {report.vocabUpgrades.length > 0 && (
            <section
              aria-label="Alternative vocabulary suggestions"
              data-testid="summary-vocab-section"
              className="space-y-2 pt-3 border-t border-border-subtle"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-medium text-ink-secondary inline-flex items-center gap-1.5">
                  <BookOpen
                    className="w-3.5 h-3.5 text-ink-muted"
                    aria-hidden="true"
                  />
                  <span>3. Alternative Vocabulary</span>
                </h3>
                <span className="text-[11px] text-ink-muted">
                  Optional polish · lowest weightage
                </span>
              </div>

              <div className="divide-y divide-border-subtle">
                {report.vocabUpgrades.map((v, idx) => {
                  const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
                  const alreadySaved =
                    Boolean(existingVocabSet?.has(key)) ||
                    Boolean(savedVocabKeys?.has(key));
                  return (
                    <div key={`v-${idx}`} className="py-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="leading-snug">
                          <span className="text-ink-muted">
                            &ldquo;{v.used}&rdquo;
                          </span>{' '}
                          →{' '}
                          <span className="font-medium text-ink-primary">
                            {v.betterAlternative}
                          </span>
                          {v.contextTag && (
                            <span className="text-[11px] text-ink-muted">
                              {' '}
                              · {v.contextTag}
                            </span>
                          )}
                        </span>
                        {onSaveVocabItem && (
                          <button
                            type="button"
                            disabled={alreadySaved}
                            onClick={() => onSaveVocabItem(v)}
                            className="inline-link-tactile text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {alreadySaved ? 'In Library' : 'Save Word'}
                          </button>
                        )}
                      </div>
                      {v.explanation && (
                        <p className="text-[11px] text-ink-muted">
                          {v.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Subtle CTA to open full structured detailed critique */}
          <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-2 text-[11px]">
            <span className="text-ink-muted">
              Want the full breakdown with Feedback Check &amp; What Improved?
            </span>
            <button
              type="button"
              onClick={() => setViewMode('detailed')}
              className="inline-link-tactile font-medium whitespace-nowrap cursor-pointer"
            >
              Open Detailed Report
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* VIEW 2: DETAILED COACH REPORT (Exact Gemini H2 Reference Format)  */}
      {/* ================================================================= */}
      {viewMode === 'detailed' && (
        <div
          data-testid="evaluation-detailed-view"
          className="space-y-6 text-xs leading-relaxed"
        >
          {/* Full Scorecard Table: Metric | Score | Notes */}
          <section aria-label="Detailed scorecard table" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-medium text-ink-primary">
                Scorecard: {totalScore} / 60 ({percentage.toFixed(1)}%)
              </h3>
              <span className="text-[11px] font-mono-tabular text-ink-muted">
                {report.modeLabel}
              </span>
            </div>

            <div className="overflow-x-auto border border-border-subtle rounded-md">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle bg-subtle text-[11px] text-ink-muted">
                    <th className="py-2 px-3 font-medium">Metric</th>
                    <th className="py-2 px-2.5 font-medium text-right whitespace-nowrap">
                      Score
                    </th>
                    <th className="py-2 px-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle align-top">
                  {RUBRIC_DIMENSIONS.map((dim) => (
                    <tr key={dim.key}>
                      <td className="py-2.5 px-3 font-medium text-ink-primary whitespace-nowrap">
                        {dim.label}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-ink-primary whitespace-nowrap">
                        {report.scores[dim.key]} / 10
                      </td>
                      <td className="py-2.5 px-3 text-ink-secondary">
                        {report.metricNotes?.[dim.key] ||
                          (dim.key === 'toneEngagement'
                            ? report.toneVerdict
                            : dim.key === 'naturalVoiceFlow'
                              ? report.flowVerdict
                              : 'Evaluated against target register.')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 1. Feedback Implementation Check */}
          <section
            aria-label="Feedback implementation check"
            className="space-y-2 pt-3 border-t border-border-subtle"
          >
            <h3 className="font-display text-sm font-medium text-ink-primary">
              1. Feedback Implementation Check: {feedbackStatus}
            </h3>
            <div className="space-y-1.5 text-ink-secondary">
              <p>
                <span className="font-semibold text-ink-primary">
                  Implemented:{' '}
                </span>
                {report.feedbackCheck?.implemented || report.whatImproved}
              </p>
              <p>
                <span className="font-semibold text-ink-primary">
                  Missed:{' '}
                </span>
                {report.feedbackCheck?.missed || report.strictImprovements}
              </p>
            </div>
          </section>

          {/* 2. What Changed for the Better */}
          <section
            aria-label="What changed for the better"
            className="space-y-2 pt-3 border-t border-border-subtle"
          >
            <h3 className="font-display text-sm font-medium text-ink-primary">
              2. What Changed for the Better
            </h3>
            {report.whatImprovedPoints && report.whatImprovedPoints.length > 0 ? (
              <ul className="space-y-2 text-ink-secondary">
                {report.whatImprovedPoints.map((pt, idx) => (
                  <li key={idx}>
                    <span className="font-semibold text-ink-primary">
                      {pt.title}:{' '}
                    </span>
                    {pt.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-secondary">{report.whatImproved}</p>
            )}
          </section>

          {/* 3. Strict Improvements & Pinpointed Fixes */}
          <section
            aria-label="Strict improvements and pinpointed fixes"
            className="space-y-3 pt-3 border-t border-border-subtle"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-medium text-ink-primary">
                3. Strict Improvements &amp; Pinpointed Fixes
              </h3>
              {onApplyAllGrammarFixes && report.grammarFixes.length > 0 && (
                <button
                  type="button"
                  onClick={onApplyAllGrammarFixes}
                  className="inline-link-tactile text-[11px] font-medium whitespace-nowrap cursor-pointer"
                >
                  Apply All Fixes
                </button>
              )}
            </div>

            {pinpointedRewrites.length > 0 ? (
              <div className="space-y-3.5">
                {pinpointedRewrites.map((item, idx) => {
                  const applicable =
                    Boolean(onApplyTextReplacement) &&
                    canApplyInDraft(draftContent, item.original);
                  return (
                    <div
                      key={`det-rw-${idx}`}
                      className="p-3.5 rounded-md bg-subtle border border-border-subtle space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-ink-primary font-medium">
                          &ldquo;{item.original}&rdquo;
                        </p>
                        {applicable && onApplyTextReplacement && (
                          <button
                            type="button"
                            onClick={() =>
                              onApplyTextReplacement(item.original, item.rewrite)
                            }
                            className="inline-link-tactile text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Apply Rewrite
                          </button>
                        )}
                      </div>
                      <p className="text-ink-primary">
                        <span className="font-semibold text-status-success">
                          Rewrite:{' '}
                        </span>
                        &ldquo;{item.rewrite}&rdquo;
                      </p>
                      <p className="text-ink-secondary">
                        <span className="font-semibold text-ink-primary">
                          Rule:{' '}
                        </span>
                        {item.rule}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-ink-secondary">{report.strictImprovements}</p>
            )}

            {surgicalGrammarFixes.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-ink-muted">
                  Quick Inline Corrections
                </div>
                {surgicalGrammarFixes.map((fix, idx) => {
                  const applicable =
                    Boolean(onApplyTextReplacement) &&
                    canApplyInDraft(draftContent, fix.original);
                  return (
                    <div
                      key={`det-gf-${idx}`}
                      className="p-2.5 rounded-md bg-subtle/60 border border-border-subtle space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          <span className="line-through text-ink-muted">
                            {fix.original}
                          </span>{' '}
                          →{' '}
                          <span className="font-semibold text-status-success">
                            {fix.corrected}
                          </span>
                        </span>
                        {applicable && onApplyTextReplacement && (
                          <button
                            type="button"
                            onClick={() =>
                              onApplyTextReplacement(fix.original, fix.corrected)
                            }
                            className="inline-link-tactile text-[11px] font-medium whitespace-nowrap cursor-pointer"
                          >
                            Apply Fix
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-muted">{fix.rule}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Vocabulary & Phrasing Upgrades (Lowest Weightage) */}
          {report.vocabUpgrades.length > 0 && (
            <section
              aria-label="Vocabulary and phrasing upgrades"
              className="space-y-2 pt-3 border-t border-border-subtle"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-medium text-ink-primary">
                  4. Vocabulary &amp; Phrasing Upgrades
                </h3>
                <span className="text-[11px] text-ink-muted">
                  Lowest rubric weightage
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Natural alternatives logged to your Vocabulary &amp; Expression Bank (To Practice):
              </p>
              <ul className="space-y-2">
                {report.vocabUpgrades.map((v, idx) => {
                  const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
                  const alreadySaved =
                    Boolean(existingVocabSet?.has(key)) ||
                    Boolean(savedVocabKeys?.has(key));
                  return (
                    <li
                      key={`det-v-${idx}`}
                      className="flex items-start justify-between gap-2 py-1.5 border-b border-border-subtle last:border-b-0"
                    >
                      <div>
                        <span className="text-ink-muted">
                          &ldquo;{v.used}&rdquo;
                        </span>{' '}
                        →{' '}
                        <span className="font-semibold text-ink-primary">
                          {v.betterAlternative}
                        </span>
                        {v.contextTag && (
                          <span className="text-ink-muted">
                            {' '}
                            ({v.contextTag})
                          </span>
                        )}
                      </div>
                      {onSaveVocabItem && (
                        <button
                          type="button"
                          disabled={alreadySaved}
                          onClick={() => onSaveVocabItem(v)}
                          className="inline-link-tactile text-[11px] font-medium disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {alreadySaved ? 'In Library' : 'Save Word'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Quiet Routing & Benchmark Reference Footer */}
          <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-ink-muted">
            <span>
              Lexical {intl.lexicalResource}/10 · Cohesion{' '}
              {intl.coherenceCohesion}/10 · Task {intl.taskAchievement}/10 ·
              Register {intl.registerControl}/10
            </span>
            {report.routingMeta && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>{report.routingMeta.tierLabel}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
