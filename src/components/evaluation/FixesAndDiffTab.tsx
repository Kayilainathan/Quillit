import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Eye, Sparkles } from 'lucide-react';
import type { EvaluationReportData } from '../EvaluationReportView';
import type { VocabSuggestion } from '../../types';
import { ERROR_TAG_META } from '../../utils/errorPatternAnalytics';

type FixFilter = 'all' | 'grammar' | 'tone-flow' | 'calque' | 'vocab';

interface NormalizedFixItem {
  id: string;
  filterBucket: Exclude<FixFilter, 'all'>;
  tagLabel: string;
  original: string;
  improved: string;
  rule: string;
  vocabItem?: VocabSuggestion;
}

interface FixesAndDiffTabProps {
  report: EvaluationReportData;
  draftContent?: string;
  existingVocabSet?: Set<string>;
  savedVocabKeys?: Set<string>;
  onApplyTextReplacement?: (original: string, replacement: string) => void;
  onApplyAllGrammarFixes?: () => void;
  onSaveVocabItem?: (item: VocabSuggestion) => void;
  onLocatePhrase?: (phrase: string) => void;
}

function buildHighlightedParts(
  text: string,
  phrase: string | null
): Array<{ text: string; highlight: boolean }> {
  if (!text) return [];
  const needle = (phrase || '').trim();
  if (!needle) return [{ text, highlight: false }];
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return [{ text, highlight: false }];
  return [
    { text: text.slice(0, idx), highlight: false },
    { text: text.slice(idx, idx + needle.length), highlight: true },
    { text: text.slice(idx + needle.length), highlight: false },
  ].filter((p) => p.text.length > 0);
}

