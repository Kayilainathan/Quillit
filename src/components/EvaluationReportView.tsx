import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import type {
  AudienceOption,
  CalqueFix,
  CoachHighlightPoint,
  DrillMeta,
  DrillType,
  DrillVerdict,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RewrittenSample,
  RubricMetricNotes,
  RubricScores,
  SessionTargetCheck,
  ToneCheck,
  UnifiedEdit,
  VocabSuggestion,
} from '../types';
import { OverviewVerdictTab } from './evaluation/OverviewVerdictTab';
import { FixesAndDiffTab } from './evaluation/FixesAndDiffTab';
import { RubricBenchmarksTab } from './evaluation/RubricBenchmarksTab';

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
  spokenReadinessScore?: number;
  signalNoiseRatio?: number;
  audienceReaction?: string;
  audience?: AudienceOption;
  calqueFixes?: CalqueFix[];
  drillType?: DrillType;
  drillMeta?: DrillMeta;
  drillVerdict?: DrillVerdict;
  revisionDelta?: number;
  edits?: UnifiedEdit[];
  toneCheck?: ToneCheck;
  nextDraftPriority?: string;
  targetCheck?: SessionTargetCheck;
}

type ReportTab = 'overview' | 'fixes' | 'rubric';

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
  onStartRevision?: () => void;
  onLocatePhrase?: (phrase: string) => void;
}

const LOADING_PHASES = [
  'Reading your draft and measuring spoken cadence...',
  'Pinpointing grammar slips, agreement, and run-on clauses...',
  'Crafting crisp rewrites and compiling your scorecard...',
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
      className="card-surface p-5 sm:p-6 space-y-4"
    >
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-ink-primary">
          <PenLine className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
          <span>Evaluating {wordCount} words · {modeLabel}</span>
        </div>
        <p className="text-xs text-ink-secondary">{LOADING_PHASES[phaseIdx]}</p>
        <div className="text-[11px] font-mono-tabular text-ink-muted">
          {estimatedTierLabel}
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
        <div className="h-2.5 w-2/3 rounded bg-subtle animate-pulse" />
        <div className="h-2.5 w-full rounded bg-subtle animate-pulse" />
        <div className="h-2.5 w-4/5 rounded bg-subtle animate-pulse" />
      </div>
    </div>
  );
}

export function EvaluationReportView({
  report,
  defaultView = 'summary',
  draftContent = '',
  savedSuccess = false,
  existingVocabSet,
  savedVocabKeys,
  onApplyTextReplacement,
  onApplyAllGrammarFixes,
  onSaveVocabItem,
  onStartRevision,
  onLocatePhrase,
}: EvaluationReportViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>(
    defaultView === 'detailed' ? 'fixes' : 'overview'
  );

  const totalFixCount =
    (report.edits?.length ?? 0) > 0
      ? (report.edits?.length ?? 0) + (report.vocabUpgrades?.length ?? 0)
      : (report.grammarFixes?.length ?? 0) +
        (report.calqueFixes?.length ?? 0) +
        (report.pinpointedRewrites?.length ?? 0) +
        (report.vocabUpgrades?.length ?? 0);

  return (
    <div data-testid="evaluation-report-v4" className="space-y-4">
      {/* 3-Tab Editorial Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
        <div
          role="tablist"
          aria-label="Evaluation report sections"
          className="segmented-track inline-flex items-center gap-0.5 w-full sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            data-active={activeTab === 'overview' ? 'true' : 'false'}
            data-testid="eval-tab-overview"
            onClick={() => setActiveTab('overview')}
            className="segmented-item flex-1 sm:flex-none px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'fixes'}
            data-active={activeTab === 'fixes' ? 'true' : 'false'}
            data-testid="eval-tab-fixes"
            onClick={() => setActiveTab('fixes')}
            className="segmented-item flex-1 sm:flex-none px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            Fixes &amp; Diff ({totalFixCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rubric'}
            data-active={activeTab === 'rubric' ? 'true' : 'false'}
            data-testid="eval-tab-rubric"
            onClick={() => setActiveTab('rubric')}
            className="segmented-item flex-1 sm:flex-none px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            Rubric
          </button>
        </div>

        {savedSuccess && (
          <span className="text-[11px] font-mono-tabular text-status-success">
            Logged to Vault
          </span>
        )}
      </div>

      {activeTab === 'overview' && (
        <OverviewVerdictTab
          report={report}
          draftContent={draftContent}
          onStartRevision={onStartRevision}
        />
      )}

      {activeTab === 'fixes' && (
        <FixesAndDiffTab
          report={report}
          draftContent={draftContent}
          existingVocabSet={existingVocabSet}
          savedVocabKeys={savedVocabKeys}
          onApplyTextReplacement={onApplyTextReplacement}
          onApplyAllGrammarFixes={onApplyAllGrammarFixes}
          onSaveVocabItem={onSaveVocabItem}
          onLocatePhrase={onLocatePhrase}
        />
      )}

      {activeTab === 'rubric' && <RubricBenchmarksTab report={report} />}
    </div>
  );
}
