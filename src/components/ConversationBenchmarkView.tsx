import { useState } from 'react';
import {
  BookOpen,
  Check,
  Clock,
  Copy,
  FileText,
  Gauge,
  MessageSquare,
} from 'lucide-react';
import type {
  CoachHighlightPoint,
  ConversationBenchmarkReport,
  ConversationPace,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RubricScores,
  VocabSuggestion,
} from '../types';
import { computeTotalScore } from '../utils/analytics';
import {
  CONVERSATION_BENCHMARK_PARAMETERS,
  formatConversationBenchmarkMarkdown,
} from '../utils/conversationBenchmark';

export interface ConversationBenchmarkViewData {
  scenarioTitle: string;
  partnerName: string;
  pace: ConversationPace;
  benchmark: ConversationBenchmarkReport;
  scores: RubricScores;
  cefrLevel: string;
  internationalMetrics: InternationalMetrics;
  feedbackImplemented: FeedbackImplementedStatus;
  feedbackCheck?: FeedbackImplementationDetail;
  whatImproved: string;
  whatImprovedPoints?: CoachHighlightPoint[];
  strictImprovements: string;
  pinpointedRewrites?: PinpointedRewrite[];
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  routingMeta?: EvaluationRoutingMeta;
  modelUsed?: string;
}

interface ConversationBenchmarkViewProps {
  data: ConversationBenchmarkViewData;
  savedSuccess?: boolean;
  existingVocabSet?: Set<string>;
  savedVocabKeys?: Set<string>;
  onSaveVocabItem?: (item: VocabSuggestion) => void;
}

function scoreColorClass(score: number): string {
  if (score >= 8) return 'text-status-success';
  if (score >= 6) return 'text-ink-primary';
  return 'text-status-warning';
}

function barFillClass(score: number): string {
  if (score >= 8) return 'bg-status-success';
  if (score >= 6) return 'bg-accent';
  return 'bg-status-warning';
}