export function FixesAndDiffTab({
  report,
  draftContent = '',
  existingVocabSet,
  savedVocabKeys,
  onApplyTextReplacement,
  onApplyAllGrammarFixes,
  onSaveVocabItem,
  onLocatePhrase,
}: FixesAndDiffTabProps) {
  const [activeFilter, setActiveFilter] = useState<FixFilter>('all');
  const [diffMode, setDiffMode] = useState<'original' | 'improved'>('original');
  const [selectedFixId, setSelectedFixId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set());
  const previewMarkRef = useRef<HTMLElement | null>(null);

  const items = useMemo<NormalizedFixItem[]>(() => {
    const out: NormalizedFixItem[] = [];
    const seen = new Set<string>();

    const push = (item: NormalizedFixItem) => {
      const key = `${item.original.toLowerCase()}->${item.improved.toLowerCase()}`;
      if (!item.original.trim() || !item.improved.trim() || seen.has(key)) {
        return;
      }
      seen.add(key);
      out.push(item);
    };

    if (Array.isArray(report.edits) && report.edits.length > 0) {
      report.edits.forEach((edit, idx) => {
        const bucket: Exclude<FixFilter, 'all'> =
          edit.dimension === 'grammar'
            ? 'grammar'
            : edit.dimension === 'calque'
              ? 'calque'
              : 'tone-flow';
        push({
          id: `edit-${idx}`,
          filterBucket: bucket,
          tagLabel:
            ERROR_TAG_META[edit.errorTag]?.label || edit.dimension,
          original: edit.original,
          improved: edit.improved,
          rule: edit.rule,
        });
      });
    } else {
      (report.grammarFixes || []).forEach((gf, idx) => {
        push({
          id: `gf-${idx}`,
          filterBucket: 'grammar',
          tagLabel: gf.category || 'Grammar',
          original: gf.original,
          improved: gf.corrected,
          rule: gf.rule,
        });
      });
      (report.calqueFixes || []).forEach((cf, idx) => {
        push({
          id: `cf-${idx}`,
          filterBucket: 'calque',
          tagLabel: 'Natural Idiom',
          original: cf.phrase,
          improved: cf.naturalAlternative,
          rule: cf.reason,
        });
      });
      (report.pinpointedRewrites || []).forEach((pr, idx) => {
        push({
          id: `pr-${idx}`,
          filterBucket: 'tone-flow',
          tagLabel: pr.category || 'Tone & Flow',
          original: pr.original,
          improved: pr.rewrite,
          rule: pr.rule,
        });
      });
    }

    (report.vocabUpgrades || []).forEach((v, idx) => {
      push({
        id: `voc-${idx}`,
        filterBucket: 'vocab',
        tagLabel: v.contextTag || 'Lexicon Upgrade',
        original: v.used,
        improved: v.betterAlternative,
        rule: v.explanation,
        vocabItem: v,
      });
    });

    return out;
  }, [report]);

  const counts = useMemo(() => {
    const c = { all: items.length, grammar: 0, 'tone-flow': 0, calque: 0, vocab: 0 };
    for (const item of items) {
      c[item.filterBucket] += 1;
    }
    return c;
  }, [items]);

  const filteredItems = useMemo(
    () =>
      activeFilter === 'all'
        ? items
        : items.filter((i) => i.filterBucket === activeFilter),
    [items, activeFilter]
  );

  const selectedItem =
    items.find((i) => i.id === selectedFixId) ?? filteredItems[0] ?? null;

  const improvedDraftPreview = useMemo(() => {
    if (!draftContent.trim()) {
      return report.rewrittenSample?.improved || '';
    }
    let next = draftContent;
    for (const item of items) {
      if (item.filterBucket === 'vocab') continue;
      if (next.includes(item.original)) {
        next = next.replace(item.original, item.improved);
      }
    }
    return next;
  }, [draftContent, items, report.rewrittenSample]);

  const previewText =
    diffMode === 'original'
      ? draftContent.trim() || report.rewrittenSample?.original || ''
      : improvedDraftPreview;

  const activeHighlightPhrase = selectedItem
    ? diffMode === 'original'
      ? selectedItem.original
      : selectedItem.improved
    : null;

  const previewParts = useMemo(
    () => buildHighlightedParts(previewText, activeHighlightPhrase),
    [previewText, activeHighlightPhrase]
  );

  function handleSelectFix(item: NormalizedFixItem) {
    setSelectedFixId(item.id);
    onLocatePhrase?.(item.original);
    window.setTimeout(() => {
      previewMarkRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 30);
  }

  function handleApplyOne(item: NormalizedFixItem) {
    if (!onApplyTextReplacement) return;
    onApplyTextReplacement(item.original, item.improved);
    setAppliedIds((prev) => new Set(prev).add(item.id));
  }

  const filterTabs: Array<{ id: FixFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'grammar', label: 'Grammar', count: counts.grammar },
    { id: 'tone-flow', label: 'Tone & Flow', count: counts['tone-flow'] },
    { id: 'calque', label: 'Calques', count: counts.calque },
    { id: 'vocab', label: 'Vocab', count: counts.vocab },
  ];

  return (
    <div data-testid="eval-tab-panel-fixes" className="space-y-4 editorial-enter">
      {/* Filter Bar + Apply All */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Filter pinpointed fixes"
          className="flex flex-wrap items-center gap-1"
        >
          {filterTabs.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`fix-filter-${tab.id}`}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-accent text-ink-inverse'
                    : 'bg-subtle/70 text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>

        {onApplyAllGrammarFixes && counts.grammar > 0 && (
          <button
            type="button"
            data-testid="apply-all-fixes-button"
            onClick={onApplyAllGrammarFixes}
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            <span>Apply All Grammar</span>
          </button>
        )}
      </div>

      {/* Interactive Live Diff Surface (Original vs. Improved) */}
      {previewText && (
        <div
          data-testid="live-diff-surface"
          className="rounded-lg border border-border-subtle bg-subtle/35 overflow-hidden"
        >
          <div className="px-3.5 py-2 border-b border-border-subtle flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Live Diff Preview</span>
            </span>

            <div
              role="tablist"
              aria-label="Diff view mode"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={diffMode === 'original'}
                data-active={diffMode === 'original' ? 'true' : 'false'}
                data-testid="diff-toggle-original"
                onClick={() => setDiffMode('original')}
                className="segmented-item px-2 py-0.5 text-[11px] font-medium"
              >
                Original
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={diffMode === 'improved'}
                data-active={diffMode === 'improved' ? 'true' : 'false'}
                data-testid="diff-toggle-improved"
                onClick={() => setDiffMode('improved')}
                className="segmented-item px-2 py-0.5 text-[11px] font-medium"
              >
                Improved
              </button>
            </div>
          </div>

          <div className="p-3.5 max-h-44 overflow-y-auto text-xs sm:text-sm leading-relaxed text-ink-primary whitespace-pre-wrap">
            {previewParts.map((part, idx) =>
              part.highlight ? (
                <mark
                  key={idx}
                  ref={(el) => {
                    previewMarkRef.current = el;
                  }}
                  className="px-1 py-0.5 rounded bg-ink-primary/15 text-ink-primary underline decoration-ink-primary/70 underline-offset-2 font-medium"
                >
                  {part.text}
                </mark>
              ) : (
                <span key={idx}>{part.text}</span>
              )
            )}
          </div>
        </div>
      )}

      {/* Pinpointed Fix Cards */}
      {filteredItems.length === 0 ? (
        <div className="py-6 text-center text-xs text-ink-muted border border-dashed border-border-subtle rounded-lg">
          No edits flagged in this category — clean pass.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isSelected = selectedItem?.id === item.id;
            const isApplied = appliedIds.has(item.id);
            const vocabKey = item.vocabItem
              ? `${item.vocabItem.used.toLowerCase()}->${item.vocabItem.betterAlternative.toLowerCase()}`
              : '';
            const isVocabSaved =
              Boolean(vocabKey) &&
              (existingVocabSet?.has(vocabKey) || savedVocabKeys?.has(vocabKey));

            return (
              <div
                key={item.id}
                onClick={() => handleSelectFix(item)}
                className={`p-3 rounded-lg border transition-colors cursor-pointer space-y-1.5 text-xs ${
                  isSelected
                    ? 'border-ink-primary bg-subtle/60'
                    : 'border-border-subtle bg-elevated hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-muted">
                    {item.tagLabel}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.vocabItem && onSaveVocabItem && (
                      <button
                        type="button"
                        disabled={isVocabSaved}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveVocabItem(item.vocabItem!);
                        }}
                        className="btn-ghost inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium"
                      >
                        <BookOpen className="w-3 h-3" aria-hidden="true" />
                        <span>{isVocabSaved ? 'Saved' : 'Save Word'}</span>
                      </button>
                    )}

                    {onApplyTextReplacement && (
                      <button
                        type="button"
                        disabled={isApplied}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyOne(item);
                        }}
                        className="btn-secondary inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium"
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>Applied</span>
                          </>
                        ) : (
                          <span>Apply</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
                  <span className="line-through text-ink-muted">
                    {item.original}
                  </span>
                  <ArrowRight
                    className="w-3 h-3 text-ink-muted inline shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-ink-primary">
                    {item.improved}
                  </span>
                </div>

                <p className="text-[11px] text-ink-secondary leading-snug">
                  {item.rule}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
