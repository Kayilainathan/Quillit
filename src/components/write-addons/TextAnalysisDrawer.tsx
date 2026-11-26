import React, { useMemo, useState } from 'react';
import { BookmarkPlus, Check, X } from 'lucide-react';
import type {
  ProfessionalVocabAlternative,
  TextAnalysisReport,
  TextAnalysisSuggestion,
} from '../../utils/textAnalysis';

export interface TextAnalysisDrawerProps {
  report: TextAnalysisReport;
  onClose: () => void;
  onSaveAlternativeToLibrary: (alt: ProfessionalVocabAlternative) => void;
}

type SuggestionFilter = 'all' | TextAnalysisSuggestion['category'];

const FILTER_TABS: { id: SuggestionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'tone', label: 'Tone' },
  { id: 'clarity', label: 'Clarity' },
  { id: 'eie-precision', label: 'EIE Precision' },
];

const CATEGORY_LABEL: Record<TextAnalysisSuggestion['category'], string> = {
  grammar: 'Grammar',
  tone: 'Tone',
  clarity: 'Clarity',
  'eie-precision': 'EIE Precision',
};

const PRIORITY_LABEL: Record<TextAnalysisSuggestion['priority'], string> = {
  high: 'High impact',
  medium: 'Refinement',
  low: 'Polish',
};

function scoreToneClass(score: number): string {
  if (score >= 82) return 'text-status-success';
  if (score >= 65) return 'text-ink-primary';
  return 'text-status-warning';
}

