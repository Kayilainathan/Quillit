import { useMemo, useState, type FormEvent } from 'react';
import {
  BookMarked,
  Check,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { VocabEntry, WritingMode } from '../types';
import { MODE_LABELS, computeVocabularyStats } from '../utils/analytics';
import {
  ALPHABET_LETTERS,
  VOCAB_CATEGORIES,
  classifyVocabEntryLocally,
  getVocabHeadword,
  groupVocabularyAlphabetically,
  type VocabCategory,
} from '../utils/vocabCatalog';

interface VocabularyViewProps {
  vocabulary: VocabEntry[];
  todayISO: string;
  onAddVocab: (entry: VocabEntry) => void;
  onToggleMastered: (id: string) => void;
  onDeleteVocab: (id: string) => void;
  onCategorizeWithAI?: () => Promise<{ updatedCount: number; usedAI: boolean }>;
}

type VocabSubView = 'lexicon' | 'recall';

export function VocabularyView({
  vocabulary,
  todayISO,
  onAddVocab,
  onToggleMastered,
  onDeleteVocab,
  onCategorizeWithAI,
}: VocabularyViewProps) {
  const [subView, setSubView] = useState<VocabSubView>('lexicon');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'practicing' | 'mastered'>(
    'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | VocabCategory>('all');
  const [letterFilter, setLetterFilter] = useState<string>('ALL');

  // AI Categorization feedback state
  const [categorizing, setCategorizing] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Active Recall Practice Drill state
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillRevealed, setDrillRevealed] = useState(false);

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

  // Resolve effective category for every entry (AI category if present, else deterministic local)
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

  // Filter by search, status, and category BEFORE computing active A-Z letter index
  const preLetterFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categorizedEntries
      .filter(({ entry, category }) => {
        if (statusFilter === 'mastered' && !entry.mastered) return false;
        if (statusFilter === 'practicing' && entry.mastered) return false;
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
  }, [categorizedEntries, query, statusFilter, categoryFilter]);

  const { groups: allAlphaGroups, letterCounts } = useMemo(
    () => groupVocabularyAlphabetically(preLetterFiltered),
    [preLetterFiltered]
  );

  const visibleGroups = useMemo(() => {
    if (letterFilter === 'ALL') return allAlphaGroups;
    return allAlphaGroups.filter((g) => g.letter === letterFilter);
  }, [allAlphaGroups, letterFilter]);

  const practicingQueue = useMemo(
    () => vocabulary.filter((v) => !v.mastered),
    [vocabulary]
  );

  const drillPool = practicingQueue.length > 0 ? practicingQueue : vocabulary;
  const activeDrillCard =
    drillPool.length > 0 ? drillPool[drillIdx % drillPool.length] : null;

  async function handleRunAiCategorize() {
    if (!onCategorizeWithAI || vocabulary.length === 0 || categorizing) return;
    setCategorizing(true);
    setAiNotice(null);
    try {
      const result = await onCategorizeWithAI();
      setAiNotice(
        result.usedAI
          ? `AI organized ${result.updatedCount} ${result.updatedCount === 1 ? 'word' : 'words'} into editorial categories.`
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
      explanation: explanation.trim() || 'Added to personal A-Z lexicon.',
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
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6"
    >
      {/* Editorial Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
            Personal Lexicon
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary">
            Alphabetical A to Z word bank organized by writing craft. Words auto-graduate to Mastered when used naturally in drafts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onCategorizeWithAI && vocabulary.length > 0 && (
            <button
              type="button"
              disabled={categorizing}
              data-testid="vocab-ai-categorize-button"
              onClick={() => void handleRunAiCategorize()}
              className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${categorizing ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              <span>{categorizing ? 'Categorizing...' : 'Categorize with AI'}</span>
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

      {/* Whisper-Quiet Editorial Metrics Ribbon */}
      <section
        aria-label="Lexicon statistics"
        className="grid grid-cols-2 sm:grid-cols-4 border-y border-border-subtle divide-y sm:divide-y-0 sm:divide-x divide-border-subtle bg-surface/55"
      >
        <div className="py-3.5 px-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            Total Words
          </div>
          <div className="mt-0.5 font-mono-tabular text-xl font-semibold text-ink-primary">
            {stats.totalCount}
          </div>
        </div>
        <div className="py-3.5 px-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            Practicing
          </div>
          <div className="mt-0.5 font-mono-tabular text-xl font-semibold text-ink-primary">
            {stats.totalCount - stats.masteredCount}
          </div>
        </div>
        <div className="py-3.5 px-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            Mastered
          </div>
          <div className="mt-0.5 font-mono-tabular text-xl font-semibold text-status-success">
            {stats.masteredCount}
          </div>
        </div>
        <div className="py-3.5 px-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            Added This Month
          </div>
          <div className="mt-0.5 font-mono-tabular text-xl font-semibold text-ink-primary">
            {stats.monthCount}
          </div>
        </div>
      </section>

      {aiNotice && (
        <div
          role="status"
          data-testid="vocab-ai-notice"
          className="px-3.5 py-2.5 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success flex items-center justify-between gap-3"
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
          className="card-surface p-5 space-y-3.5"
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
              Save to A-Z Lexicon
            </button>
          </div>
        </form>
      )}

      {/* View Switcher + Search + Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Vocabulary workspace view"
          className="segmented-track inline-flex items-center gap-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'lexicon'}
            data-active={subView === 'lexicon' ? 'true' : 'false'}
            onClick={() => setSubView('lexicon')}
            className="segmented-item px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            A to Z Lexicon
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'recall'}
            data-active={subView === 'recall' ? 'true' : 'false'}
            onClick={() => {
              setSubView('recall');
              setDrillRevealed(false);
            }}
            className="segmented-item px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            Active Recall ({practicingQueue.length})
          </button>
        </div>

        {subView === 'lexicon' && (
          <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end min-w-[240px]">
            <div className="relative flex-1 min-w-[190px] max-w-xs">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search words, meanings, categories..."
                aria-label="Search vocabulary lexicon"
                className="input-tactile w-full pl-8 pr-3 py-1.5 text-xs"
              />
            </div>

            <div
              role="tablist"
              aria-label="Filter vocabulary mastery status"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              {(['all', 'practicing', 'mastered'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === status}
                  data-active={statusFilter === status ? 'true' : 'false'}
                  onClick={() => setStatusFilter(status)}
                  className="segmented-item px-2.5 py-1 text-xs font-medium capitalize"
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {subView === 'lexicon' ? (
        <div className="space-y-4">
          {/* Interactive AI Category Filter Bar */}
          <nav
            aria-label="Vocabulary categories"
            className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle pb-3"
          >
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setLetterFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === 'all'
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
              }`}
            >
              All Categories ({categoryCounts.all ?? 0})
            </button>
            {VOCAB_CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(cat);
                    setLetterFilter('ALL');
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-accent text-ink-inverse'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
                  }`}
                >
                  {cat}
                  {count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </nav>

          {/* A-Z Alphabetical Index Strip */}
          <nav
            aria-label="Alphabetical index"
            data-testid="vocab-az-bar"
            className="card-surface px-3 py-2.5 flex items-center gap-1 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => setLetterFilter('ALL')}
              aria-pressed={letterFilter === 'ALL'}
              className={`px-2.5 py-1 rounded-sm text-[11px] font-mono-tabular font-semibold transition-colors shrink-0 cursor-pointer ${
                letterFilter === 'ALL'
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
              }`}
            >
              ALL
            </button>
            <span aria-hidden="true" className="h-4 w-px bg-border-subtle mx-1 shrink-0" />
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
                  title={count > 0 ? `${letter} (${count})` : `No words starting with ${letter}`}
                  className={`w-7 h-7 rounded-sm text-xs font-mono-tabular inline-flex items-center justify-center transition-colors shrink-0 ${
                    isActive
                      ? 'bg-accent text-ink-inverse font-semibold cursor-pointer'
                      : count > 0
                        ? 'text-ink-primary font-medium hover:bg-subtle cursor-pointer'
                        : 'text-ink-muted/35 cursor-not-allowed'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </nav>

          {/* A-Z Alphabetical Grouped Lexicon */}
          {visibleGroups.length === 0 ? (
            <div className="card-surface p-12 text-center space-y-3">
              <div className="flex justify-center" aria-hidden="true">
                <BookMarked className="w-6 h-6 text-ink-muted" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-ink-primary">
                  {vocabulary.length === 0
                    ? 'Your A to Z lexicon is ready for its first entry'
                    : 'No words match your current filter'}
                </p>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  {vocabulary.length === 0
                    ? 'Add words manually, use Quick Add inside Write Studio, or evaluate a draft to collect tailored upgrades automatically.'
                    : 'Try clearing the search box, selecting All Categories, or choosing ALL on the A to Z index.'}
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
            <div className="space-y-5" data-testid="vocab-az-groups">
              {visibleGroups.map((group) => (
                <section
                  key={group.letter}
                  aria-label={`Words starting with ${group.letter}`}
                  className="card-surface overflow-hidden"
                >
                  {/* Serif Editorial Letter Divider */}
                  <div className="px-5 py-2.5 border-b border-border-subtle bg-subtle/50 flex items-center justify-between gap-3">
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
                      const headword = getVocabHeadword(item);
                      const showReplacement =
                        item.used.trim().toLowerCase() !==
                        item.betterAlternative.trim().toLowerCase();

                      return (
                        <div
                          key={item.id}
                          className="row-tactile px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                              <span className="font-display text-base font-medium text-ink-primary">
                                {item.betterAlternative || headword}
                              </span>
                              {showReplacement && (
                                <span className="text-xs text-ink-muted">
                                  replaces{' '}
                                  <span className="line-through">{item.used}</span>
                                </span>
                              )}
                            </div>

                            {item.explanation && (
                              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                                {item.explanation}
                              </p>
                            )}

                            {item.contextSnippet.trim() && (
                              <p className="text-xs italic text-ink-muted leading-relaxed">
                                &ldquo;{item.contextSnippet}&rdquo;
                              </p>
                            )}

                            {/* Unboxed Editorial Metadata Row (Zero Pill Clutter) */}
                            <div className="pt-0.5 text-[11px] text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-medium text-ink-secondary">
                                {category}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{MODE_LABELS[item.mode]}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-tabular">
                                {item.dateAdded}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  item.mastered
                                    ? 'font-medium text-status-success'
                                    : 'text-ink-muted'
                                }
                              >
                                {item.mastered ? 'Mastered' : 'Practicing'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 sm:pt-0.5">
                            <button
                              type="button"
                              onClick={() => onToggleMastered(item.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                                item.mastered
                                  ? 'border-status-success-border bg-status-success-soft text-status-success'
                                  : 'btn-secondary'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {item.mastered ? 'Mastered' : 'Mark Mastered'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteVocab(item.id)}
                              aria-label={`Remove ${item.betterAlternative}`}
                              className="btn-ghost p-2 hover:text-status-danger"
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
        /* Active Recall Practice Flashcard */
        <section
          aria-label="Active recall flashcard"
          className="card-surface overflow-hidden max-w-2xl mx-auto"
        >
          <div className="stationery-band px-6 py-4 border-b border-border-subtle bg-subtle/45 flex items-center justify-between text-xs font-mono-tabular text-ink-muted">
            <span>
              Card {(drillIdx % drillPool.length) + 1} of {drillPool.length} ·{' '}
              {classifyVocabEntryLocally(activeDrillCard)}
            </span>
            <span>
              {activeDrillCard.mastered ? 'Mastered' : 'In Practice Queue'}
            </span>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            <div className="space-y-2">
              <div className="text-xs text-ink-muted">
                {activeDrillCard.used.trim().toLowerCase() !==
                activeDrillCard.betterAlternative.trim().toLowerCase()
                  ? 'Recall the sharper upgrade for this phrase:'
                  : 'Recall the definition and natural usage:'}
              </div>
              <div className="font-display text-2xl font-medium text-ink-primary">
                &ldquo;
                {activeDrillCard.used.trim().toLowerCase() !==
                activeDrillCard.betterAlternative.trim().toLowerCase()
                  ? activeDrillCard.used
                  : activeDrillCard.betterAlternative}
                &rdquo;
              </div>
              {activeDrillCard.explanation && (
                <p className="text-xs text-ink-secondary">
                  Clue: {activeDrillCard.explanation}
                </p>
              )}
            </div>

            {drillRevealed && (
              <div className="p-4 rounded-lg border border-border-subtle bg-subtle/50 space-y-1.5 page-glide-enter">
                <div className="text-xs font-semibold text-ink-primary">
                  {activeDrillCard.betterAlternative}
                </div>
                {activeDrillCard.contextSnippet && (
                  <p className="text-xs italic text-ink-secondary">
                    &ldquo;{activeDrillCard.contextSnippet}&rdquo;
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDrillRevealed((v) => !v)}
                className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{drillRevealed ? 'Hide Answer' : 'Reveal Answer'}</span>
              </button>

              <div className="flex items-center gap-2">
                {!activeDrillCard.mastered && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMastered(activeDrillCard.id);
                      setDrillRevealed(false);
                      setDrillIdx((i) => i + 1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-status-success-border bg-status-success-soft text-status-success hover:border-border-strong transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mark Mastered</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDrillRevealed(false);
                    setDrillIdx((i) => i + 1);
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
        <div className="card-surface p-12 text-center text-sm text-ink-muted">
          Add a few words to begin Active Recall practice.
        </div>
      )}
    </div>
  );
}
