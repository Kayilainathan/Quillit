import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookMarked,
  Check,
  PenLine,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { VocabEntry, WritingMode, WritingSession } from '../types';
import { MODE_LABELS, computeVocabularyStats } from '../utils/analytics';
import {
  ALPHABET_LETTERS,
  VOCAB_CATEGORIES,
  classifyVocabEntryLocally,
  getVocabHeadword,
  groupVocabularyAlphabetically,
  type VocabCategory,
} from '../utils/vocabCatalog';
import {
  computeVocabularyMasteryMap,
  type VocabMasterySummary,
} from '../utils/vocabMastery';
import { useSlidingInkIndicator } from './write-addons/useSlidingInkIndicator';

interface VocabularyViewProps {
  vocabulary: VocabEntry[];
  sessions?: WritingSession[];
  todayISO: string;
  onAddVocab: (entry: VocabEntry) => void;
  onToggleMastered: (id: string) => void;
  onDeleteVocab: (id: string) => void;
  onCategorizeWithAI?: () => Promise<{ updatedCount: number; usedAI: boolean }>;
  onPracticeWordInWrite?: (word: string) => void;
}

type VocabSubView = 'lexicon' | 'recall';
type MasteryStatusFilter = 'all' | 'new' | 'in-progress' | 'mastered';

const MASTERED_CELEBRATED_KEY = 'quillit_vocab_mastered_celebrated_v1';

function loadCelebratedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MASTERED_CELEBRATED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCelebratedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(
      MASTERED_CELEBRATED_KEY,
      JSON.stringify(Array.from(ids).slice(-400))
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Highlights occurrences of the target vocabulary word right inside its context sentence.
 */
function HighlightedContextSentence({
  sentence,
  targetWord,
}: {
  sentence: string;
  targetWord: string;
}) {
  const cleanTarget = targetWord.split(/[/(,]/)[0]?.trim();
  if (!cleanTarget || cleanTarget.length < 2) {
    return <>“{sentence}”</>;
  }
  const escaped = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped}\\w*)`, 'gi');
  const parts = sentence.split(regex);
  if (parts.length <= 1) {
    return <>“{sentence}”</>;
  }
  return (
    <>
      “
      {parts.map((part, idx) =>
        idx % 2 === 1 ? (
          <mark
            key={idx}
            className="bg-accent-soft text-ink-primary not-italic font-medium px-1 rounded-[3px] border-b border-accent/50"
          >
            {part}
          </mark>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
      ”
    </>
  );
}

function MasteryLevelBadge({
  mastery,
}: {
  mastery: VocabMasterySummary;
}) {
  const filledPipClass =
    mastery.tier === 'mastered'
      ? mastery.manualMastered
        ? 'bg-status-success/65'
        : 'bg-status-success'
      : mastery.tier === 'familiar'
        ? 'bg-accent'
        : 'bg-ink-secondary';

  const labelClass =
    mastery.tier === 'mastered'
      ? 'text-status-success'
      : mastery.tier === 'familiar'
        ? 'text-ink-primary'
        : 'text-ink-muted';

  const shouldPulse = mastery.reachedUsageThreshold;

  return (
    <span
      data-testid="vocab-mastery-badge"
      data-mastery-tier={mastery.tier}
      data-mastery-uses={mastery.correctUses}
      data-mastery-pulse={shouldPulse ? 'true' : 'false'}
      title={mastery.tooltip}
      aria-label={mastery.tooltip}
      className={`inline-flex items-center gap-1.5 text-[11px] leading-none whitespace-nowrap select-none ${labelClass}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-[2.5px]"
      >
        {[0, 1, 2].map((idx) => (
          <span
            key={idx}
            className={`w-2 h-1.5 rounded-[1.5px] transition-colors ${
              idx < mastery.filledSegments
                ? filledPipClass
                : 'bg-border-default/70'
            }`}
          />
        ))}
      </span>
      <span className="font-medium">{mastery.label}</span>
      {!mastery.manualMastered && (
        <span className="font-mono-tabular opacity-75">
          {mastery.correctUses}/3
        </span>
      )}
    </span>
  );
}