export const TextAnalysisDrawer: React.FC<TextAnalysisDrawerProps> = ({
  report,
  onClose,
  onSaveAlternativeToLibrary,
}) => {
  const [activeFilter, setActiveFilter] = useState<SuggestionFilter>('all');

  const filteredSuggestions = useMemo(() => {
    if (activeFilter === 'all') return report.suggestions;
    return report.suggestions.filter((s) => s.category === activeFilter);
  }, [activeFilter, report.suggestions]);

  const { vocabularyComparison } = report;

  return (
    <section
      data-testid="text-analysis-drawer"
      aria-label="Writing Sample Text Analysis"
      className="drawer-reveal rounded-md border border-border-default bg-surface p-4 sm:p-5 space-y-5"
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3.5">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="text-sm font-semibold text-ink-primary">
              Text Analysis &amp; EIE Vocabulary Check
            </h3>
            <span className="text-xs text-ink-muted">
              {report.gradeLabel} · {report.cefrEstimate} · {report.detectedRegister}
            </span>
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {report.toneAlignmentNote}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close text analysis"
          data-testid="close-text-analysis-btn"
          className="btn-ghost p-1.5 text-ink-muted hover:text-ink-primary shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 4-Metric Score Strip (Overall + 3 Pillars) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-md border border-border-subtle bg-subtle/40 px-3 py-2.5 space-y-0.5">
          <div className="text-[11px] text-ink-muted">Overall Score</div>
          <div className="flex items-baseline gap-1 font-mono-tabular">
            <span
              data-testid="analysis-overall-score"
              className={`text-xl font-semibold ${scoreToneClass(report.overallScore)}`}
            >
              {report.overallScore}
            </span>
            <span className="text-xs text-ink-muted">/100</span>
          </div>
          <div className="text-[11px] text-ink-secondary truncate">
            {report.wordCount} words · {report.avgWordsPerSentence}w/sent
          </div>
        </div>

        <div className="rounded-md border border-border-subtle bg-subtle/40 px-3 py-2.5 space-y-0.5">
          <div className="text-[11px] text-ink-muted">Grammar</div>
          <div className="flex items-baseline gap-1 font-mono-tabular">
            <span
              data-testid="analysis-grammar-score"
              className={`text-xl font-semibold ${scoreToneClass(report.scores.grammar)}`}
            >
              {report.scores.grammar}
            </span>
            <span className="text-xs text-ink-muted">/100</span>
          </div>
          <div className="text-[11px] text-ink-secondary truncate">
            SI units, articles &amp; syntax
          </div>
        </div>

        <div className="rounded-md border border-border-subtle bg-subtle/40 px-3 py-2.5 space-y-0.5">
          <div className="text-[11px] text-ink-muted">Tone</div>
          <div className="flex items-baseline gap-1 font-mono-tabular">
            <span
              data-testid="analysis-tone-score"
              className={`text-xl font-semibold ${scoreToneClass(report.scores.tone)}`}
            >
              {report.scores.tone}
            </span>
            <span className="text-xs text-ink-muted">/100</span>
          </div>
          <div className="text-[11px] text-ink-secondary truncate">
            {report.detectedRegister}
          </div>
        </div>

        <div className="rounded-md border border-border-subtle bg-subtle/40 px-3 py-2.5 space-y-0.5">
          <div className="text-[11px] text-ink-muted">Clarity</div>
          <div className="flex items-baseline gap-1 font-mono-tabular">
            <span
              data-testid="analysis-clarity-score"
              className={`text-xl font-semibold ${scoreToneClass(report.scores.clarity)}`}
            >
              {report.scores.clarity}
            </span>
            <span className="text-xs text-ink-muted">/100</span>
          </div>
          <div className="text-[11px] text-ink-secondary font-mono-tabular truncate">
            FK {report.fkGradeLevel} · Signal {report.signalNoiseRatio}%
          </div>
        </div>
      </div>

      {/* Specific Improvement Suggestions */}
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-semibold text-ink-primary">
              Specific Improvement Suggestions
            </h4>
            <span className="text-[11px] font-mono-tabular text-ink-muted">
              {report.suggestions.length} flagged
            </span>
          </div>

          {report.suggestions.length > 0 && (
            <div
              role="tablist"
              aria-label="Filter analysis suggestions"
              className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-subtle/60 border border-border-subtle"
            >
              {FILTER_TABS.map((tab) => {
                const count =
                  tab.id === 'all'
                    ? report.suggestions.length
                    : report.suggestions.filter((s) => s.category === tab.id).length;
                if (tab.id !== 'all' && count === 0) return null;
                const isActive = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-surface text-ink-primary shadow-xs border border-border-subtle'
                        : 'text-ink-muted hover:text-ink-primary'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {filteredSuggestions.length === 0 ? (
          <p className="text-xs text-ink-secondary py-2">
            No grammar, tone, or clarity slips flagged in this section—prose reads cleanly.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle border border-border-subtle rounded-md bg-subtle/20">
            {filteredSuggestions.map((item, idx) => (
              <li
                key={item.id}
                data-testid={`analysis-suggestion-${item.category}`}
                className="p-3 sm:p-3.5 space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[11px] font-mono-tabular text-ink-muted">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span className="text-xs font-semibold text-ink-primary">
                      {item.title}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    {CATEGORY_LABEL[item.category]} · {PRIORITY_LABEL[item.priority]}
                  </span>
                </div>

                <div className="text-xs text-ink-primary pl-5 space-y-1">
                  <p className="leading-relaxed">
                    <span className="font-mono-tabular text-status-warning">
                      &ldquo;{item.excerpt}&rdquo;
                    </span>{' '}
                    <span aria-hidden="true" className="text-ink-muted">
                      →
                    </span>{' '}
                    <span className="font-medium text-ink-primary">
                      {item.suggestion}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">
                    {item.educationalNote}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Vocabulary Library Comparison & EIE Professional Alternatives */}
      <div
        data-testid="vocab-comparison-section"
        className="space-y-3 border-t border-border-subtle pt-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold text-ink-primary">
            Vocabulary Library Comparison &amp; EIE Alternatives
          </h4>
          <span
            data-testid="vocab-library-summary"
            className="text-[11px] font-mono-tabular text-ink-muted"
          >
            {vocabularyComparison.librarySize} saved in library ·{' '}
            {vocabularyComparison.appliedFromLibrary.length} applied in draft
            {vocabularyComparison.librarySize > 0
              ? ` (${vocabularyComparison.libraryCoveragePct}% active coverage)`
              : ''}
          </span>
        </div>

        {/* Applied Saved Terms */}
        {vocabularyComparison.appliedFromLibrary.length > 0 && (
          <div className="rounded-md border border-border-subtle bg-subtle/30 px-3 py-2.5 space-y-1">
            <div className="text-[11px] font-medium text-status-success">
              Applied from your Vocabulary Library
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-primary">
              {vocabularyComparison.appliedFromLibrary.map((match) => (
                <span key={match.entryId} className="inline-flex items-baseline gap-1">
                  <strong className="font-medium">{match.headword}</strong>
                  <span className="text-[11px] text-ink-muted">
                    ({match.categoryLabel} · {match.mastered ? 'Mastered' : 'Practicing'})
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Missed Opportunities Already in User's Library */}
        {vocabularyComparison.missedLibraryOpportunities.length > 0 && (
          <div
            data-testid="missed-library-opportunities"
            className="space-y-1.5"
          >
            <div className="text-[11px] font-medium text-ink-secondary">
              Saved Library Upgrades Available in This Draft
            </div>
            <ul className="divide-y divide-border-subtle border border-border-subtle rounded-md bg-subtle/20">
              {vocabularyComparison.missedLibraryOpportunities.map((opp) => (
                <li
                  key={opp.entryId}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs text-ink-primary">
                      <span className="text-ink-muted line-through">
                        {opp.matchedUsedPhrase}
                      </span>{' '}
                      <span aria-hidden="true" className="text-ink-muted">
                        →
                      </span>{' '}
                      <strong className="font-semibold text-ink-primary">
                        {opp.libraryAlternative}
                      </strong>
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {opp.explanation}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-success whitespace-nowrap shrink-0">
                    <Check className="w-3.5 h-3.5" />
                    In your library
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Curated EIE Professional Alternatives */}
        {vocabularyComparison.professionalAlternatives.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-ink-secondary">
              Recommended EIE Professional Alternatives
            </div>
            <ul className="divide-y divide-border-subtle border border-border-subtle rounded-md bg-subtle/20">
              {vocabularyComparison.professionalAlternatives.map((alt) => (
                <li
                  key={alt.id}
                  data-testid={`pro-alt-row-${alt.id}`}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-ink-muted line-through">
                        {alt.original}
                      </span>
                      <span aria-hidden="true" className="text-ink-muted">
                        →
                      </span>
                      <strong className="font-semibold text-ink-primary">
                        {alt.professionalAlternative}
                      </strong>
                      <span className="text-[11px] text-ink-muted">
                        · {alt.registerTag}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-relaxed">
                      {alt.educationalNote}
                    </p>
                  </div>

                  {alt.alreadyInLibrary ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-success whitespace-nowrap shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      Saved in Library
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`save-alt-${alt.id}`}
                      onClick={() => onSaveAlternativeToLibrary(alt)}
                      className="btn-secondary px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 self-start sm:self-center"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      Save to Library
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          vocabularyComparison.missedLibraryOpportunities.length === 0 && (
            <p className="text-xs text-ink-secondary">
              No casual phrasing bottlenecks found—your technical wording already reads cleanly.
            </p>
          )
        )}
      </div>
    </section>
  );
};
