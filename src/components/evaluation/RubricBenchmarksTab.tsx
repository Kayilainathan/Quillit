import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { EvaluationReportData } from '../EvaluationReportView';
import {
  RUBRIC_DIMENSIONS,
  computePercentage,
  computeTotalScore,
} from '../../utils/analytics';
import { formatDetailedCoachMarkdown } from '../../utils/evaluationCalibration';

interface RubricBenchmarksTabProps {
  report: EvaluationReportData;
}

function trimNoteWords(note: string | undefined, maxWords = 14): string {
  if (!note) return '';
  const words = note.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export function RubricBenchmarksTab({ report }: RubricBenchmarksTabProps) {
  const [showIntlDetails, setShowIntlDetails] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  async function handleCopyMarkdown() {
    const totalScore = computeTotalScore(report.scores);
    const md = formatDetailedCoachMarkdown({
      topic: report.topic,
      modeLabel: report.modeLabel,
      scores: report.scores,
      metricNotes: report.metricNotes,
      totalScore,
      percentage: computePercentage(totalScore),
      cefrLevel: report.cefrLevel,
      ieltsBand: report.internationalMetrics.ieltsBand,
      toeflEquivalent: report.internationalMetrics.toeflEquivalent,
      feedbackImplemented: report.feedbackImplemented,
      feedbackCheck: report.feedbackCheck,
      whatImproved: report.whatImproved,
      whatImprovedPoints: report.whatImprovedPoints,
      pinpointedRewrites: report.pinpointedRewrites,
      grammarFixes: report.grammarFixes,
      vocabUpgrades: report.vocabUpgrades,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMarkdown(true);
      window.setTimeout(() => setCopiedMarkdown(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  }

  return (
    <div data-testid="eval-tab-panel-rubric" className="space-y-4 editorial-enter">
      {/* 6 Compact Monochrome Rubric Bars */}
      <div className="space-y-3">
        {RUBRIC_DIMENSIONS.map((dim) => {
          const score = report.scores[dim.key];
          const note = trimNoteWords(report.metricNotes?.[dim.key], 14);
          return (
            <div key={dim.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink-primary">
                  {dim.label}
                </span>
                <span className="font-mono-tabular font-semibold text-ink-primary">
                  {score.toFixed(1)}
                  <span className="text-ink-muted font-normal">/10</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }}
                />
              </div>
              {note && (
                <p className="text-[11px] text-ink-muted leading-snug">
                  {note}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapsible International Calibration (CEFR / IELTS / TOEFL / Readability) */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <button
          type="button"
          data-testid="toggle-intl-benchmarks"
          aria-expanded={showIntlDetails}
          onClick={() => setShowIntlDetails((v) => !v)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-subtle/45 transition-colors cursor-pointer"
        >
          <div className="text-xs">
            <span className="font-semibold text-ink-primary">
              CEFR {report.cefrLevel}
            </span>
            <span className="font-mono-tabular text-ink-muted ml-2">
              IELTS {report.internationalMetrics.ieltsBand.toFixed(1)} · TOEFL{' '}
              {report.internationalMetrics.toeflEquivalent}/30
            </span>
          </div>
          {showIntlDetails ? (
            <ChevronUp className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
          )}
        </button>

        {showIntlDetails && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-border-subtle grid grid-cols-2 gap-2.5 text-xs drawer-reveal">
            <div>
              <div className="text-[11px] text-ink-muted">Lexical Resource</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.lexicalResource}/10
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Coherence &amp; Cohesion</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.coherenceCohesion}/10
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Register Control</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.registerControl}/10
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Grammar Accuracy</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.grammarAccuracy}/10
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Flesch Ease</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.fleschReadingEase}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">FK Grade Level</div>
              <div className="font-mono-tabular font-semibold text-ink-primary">
                {report.internationalMetrics.fkGradeLevel}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Utilities */}
      <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span className="font-mono-tabular truncate">
          {report.routingMeta?.tierLabel || report.modelUsed || 'Quillit Coach'}
        </span>
        <button
          type="button"
          onClick={() => void handleCopyMarkdown()}
          className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium"
        >
          {copiedMarkdown ? (
            <>
              <Check className="w-3 h-3 text-status-success" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" aria-hidden="true" />
              <span>Copy Report</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