export function VocabularyView({
  vocabulary,
  sessions = [],
  todayISO,
  onAddVocab,
  onToggleMastered,
  onDeleteVocab,
  onCategorizeWithAI,
  onPracticeWordInWrite,
}: VocabularyViewProps) {
  const [subView, setSubView] = useState<VocabSubView>('lexicon');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MasteryStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | VocabCategory>(
    'all'
  );
  const [letterFilter, setLetterFilter] = useState<string>('ALL');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const subViewTabRef = useRef<HTMLDivElement | null>(null);
  const subViewInk = useSlidingInkIndicator(subViewTabRef, subView);

  // AI Categorization feedback state
  const [categorizing, setCategorizing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Active Recall Practice Drill state
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillRevealed, setDrillRevealed] = useState(false);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);

  // Add Word Drawer state
  const [showAdd, setShowAdd] = useState(false);
  const [used, setUsed] = useState('');
  const [betterAlternative, setBetterAlternative] = useState('');
  const [explanation, setExplanation] = useState('');
  const [contextSnippet, setContextSnippet] = useState('');
  const [mode, setMode] = useState<WritingMode>('technical');

  const stats = useMemo(
    () => computeVocabularyStats(vocabulary, todayISO),
    [vocabulary, todayISO]
  );

  const masteryMap = useMemo(
    () => computeVocabularyMasteryMap(vocabulary, sessions),
    [vocabulary, sessions]
  );

  // 4-Stage Mastery Health Distribution
  const masteryBreakdown = useMemo(() => {
    let newCount = 0;
    let emergingCount = 0;
    let familiarCount = 0;
    let masteredCount = 0;
    for (const entry of vocabulary) {
      const m = masteryMap.get(entry.id);
      const tier = m?.tier ?? (entry.mastered ? 'mastered' : 'new');
      if (tier === 'mastered') masteredCount += 1;
      else if (tier === 'familiar') familiarCount += 1;
      else if (tier === 'emerging') emergingCount += 1;
      else newCount += 1;
    }
    const total = Math.max(1, vocabulary.length);
    return {
      newCount,
      emergingCount,
      familiarCount,
      inProgressCount: emergingCount + familiarCount,
      masteredCount,
      newPct: (newCount / total) * 100,
      emergingPct: (emergingCount / total) * 100,
      familiarPct: (familiarCount / total) * 100,
      masteredPct: (masteredCount / total) * 100,
    };
  }, [vocabulary, masteryMap]);

  // Celebrate entries the moment they cross the 3x usage threshold into Mastered
  const [newlyMasteredIds, setNewlyMasteredIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    const celebrated = loadCelebratedIds();
    const freshIds: string[] = [];

    for (const [id, summary] of masteryMap.entries()) {
      if (summary.reachedUsageThreshold && !celebrated.has(id)) {
        freshIds.push(id);
        celebrated.add(id);
      }
    }

    if (freshIds.length === 0) return;

    saveCelebratedIds(celebrated);
    setNewlyMasteredIds((prev) => new Set([...prev, ...freshIds]));

    const timer = window.setTimeout(() => {
      setNewlyMasteredIds((prev) => {
        const next = new Set(prev);
        for (const id of freshIds) next.delete(id);
        return next;
      });
    }, 4800);

    return () => window.clearTimeout(timer);
  }, [masteryMap]);

  const categorizedEntries = useMemo(
    () =>
      vocabulary.map((entry) => ({
        entry,
        category: classifyVocabEntryLocally(entry),
      })),
    [vocabulary]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: vocabulary.length };
    for (const cat of VOCAB_CATEGORIES) counts[cat] = 0;
    for (const item of categorizedEntries) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [categorizedEntries, vocabulary.length]);

  // Filter by search, 4-stage mastery status, and category BEFORE computing A-Z index
  const preLetterFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categorizedEntries
      .filter(({ entry, category }) => {
        const tier =
          masteryMap.get(entry.id)?.tier ??
          (entry.mastered ? 'mastered' : 'new');
        if (statusFilter === 'mastered' && tier !== 'mastered') return false;
        if (statusFilter === 'new' && tier !== 'new') return false;
        if (
          statusFilter === 'in-progress' &&
          tier !== 'emerging' &&
          tier !== 'familiar'
        ) {
          return false;
        }
        if (categoryFilter !== 'all' && category !== categoryFilter) return false;
        if (!q) return true;
        return (
          entry.used.toLowerCase().includes(q) ||
          entry.betterAlternative.toLowerCase().includes(q) ||
          entry.explanation.toLowerCase().includes(q) ||
          entry.contextSnippet.toLowerCase().includes(q) ||
          category.toLowerCase().includes(q)
        );
      })
      .map((item) => item.entry);
  }, [categorizedEntries, masteryMap, query, statusFilter, categoryFilter]);

  const { groups: allAlphaGroups, letterCounts } = useMemo(
    () => groupVocabularyAlphabetically(preLetterFiltered),
    [preLetterFiltered]
  );

  const visibleGroups = useMemo(() => {
    if (letterFilter === 'ALL') return allAlphaGroups;
    return allAlphaGroups.filter((g) => g.letter === letterFilter);
  }, [allAlphaGroups, letterFilter]);

  const practicingQueue = useMemo(
    () =>
      vocabulary.filter((v) => {
        const tier = masteryMap.get(v.id)?.tier ?? (v.mastered ? 'mastered' : 'new');
        return tier !== 'mastered';
      }),
    [vocabulary, masteryMap]
  );

  const drillPool = practicingQueue.length > 0 ? practicingQueue : vocabulary;
  const activeDrillCard =
    drillPool.length > 0 ? drillPool[drillIdx % drillPool.length] : null;

  // Keyboard shortcuts: "/" focuses search in Lexicon; Space/1/2/3 drive Active Recall
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (subView === 'lexicon' && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (subView === 'recall' && activeDrillCard) {
        if (e.code === 'Space') {
          e.preventDefault();
          setDrillRevealed((v) => !v);
        } else if (e.key === '1' && drillRevealed) {
          e.preventDefault();
          setDrillRevealed(false);
          setDrillIdx((i) => i + 1);
          setSessionReviewedCount((c) => c + 1);
        } else if (e.key === '2' && drillRevealed) {
          e.preventDefault();
          setDrillRevealed(false);
          setDrillIdx((i) => i + 1);
          setSessionReviewedCount((c) => c + 1);
        } else if (e.key === '3' && drillRevealed && !activeDrillCard.mastered) {
          e.preventDefault();
          onToggleMastered(activeDrillCard.id);
          setDrillRevealed(false);
          setDrillIdx((i) => i + 1);
          setSessionReviewedCount((c) => c + 1);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [subView, activeDrillCard, drillRevealed, onToggleMastered]);

  async function handleRunAiCategorize() {
    if (!onCategorizeWithAI || vocabulary.length === 0 || categorizing) return;
    setCategorizing(true);
    setAiNotice(null);
    try {
      const result = await onCategorizeWithAI();
      setAiNotice(
        result.usedAI
          ? `Organized ${result.updatedCount} ${result.updatedCount === 1 ? 'word' : 'words'} into editorial categories.`
          : `Organized ${result.updatedCount} ${result.updatedCount === 1 ? 'word' : 'words'} into editorial categories.`
      );
    } catch {
      setAiNotice('Organized vocabulary using local editorial categories.');
    } finally {
      setCategorizing(false);
    }
  }

  function handleAddManual(e: FormEvent) {
    e.preventDefault();
    const targetWord = betterAlternative.trim();
    if (!targetWord) return;
    const oldWord = used.trim() || targetWord;
    const newEntry: VocabEntry = {
      id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      used: oldWord,
      betterAlternative: targetWord,
      explanation: explanation.trim() || 'Added to personal A–Z lexicon.',
      contextSnippet: contextSnippet.trim(),
      mode,
      dateAdded: todayISO,
      mastered: false,
    };
    newEntry.aiCategory = classifyVocabEntryLocally(newEntry);
    onAddVocab(newEntry);
    setUsed('');
    setBetterAlternative('');
    setExplanation('');
    setContextSnippet('');
    setShowAdd(false);
    setLetterFilter('ALL');
  }

  return (
    <div
      data-testid="vocabulary-lexicon-view"
      className="editorial-enter max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-9 space-y-5 sm:space-y-6"
    >
      {/* Editorial Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
            Personal Lexicon
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary">
            Alphabetical A–Z word bank. Weave any word correctly 3× in Write or
            Converse to graduate it to Mastered.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onCategorizeWithAI && vocabulary.length > 0 && (
            <button
              type="button"
              disabled={categorizing}
              data-testid="vocab-ai-categorize-button"
              onClick={() => void handleRunAiCategorize()}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${categorizing ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              <span>{categorizing ? 'Organizing...' : 'Organize with AI'}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="vocab-add-toggle"
            onClick={() => setShowAdd((v) => !v)}
            className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showAdd ? 'Close' : 'Add Word'}</span>
          </button>
        </div>
      </header>

      {/* 4-Stage Mastery Health Strip (Web-Informed Lexicon Telemetry) */}
      <section
        aria-label="Mastery distribution"
        data-testid="vocab-mastery-health"
        className="card-surface p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            <span className="font-mono-tabular text-sm font-semibold text-ink-primary">
              {stats.totalCount} words
            </span>
            <span className="text-ink-muted">
              <strong className="font-mono-tabular text-status-success font-semibold">
                {masteryBreakdown.masteredCount}
              </strong>{' '}
              Mastered
            </span>
            <span className="text-ink-muted">
              <strong className="font-mono-tabular text-ink-primary font-semibold">
                {masteryBreakdown.inProgressCount}
              </strong>{' '}
              In Progress
            </span>
            <span className="text-ink-muted">
              <strong className="font-mono-tabular text-ink-secondary font-semibold">
                {masteryBreakdown.newCount}
              </strong>{' '}
              New
            </span>
          </div>
          <span className="font-mono-tabular text-[11px] text-ink-muted">
            +{stats.monthCount} this month
          </span>
        </div>

        {/* Hairline Segmented Mastery Health Bar */}
        <div
          aria-hidden="true"
          className="h-1.5 w-full rounded-full bg-subtle overflow-hidden flex gap-[2px]"
        >
          {vocabulary.length > 0 && (
            <>
              {masteryBreakdown.masteredPct > 0 && (
                <div
                  className="h-full bg-status-success transition-all duration-300"
                  style={{ width: `${masteryBreakdown.masteredPct}%` }}
                />
              )}
              {masteryBreakdown.familiarPct > 0 && (
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${masteryBreakdown.familiarPct}%` }}
                />
              )}
              {masteryBreakdown.emergingPct > 0 && (
                <div
                  className="h-full bg-ink-secondary/65 transition-all duration-300"
                  style={{ width: `${masteryBreakdown.emergingPct}%` }}
                />
              )}
              {masteryBreakdown.newPct > 0 && (
                <div
                  className="h-full bg-border-default transition-all duration-300"
                  style={{ width: `${masteryBreakdown.newPct}%` }}
                />
              )}
            </>
          )}
        </div>
      </section>

      {aiNotice && (
        <div
          role="status"
          data-testid="vocab-ai-notice"
          className="drawer-reveal px-3.5 py-2.5 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success flex items-center justify-between gap-3"
        >
          <span>{aiNotice}</span>
          <button
            type="button"
            onClick={() => setAiNotice(null)}
            aria-label="Dismiss categorization notice"
            className="btn-ghost p-0.5"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Clean Add Word Drawer */}
      {showAdd && (
        <form
          onSubmit={handleAddManual}
          className="card-surface drawer-reveal p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-primary">
              Add Entry to Lexicon
            </h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              aria-label="Close add word form"
              className="btn-ghost p-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="vocab-better"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                Word or Expression
              </label>
              <input
                id="vocab-better"
                type="text"
                required
                value={betterAlternative}
                onChange={(e) => setBetterAlternative(e.target.value)}
                placeholder="e.g., diagnosed / calibrate"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="vocab-used"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                Replaces Phrase (optional)
              </label>
              <input
                id="vocab-used"
                type="text"
                value={used}
                onChange={(e) => setUsed(e.target.value)}
                placeholder="e.g., looked into"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="vocab-mode"
                className="block text-[11px] font-medium text-ink-secondary mb-1"
              >
                Writing Context
              </label>
              <select
                id="vocab-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as WritingMode)}
                className="input-tactile w-full px-3 py-2 text-xs"
              >
                {Object.entries(MODE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Definition or why it improves precision..."
              aria-label="Definition or usage note"
              className="input-tactile w-full px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={contextSnippet}
              onChange={(e) => setContextSnippet(e.target.value)}
              placeholder="Example sentence (optional)..."
              aria-label="Example sentence"
              className="input-tactile w-full px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="btn-ghost px-3 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-1.5 text-xs font-medium"
            >
              Save to A–Z Lexicon
            </button>
          </div>
        </form>
      )}

      {/* Gliding Ink-Underline Sub-View Tabs + Search & Mastery Stage Filter */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-border-subtle pb-0">
        <div
          ref={subViewTabRef}
          role="tablist"
          aria-label="Vocabulary workspace view"
          className="relative flex items-center gap-4 -mb-px"
        >
          <button
            type="button"
            role="tab"
            data-testid="vocab-tab-lexicon"
            aria-selected={subView === 'lexicon'}
            data-active={subView === 'lexicon' ? 'true' : 'false'}
            onClick={() => setSubView('lexicon')}
            className={`px-1 pb-2.5 text-xs sm:text-sm whitespace-nowrap transition-colors cursor-pointer ${
              subView === 'lexicon'
                ? 'text-ink-primary font-semibold'
                : 'text-ink-muted hover:text-ink-secondary font-normal'
            }`}
          >
            A–Z Lexicon
          </button>
          <button
            type="button"
            role="tab"
            data-testid="vocab-tab-recall"
            aria-selected={subView === 'recall'}
            data-active={subView === 'recall' ? 'true' : 'false'}
            onClick={() => {
              setSubView('recall');
              setDrillRevealed(false);
            }}
            className={`px-1 pb-2.5 text-xs sm:text-sm whitespace-nowrap transition-colors cursor-pointer ${
              subView === 'recall'
                ? 'text-ink-primary font-semibold'
                : 'text-ink-muted hover:text-ink-secondary font-normal'
            }`}
          >
            Active Recall ({practicingQueue.length})
          </button>

          <span
            aria-hidden="true"
            className="ink-glide-underline pointer-events-none absolute left-0 bottom-0 h-[2px] w-[100px] origin-left rounded-full bg-ink-primary"
            style={{
              opacity: subViewInk.ready ? 1 : 0,
              transform: `translate3d(${subViewInk.left}px, 0, 0) scaleX(${Math.max(
                0,
                subViewInk.width / 100
              )})`,
            }}
          />
        </div>

        {subView === 'lexicon' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2.5 min-w-0">
            <div className="relative flex-1 sm:w-56 min-w-0">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search words (press /)..."
                aria-label="Search vocabulary lexicon"
                className="input-tactile w-full pl-8 pr-3 py-1.5 text-xs"
              />
            </div>

            <div
              role="tablist"
              aria-label="Filter by mastery stage"
              className="segmented-track grid grid-cols-4 sm:inline-flex items-center gap-0.5 w-full sm:w-auto"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'new', label: 'New' },
                  { id: 'in-progress', label: 'Building' },
                  { id: 'mastered', label: 'Mastered' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  data-active={statusFilter === tab.id ? 'true' : 'false'}
                  onClick={() => setStatusFilter(tab.id)}
                  className="segmented-item min-h-[32px] sm:min-h-0 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-center"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {subView === 'lexicon' ? (
        <div className="space-y-4">
          {/* Minimal Editorial Category Strip */}
          <nav
            aria-label="Vocabulary categories"
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth-touch pb-1"
          >
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setLetterFilter('ALL');
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
              }`}
            >
              All ({categoryCounts.all ?? 0})
            </button>
            {VOCAB_CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              if (count === 0 && categoryFilter !== cat) return null;
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(cat);
                    setLetterFilter('ALL');
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-accent text-ink-inverse'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </nav>

          {/* A–Z Alphabetical Index Strip */}
          <nav
            aria-label="Alphabetical index"
            data-testid="vocab-az-bar"
            className="card-surface px-2.5 py-2 flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none scroll-smooth-touch"
          >
            <button
              type="button"
              onClick={() => setLetterFilter('ALL')}
              aria-pressed={letterFilter === 'ALL'}
              className={`min-h-[32px] sm:min-h-0 px-2.5 py-1 rounded-sm text-[11px] font-mono-tabular font-semibold transition-colors shrink-0 cursor-pointer ${
                letterFilter === 'ALL'
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
              }`}
            >
              ALL
            </button>
            <span
              aria-hidden="true"
              className="h-4 w-px bg-border-subtle mx-1 shrink-0"
            />
            {ALPHABET_LETTERS.map((letter) => {
              const count = letterCounts[letter] ?? 0;
              const isActive = letterFilter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setLetterFilter(isActive ? 'ALL' : letter)}
                  aria-pressed={isActive}
                  title={
                    count > 0
                      ? `${letter} (${count})`
                      : `No words starting with ${letter}`
                  }
                  className={`w-7 h-7 rounded-sm text-xs font-mono-tabular inline-flex items-center justify-center transition-colors shrink-0 ${
                    isActive
                      ? 'bg-accent text-ink-inverse font-semibold cursor-pointer'
                      : count > 0
                        ? 'text-ink-primary font-medium hover:bg-subtle cursor-pointer'
                        : 'text-ink-muted/30 cursor-not-allowed'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </nav>

          {/* A–Z Alphabetical Grouped Lexicon */}
          {visibleGroups.length === 0 ? (
            <div className="card-surface p-10 sm:p-12 text-center space-y-3">
              <div className="flex justify-center" aria-hidden="true">
                <BookMarked className="w-6 h-6 text-ink-muted" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-ink-primary">
                  {vocabulary.length === 0
                    ? 'Your A–Z lexicon is open for its first word'
                    : 'No words match your current filter'}
                </p>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  {vocabulary.length === 0
                    ? 'Add words manually, use Quick Add inside Write Studio, or evaluate a draft to collect tailored upgrades automatically.'
                    : 'Try clearing the search query, switching mastery stage to All, or selecting ALL on the A–Z index.'}
                </p>
              </div>
              {vocabulary.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Your First Word</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="vocab-az-groups">
              {visibleGroups.map((group) => (
                <section
                  key={group.letter}
                  aria-label={`Words starting with ${group.letter}`}
                  className="card-surface overflow-hidden"
                >
                  {/* Serif Editorial Letter Header */}
                  <div className="px-4 sm:px-5 py-2 border-b border-border-subtle bg-subtle/45 flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-display text-lg font-semibold text-ink-primary leading-none">
                        {group.letter}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-ink-muted">
                        {group.entries.length}{' '}
                        {group.entries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-border-subtle">
                    {group.entries.map((item) => {
                      const category = classifyVocabEntryLocally(item);
                      const headword = item.betterAlternative || getVocabHeadword(item);
                      const mastery = masteryMap.get(item.id) ?? {
                        tier: item.mastered ? 'mastered' : 'new',
                        label: item.mastered ? 'Mastered' : 'New',
                        correctUses: 0,
                        sessionCount: 0,
                        filledSegments: item.mastered ? 3 : 0,
                        reachedUsageThreshold: false,
                        manualMastered: item.mastered,
                        matchedSessionDates: [],
                        tooltip: '',
                      };
                      const isCelebrating = newlyMasteredIds.has(item.id);
                      const showReplacement =
                        item.used.trim().toLowerCase() !==
                        item.betterAlternative.trim().toLowerCase();

                      return (
                        <div
                          key={item.id}
                          data-testid={`vocab-entry-${item.id}`}
                          data-mastery-celebrating={isCelebrating ? 'true' : 'false'}
                          className={`row-tactile px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 ${
                            isCelebrating ? 'vocab-row-mastered-celebrate' : ''
                          }`}
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-display text-base sm:text-[17px] font-medium text-ink-primary">
                                {headword}
                              </span>
                              <MasteryLevelBadge mastery={mastery} />
                              {showReplacement && (
                                <span className="text-xs text-ink-muted">
                                  replaces{' '}
                                  <span className="line-through">{item.used}</span>
                                </span>
                              )}
                            </div>

                            {item.explanation && (
                              <p className="text-xs sm:text-[13px] text-ink-secondary leading-relaxed">
                                {item.explanation}
                              </p>
                            )}

                            {item.contextSnippet.trim() && (
                              <p className="text-xs italic text-ink-muted leading-relaxed">
                                <HighlightedContextSentence
                                  sentence={item.contextSnippet}
                                  targetWord={headword}
                                />
                              </p>
                            )}

                            <div className="pt-0.5 text-[11px] text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-medium text-ink-secondary">
                                {category}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {item.dateAdded}
                              </span>
                              {mastery.correctUses > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      mastery.reachedUsageThreshold
                                        ? 'font-mono-tabular font-medium text-status-success'
                                        : 'font-mono-tabular text-ink-secondary'
                                    }
                                  >
                                    Used {mastery.correctUses}× cleanly
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:pt-0.5">
                            {onPracticeWordInWrite && (
                              <button
                                type="button"
                                data-testid={`vocab-use-in-write-${item.id}`}
                                onClick={() => onPracticeWordInWrite(headword)}
                                className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap"
                              >
                                <PenLine className="w-3 h-3" aria-hidden="true" />
                                <span>Use in Write</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onToggleMastered(item.id)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                                item.mastered
                                  ? 'border-status-success-border bg-status-success-soft text-status-success'
                                  : 'btn-secondary'
                              }`}
                            >
                              <Check className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {item.mastered ? 'Mastered' : 'Master'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVocab(item.id)}
                              aria-label={`Remove ${item.betterAlternative}`}
                              className="btn-ghost p-1.5 hover:text-status-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : activeDrillCard ? (
        /* Keyboard-Driven Tactile Active Recall Studio */
        <section
          aria-label="Active recall flashcard"
          data-testid="vocab-recall-studio"
          className="card-surface overflow-hidden max-w-2xl mx-auto"
        >
          <div className="stationery-band px-5 sm:px-6 py-3.5 border-b border-border-subtle bg-subtle/45 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-ink-muted">
            <span>
              Card {(drillIdx % drillPool.length) + 1} of {drillPool.length} ·{' '}
              {classifyVocabEntryLocally(activeDrillCard)}
              {sessionReviewedCount > 0 ? ` · ${sessionReviewedCount} reviewed` : ''}
            </span>
            {(() => {
              const activeMastery = masteryMap.get(activeDrillCard.id);
              return activeMastery ? (
                <MasteryLevelBadge mastery={activeMastery} />
              ) : null;
            })()}
          </div>

          <div className="p-5 sm:p-8 space-y-5">
            <div className="space-y-2">
              <div className="text-xs text-ink-muted">
                {activeDrillCard.used.trim().toLowerCase() !==
                activeDrillCard.betterAlternative.trim().toLowerCase()
                  ? 'Recall the sharper upgrade for this phrase:'
                  : 'Recall the meaning and craft a quick mental sentence:'}
              </div>
              <div className="font-display text-2xl sm:text-3xl font-medium text-ink-primary">
                “
                {activeDrillCard.used.trim().toLowerCase() !==
                activeDrillCard.betterAlternative.trim().toLowerCase()
                  ? activeDrillCard.used
                  : activeDrillCard.betterAlternative}
                ”
              </div>
              {activeDrillCard.explanation && (
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Clue: {activeDrillCard.explanation}
                </p>
              )}
            </div>

            {drillRevealed && (
              <div className="p-4 rounded-md border border-border-default bg-subtle/50 space-y-2 page-glide-enter">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-lg font-medium text-ink-primary">
                    {activeDrillCard.betterAlternative}
                  </div>
                  {onPracticeWordInWrite && (
                    <button
                      type="button"
                      onClick={() =>
                        onPracticeWordInWrite(activeDrillCard.betterAlternative)
                      }
                      className="inline-link-tactile inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                    >
                      <span>Use in Write</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {activeDrillCard.contextSnippet && (
                  <p className="text-xs italic text-ink-secondary leading-relaxed">
                    <HighlightedContextSentence
                      sentence={activeDrillCard.contextSnippet}
                      targetWord={activeDrillCard.betterAlternative}
                    />
                  </p>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                data-testid="vocab-recall-reveal"
                onClick={() => setDrillRevealed((v) => !v)}
                className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{drillRevealed ? 'Hide' : 'Reveal'}</span>
                <kbd className="hidden sm:inline font-mono-tabular text-[10px] text-ink-muted ml-1">
                  Space
                </kbd>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {drillRevealed && !activeDrillCard.mastered && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMastered(activeDrillCard.id);
                      setDrillRevealed(false);
                      setDrillIdx((i) => i + 1);
                      setSessionReviewedCount((c) => c + 1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-status-success-border bg-status-success-soft text-status-success hover:border-border-strong transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mastered</span>
                    <kbd className="hidden sm:inline font-mono-tabular text-[10px] opacity-75">
                      3
                    </kbd>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDrillRevealed(false);
                    setDrillIdx((i) => i + 1);
                    setSessionReviewedCount((c) => c + 1);
                  }}
                  className="btn-primary px-4 py-2 text-xs font-medium"
                >
                  Next Card
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="card-surface p-12 text-center space-y-2">
          <p className="font-display text-lg text-ink-primary">
            All caught up
          </p>
          <p className="text-xs text-ink-muted">
            Add a few words to your A–Z Lexicon to begin Active Recall practice.
          </p>
        </div>
      )}
    </div>
  );
}