export function ConversationBenchmarkView({
  data,
  savedSuccess = false,
  existingVocabSet,
  savedVocabKeys,
  onSaveVocabItem,
}: ConversationBenchmarkViewProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const { benchmark } = data;
  const timing = benchmark.timingSummary;
  const totalScore = computeTotalScore(data.scores);
  const intl = data.internationalMetrics;
  const pinpointedRewrites = data.pinpointedRewrites ?? [];
  const tierCaption =
    data.routingMeta?.tierLabel ||
    (data.modelUsed === 'offline-rubric' ? 'Offline Benchmark' : 'AI Coach');

  async function handleCopyMarkdown() {
    const md = formatConversationBenchmarkMarkdown({
      scenarioTitle: data.scenarioTitle,
      partnerName: data.partnerName,
      pace: data.pace,
      benchmark,
      totalScore,
      ieltsBand: intl.ieltsBand,
      toeflEquivalent: intl.toeflEquivalent,
      feedbackImplemented: data.feedbackImplemented,
      feedbackCheck: data.feedbackCheck,
      whatImproved: data.whatImproved,
      whatImprovedPoints: data.whatImprovedPoints,
      pinpointedRewrites,
      vocabUpgrades: data.vocabUpgrades,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      window.setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div data-testid="conversation-benchmark-view" className="space-y-5">
      {/* HERO BENCHMARK HEADER */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-mono-tabular text-ink-muted leading-snug">
              CEFR {benchmark.spokenInteractionCefr} · IELTS{' '}
              {intl.ieltsBand.toFixed(1)} · TOEFL {intl.toeflEquivalent}/30 ·{' '}
              {totalScore}/60 rubric
            </div>
            <div className="flex items-baseline gap-2.5 mt-0.5 flex-wrap">
              <div
                data-testid="conversation-benchmark-headline"
                className="text-2xl font-semibold font-mono-tabular text-ink-primary"
              >
                {benchmark.benchmarkIndex}{' '}
                <span className="text-sm font-normal text-ink-muted">/ 100</span>
              </div>
              <span
                data-testid="conversation-benchmark-tier"
                className="text-xs font-medium text-ink-secondary"
              >
                {benchmark.benchmarkTier} · Conversational Benchmark
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end text-right gap-0.5 shrink-0">
            {savedSuccess && (
              <span
                data-testid="auto-logged-indicator"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-status-success whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Logged</span>
              </span>
            )}
            <span
              data-testid="evaluation-tier-label"
              className="text-[11px] font-mono-tabular text-ink-muted whitespace-nowrap"
            >
              {tierCaption}
              {data.routingMeta?.latencyMs
                ? data.routingMeta.latencyMs < 50
                  ? ' · cached'
                  : ` · ${(data.routingMeta.latencyMs / 1000).toFixed(1)}s`
                : ''}
            </span>
          </div>
        </div>

        {/* Clean Unboxed Live Timing & Pacing Telemetry Strip */}
        <div
          data-testid="conversation-timing-strip"
          className="pt-2.5 pb-2.5 border-y border-border-subtle grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono-tabular"
        >
          <div>
            <div className="text-ink-muted">Avg Reply</div>
            <div className="text-sm font-semibold text-ink-primary mt-0.5">
              {timing.avgResponseTimeSec !== null
                ? `${timing.avgResponseTimeSec}s`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-ink-muted">Think Time</div>
            <div className="text-sm font-semibold text-ink-primary mt-0.5">
              {timing.avgThinkTimeSec !== null
                ? `${timing.avgThinkTimeSec}s`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-ink-muted">Live Cadence</div>
            <div className="text-sm font-semibold text-ink-primary mt-0.5">
              {timing.avgWpm !== null ? `${timing.avgWpm} WPM` : `${timing.avgWordsPerTurn} w/turn`}
            </div>
          </div>
          <div>
            <div className="text-ink-muted">Tempo</div>
            <div className="text-sm font-semibold text-ink-primary mt-0.5">
              {timing.tempoBand}
            </div>
          </div>
        </div>

        {/* Summary vs Detailed Benchmark Report Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div
            role="tablist"
            aria-label="Conversation benchmark view"
            className="segmented-track inline-flex items-center gap-0.5"
          >
            <button
              type="button"
              role="tab"
              data-testid="converse-tab-summary"
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
              data-testid="converse-tab-detailed"
              aria-selected={viewMode === 'detailed'}
              data-active={viewMode === 'detailed' ? 'true' : 'false'}
              onClick={() => setViewMode('detailed')}
              className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium whitespace-nowrap"
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>Detailed Benchmark</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="copy-benchmark-md-btn"
            onClick={() => void handleCopyMarkdown()}
            className="inline-link-tactile inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer"
          >
            {copiedMarkdown ? (
              <>
                <Check className="w-3 h-3 text-status-success" aria-hidden="true" />
                <span className="text-status-success">Copied Report</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" aria-hidden="true" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SUMMARY VIEW: 8-PARAMETER BREAKDOWN + TURN ARC + FIXES + VOCAB    */}
      {/* ================================================================= */}
      {viewMode === 'summary' && (
        <div className="space-y-5">
          {/* 1. 8-Parameter Weighted Benchmark */}
          <section className="space-y-2.5" aria-label="Benchmark parameters">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-ink-primary">
                8-Parameter Benchmark
              </h2>
              <span className="text-[11px] font-mono-tabular text-ink-muted">
                Weighted 100 pts
              </span>
            </div>

            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {CONVERSATION_BENCHMARK_PARAMETERS.map((meta) => {
                const score = benchmark.parameters[meta.key];
                const note = benchmark.parameterNotes[meta.key];
                return (
                  <div key={meta.key} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ink-primary truncate">
                        {meta.label}{' '}
                        <span className="font-mono-tabular text-[10px] text-ink-muted font-normal">
                          · {meta.weight}%
                        </span>
                      </span>
                      <span
                        className={`font-mono-tabular font-semibold shrink-0 ${scoreColorClass(score)}`}
                      >
                        {score} / 10
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barFillClass(score)}`}
                        style={{ width: `${score * 10}%` }}
                      />
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

          {/* 2. Turn-by-Turn In-Time Progression */}
          {benchmark.turnArc.length > 0 && (
            <section className="space-y-2" aria-label="Turn-by-turn progression">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
                  <span>In-Time Turn Arc</span>
                </h2>
                <span className="text-[11px] font-mono-tabular text-ink-muted">
                  {timing.turnCount} turns · {timing.totalUserWords}w
                </span>
              </div>

              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                {benchmark.turnArc.map((pt) => (
                  <div key={pt.turnNumber} className="py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                      <span className="text-ink-primary font-medium">
                        Turn {pt.turnNumber}
                      </span>
                      <span className="text-ink-muted">
                        {pt.wordCount}w
                        {pt.responseTimeSec !== null
                          ? ` · ${pt.responseTimeSec}s reply`
                          : ''}
                        {pt.inTimeScore !== null
                          ? ` · ${pt.inTimeScore}/10 live`
                          : ''}
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      {pt.turnNote}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. Pinpointed Grammar & Spoken Rewrite Fixes (Primary Coaching Value) */}
          {pinpointedRewrites.length > 0 && (
            <section className="space-y-2.5" aria-label="Pinpointed fixes">
              <h2 className="text-xs font-semibold text-ink-primary">
                Pinpointed Turn Fixes &amp; Spoken Rewrites
              </h2>
              <div className="space-y-3 divide-y divide-border-subtle">
                {pinpointedRewrites.map((item, idx) => (
                  <div
                    key={`pin-${idx}`}
                    className={idx > 0 ? 'pt-3 space-y-1.5' : 'space-y-1.5'}
                  >
                    {item.category && (
                      <div className="text-[10px] font-mono-tabular text-ink-muted uppercase tracking-wider">
                        {item.category}
                      </div>
                    )}
                    <p className="text-xs text-ink-muted line-through leading-relaxed">
                      &ldquo;{item.original}&rdquo;
                    </p>
                    <p className="text-xs text-ink-primary font-medium leading-relaxed">
                      &ldquo;{item.rewrite}&rdquo;
                    </p>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {item.rule}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Next-Session Priority */}
          {data.strictImprovements && (
            <section className="pt-2 border-t border-border-subtle space-y-1">
              <h2 className="text-xs font-semibold text-ink-primary">
                Next Conversation Focus
              </h2>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {data.strictImprovements}
              </p>
            </section>
          )}

          {/* 5. Vocabulary & Phrasing Upgrades (Lowest Weightage: 6%) */}
          {data.vocabUpgrades.length > 0 && (
            <section className="pt-2 border-t border-border-subtle space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
                  <span>Spoken Phrasing Upgrades</span>
                </h2>
                <span className="text-[10px] font-mono-tabular text-ink-muted">
                  Lowest weight · 6%
                </span>
              </div>

              <div className="divide-y divide-border-subtle">
                {data.vocabUpgrades.map((v, idx) => {
                  const key = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
                  const saved = Boolean(
                    existingVocabSet?.has(key) || savedVocabKeys?.has(key)
                  );
                  return (
                    <div
                      key={`v-${idx}`}
                      className="py-2 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs">
                          <span className="text-ink-muted">&ldquo;{v.used}&rdquo;</span>{' '}
                          <span className="text-ink-muted">&rarr;</span>{' '}
                          <span className="font-semibold text-ink-primary">
                            {v.betterAlternative}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-secondary leading-snug">
                          {v.explanation}
                        </p>
                      </div>
                      {onSaveVocabItem && (
                        <button
                          type="button"
                          disabled={saved}
                          onClick={() => onSaveVocabItem(v)}
                          className="text-[11px] font-medium text-ink-secondary hover:text-ink-primary disabled:text-status-success whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default"
                        >
                          {saved ? 'Saved' : '+ Bank'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* DETAILED BENCHMARK REPORT VIEW                                    */}
      {/* ================================================================= */}
      {viewMode === 'detailed' && (
        <div data-testid="conversation-detailed-report" className="space-y-5 text-xs">
          {/* Context, Tone & Pacing Verdicts */}
          <section className="space-y-2 border-b border-border-subtle pb-4">
            <h2 className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              <span>1. Context, Tone &amp; Live Pacing Diagnosis</span>
            </h2>
            <div className="space-y-1.5 text-ink-secondary leading-relaxed">
              <p>
                <span className="font-semibold text-ink-primary">Context:</span>{' '}
                {benchmark.contextVerdict}
              </p>
              <p>
                <span className="font-semibold text-ink-primary">Tone:</span>{' '}
                {benchmark.toneVerdict}
              </p>
              <p>
                <span className="font-semibold text-ink-primary">Pacing:</span>{' '}
                {benchmark.pacingVerdict}
              </p>
              {timing.fastestTurnSec !== null && timing.slowestTurnSec !== null && (
                <p className="font-mono-tabular text-[11px] text-ink-muted">
                  Response spread: fastest {timing.fastestTurnSec}s · median{' '}
                  {timing.medianResponseTimeSec}s · slowest {timing.slowestTurnSec}s ·
                  session duration {timing.totalDurationSec}s
                </p>
              )}
            </div>
          </section>

          {/* What Worked Well */}
          <section className="space-y-2 border-b border-border-subtle pb-4">
            <h2 className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              <span>2. What Worked Well Live</span>
            </h2>
            {data.whatImprovedPoints && data.whatImprovedPoints.length > 0 ? (
              <ul className="space-y-1.5 text-ink-secondary leading-relaxed">
                {data.whatImprovedPoints.map((pt, i) => (
                  <li key={`imp-${i}`}>
                    <span className="font-semibold text-ink-primary">{pt.title}:</span>{' '}
                    {pt.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-secondary leading-relaxed">{data.whatImproved}</p>
            )}
          </section>

          {/* Complete Turn-by-Turn Transcript Telemetry */}
          <section className="space-y-2 border-b border-border-subtle pb-4">
            <h2 className="text-xs font-semibold text-ink-primary">
              3. Turn-by-Turn In-Time Telemetry
            </h2>
            <div className="space-y-2.5">
              {benchmark.turnArc.map((pt) => (
                <div key={`det-turn-${pt.turnNumber}`} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 font-mono-tabular text-[11px]">
                    <span className="font-semibold text-ink-primary">
                      Turn {pt.turnNumber} · {pt.wordCount} words
                    </span>
                    <span className="text-ink-muted">
                      {pt.responseTimeSec !== null ? `${pt.responseTimeSec}s reply` : 'unmeasured'}
                      {pt.thinkTimeSec !== null ? ` · ${pt.thinkTimeSec}s think` : ''}
                      {pt.inTimeScore !== null ? ` · ${pt.inTimeScore}/10` : ''}
                    </span>
                  </div>
                  <p className="text-ink-muted italic">&ldquo;{pt.excerpt}&rdquo;</p>
                  <p className="text-ink-secondary">{pt.turnNote}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pinpointed Fixes */}
          {pinpointedRewrites.length > 0 && (
            <section className="space-y-2.5 border-b border-border-subtle pb-4">
              <h2 className="text-xs font-semibold text-ink-primary">
                4. Strict Improvements &amp; Pinpointed Rewrites
              </h2>
              <div className="space-y-3">
                {pinpointedRewrites.map((item, idx) => (
                  <div key={`det-pin-${idx}`} className="space-y-1">
                    <p className="text-ink-muted">&ldquo;{item.original}&rdquo;</p>
                    <p className="text-ink-primary font-medium">
                      Rewrite: &ldquo;{item.rewrite}&rdquo;
                    </p>
                    <p className="text-ink-secondary">Rule: {item.rule}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Vocabulary */}
          {data.vocabUpgrades.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-ink-primary">
                5. Optional Vocabulary Upgrades (Lowest Weightage · 6%)
              </h2>
              <ul className="space-y-1.5 text-ink-secondary">
                {data.vocabUpgrades.map((v, i) => (
                  <li key={`det-v-${i}`}>
                    &ldquo;{v.used}&rdquo; &rarr;{' '}
                    <span className="font-semibold text-ink-primary">
                      {v.betterAlternative}
                    </span>
                    {v.contextTag ? ` (${v.contextTag})` : ''} — {v.explanation}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
