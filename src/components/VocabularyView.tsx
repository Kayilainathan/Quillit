import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Compass,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { VocabEntry, WritingMode } from '../types';
import { MODE_LABELS, computeVocabularyStats } from '../utils/analytics';

interface VocabularyViewProps {
  vocabulary: VocabEntry[];
  todayISO: string;
  onAddVocab: (entry: VocabEntry) => void;
  onToggleMastered: (id: string) => void;
  onDeleteVocab: (id: string) => void;
}

type HubDomain = 'technical' | 'outreach' | 'creative';

function classifyDomain(mode: WritingMode): HubDomain {
  if (mode === 'technical') return 'technical';
  if (mode === 'linkedin' || mode === 'email') return 'outreach';
  return 'creative';
}

const HUB_CONFIG: Record<
  HubDomain,
  { label: string; angleDeg: number; colorClass: string; strokeVar: string }
> = {
  technical: {
    label: 'Technical & Interview',
    angleDeg: -135,
    colorClass: 'text-status-success',
    strokeVar: 'var(--status-success)',
  },
  outreach: {
    label: 'LinkedIn & Email',
    angleDeg: -20,
    colorClass: 'text-status-info',
    strokeVar: 'var(--status-info)',
  },
  creative: {
    label: 'Creative & Voice',
    angleDeg: 105,
    colorClass: 'text-status-warning',
    strokeVar: 'var(--status-warning)',
  },
};

export function VocabularyView({
  vocabulary,
  todayISO,
  onAddVocab,
  onToggleMastered,
  onDeleteVocab,
}: VocabularyViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'practicing' | 'mastered'>(
    'all'
  );
  const [domainFilter, setDomainFilter] = useState<'all' | HubDomain>('all');
  const [activeVisualTab, setActiveVisualTab] = useState<'web' | 'drill'>('web');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => vocabulary[0]?.id ?? null
  );

  // Active Recall Practice Drill state
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillRevealed, setDrillRevealed] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...vocabulary]
      .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
      .filter((v) => {
        if (statusFilter === 'mastered' && !v.mastered) return false;
        if (statusFilter === 'practicing' && v.mastered) return false;
        if (domainFilter !== 'all' && classifyDomain(v.mode) !== domainFilter) {
          return false;
        }
        if (!q) return true;
        return (
          v.used.toLowerCase().includes(q) ||
          v.betterAlternative.toLowerCase().includes(q) ||
          v.explanation.toLowerCase().includes(q) ||
          v.contextSnippet.toLowerCase().includes(q)
        );
      });
  }, [vocabulary, query, statusFilter, domainFilter]);

  const practicingQueue = useMemo(
    () => vocabulary.filter((v) => !v.mastered),
    [vocabulary]
  );

  const drillPool = practicingQueue.length > 0 ? practicingQueue : vocabulary;
  const activeDrillCard =
    drillPool.length > 0 ? drillPool[drillIdx % drillPool.length] : null;

  // Compute radial SVG positions for the Interactive Vocabulary Synergy Web
  const webGraph = useMemo(() => {
    const cx = 360;
    const cy = 175;
    const hubRadius = 88;
    const items = vocabulary.slice(0, 18);

    const hubs = (Object.keys(HUB_CONFIG) as HubDomain[]).map((domain) => {
      const rad = (HUB_CONFIG[domain].angleDeg * Math.PI) / 180;
      return {
        domain,
        ...HUB_CONFIG[domain],
        x: cx + Math.cos(rad) * hubRadius,
        y: cy + Math.sin(rad) * hubRadius,
      };
    });

    const grouped: Record<HubDomain, VocabEntry[]> = {
      technical: [],
      outreach: [],
      creative: [],
    };
    for (const v of items) {
      grouped[classifyDomain(v.mode)].push(v);
    }

    const leaves: Array<{
      entry: VocabEntry;
      domain: HubDomain;
      hubX: number;
      hubY: number;
      x: number;
      y: number;
      labelX: number;
      labelY: number;
      textAnchor: 'start' | 'end' | 'middle';
      label: string;
    }> = [];

    for (const hub of hubs) {
      const list = grouped[hub.domain];
      const baseAngle = (HUB_CONFIG[hub.domain].angleDeg * Math.PI) / 180;
      const spread = Math.min(2.15, Math.max(0.85, list.length * 0.44));
      list.forEach((entry, i) => {
        const offset =
          list.length === 1
            ? 0
            : ((i / (list.length - 1)) - 0.5) * spread;
        const angle = baseAngle + offset;
        const dist = 84 + (i % 2) * 32;
        const rawLabel = entry.betterAlternative.split('/')[0].trim();
        const label =
          rawLabel.length > 20 ? `${rawLabel.slice(0, 18)}…` : rawLabel;
        const x = Math.max(82, Math.min(638, hub.x + Math.cos(angle) * dist));
        const y = Math.max(28, Math.min(318, hub.y + Math.sin(angle) * dist));
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const textAnchor: 'start' | 'end' | 'middle' =
          cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle';
        const labelX = x + (textAnchor === 'start' ? 12 : textAnchor === 'end' ? -12 : 0);
        const labelY = y + (sinA > 0.45 ? 16 : sinA < -0.45 ? -10 : 4);
        leaves.push({
          entry,
          domain: hub.domain,
          hubX: hub.x,
          hubY: hub.y,
          x,
          y,
          labelX,
          labelY,
          textAnchor,
          label,
        });
      });
    }

    return { cx, cy, hubs, leaves };
  }, [vocabulary]);

  const inspectedEntry = useMemo(
    () =>
      vocabulary.find((v) => v.id === selectedNodeId) ??
      filtered[0] ??
      vocabulary[0] ??
      null,
    [vocabulary, selectedNodeId, filtered]
  );

  function handleAddManual(e: FormEvent) {
    e.preventDefault();
    if (!used.trim() || !betterAlternative.trim()) return;
    const newId = `vocab-${Date.now()}`;
    onAddVocab({
      id: newId,
      used: used.trim(),
      betterAlternative: betterAlternative.trim(),
      explanation: explanation.trim() || 'Manual vocabulary upgrade entry.',
      contextSnippet: contextSnippet.trim() || 'Added directly to library.',
      mode,
      dateAdded: todayISO,
      mastered: false,
    });
    setSelectedNodeId(newId);
    setUsed('');
    setBetterAlternative('');
    setExplanation('');
    setContextSnippet('');
    setShowAdd(false);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-ink-primary">
            Personal Vocabulary Synergy Lab
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Maps your everyday phrasing to sharper EIE, LinkedIn, and creative upgrades—auto-mastering words when used cleanly in drafts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showAdd ? 'Close' : 'Add Upgrade'}</span>
          </button>
        </div>
      </div>

      {/* Period Vocabulary Counters */}
      <section
        aria-label="New vocabulary counts"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <div className="card-surface p-4">
          <div className="text-xs text-ink-muted">
            New This Week
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {stats.weekCount}
          </div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs text-ink-muted">
            New This Month
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {stats.monthCount}
          </div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs text-ink-muted">
            New This Year
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {stats.yearCount}
          </div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs text-ink-muted">
            Mastered
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-status-success">
            {stats.masteredCount}
            <span className="text-sm font-normal text-ink-muted">
              /{stats.totalCount}
            </span>
          </div>
        </div>
      </section>

      {showAdd && (
        <form
          onSubmit={handleAddManual}
          className="card-surface p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="vocab-used"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Old Phrase Used
              </label>
              <input
                id="vocab-used"
                type="text"
                required
                value={used}
                onChange={(e) => setUsed(e.target.value)}
                placeholder="e.g., looked into"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="vocab-better"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Upgraded Alternative
              </label>
              <input
                id="vocab-better"
                type="text"
                required
                value={betterAlternative}
                onChange={(e) => setBetterAlternative(e.target.value)}
                placeholder="e.g., diagnosed / isolated"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="vocab-mode"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Context Mode
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
              placeholder="Why it improves precision or tone..."
              aria-label="Explanation"
              className="input-tactile w-full px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={contextSnippet}
              onChange={(e) => setContextSnippet(e.target.value)}
              placeholder="Example sentence from your draft..."
              aria-label="Example sentence"
              className="input-tactile w-full px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary px-4 py-2 text-xs font-medium"
            >
              Save to Library
            </button>
          </div>
        </form>
      )}

      {/* Interactive SVG Vocabulary Synergy Web + Active Recall Practice Drill */}
      {vocabulary.length > 0 && (
        <section
          aria-label="Vocabulary synergy web and practice drill"
          className="card-surface overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-border-subtle bg-subtle flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass
                className="w-4 h-4 text-ink-primary"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-ink-primary">
                {activeVisualTab === 'web'
                  ? 'Interactive Lexical Synergy Web'
                  : 'Active Recall Practice Drill'}
              </h2>
            </div>

            <div
              role="tablist"
              aria-label="Vocabulary visual workspace"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeVisualTab === 'web'}
                data-active={activeVisualTab === 'web' ? 'true' : 'false'}
                onClick={() => setActiveVisualTab('web')}
                className="segmented-item px-3 py-1 text-xs font-medium"
              >
                Synergy Web
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeVisualTab === 'drill'}
                data-active={activeVisualTab === 'drill' ? 'true' : 'false'}
                onClick={() => {
                  setActiveVisualTab('drill');
                  setDrillRevealed(false);
                }}
                className="segmented-item inline-flex items-center gap-1 px-3 py-1 text-xs font-medium"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>Recall Drill ({practicingQueue.length} active)</span>
              </button>
            </div>
          </div>

          {activeVisualTab === 'web' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
              {/* Interactive Semantic Graph */}
              <div className="lg:col-span-8 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
                  <span>
                    Click any phrase node to inspect context or filter by domain.
                  </span>
                  <div className="flex items-center gap-3 font-mono-tabular">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: 'var(--status-success)' }}
                      />
                      Mastered
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: 'var(--chart-primary)' }}
                      />
                      Practicing
                    </span>
                  </div>
                </div>

                <svg
                  viewBox="0 0 720 340"
                  className="w-full h-[270px] sm:h-[310px] select-none"
                  role="img"
                  aria-label="Interactive vocabulary synergy network graph"
                >
                  {/* Concentric orbital guide */}
                  <circle
                    cx={webGraph.cx}
                    cy={webGraph.cy}
                    r={86}
                    fill="none"
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 4"
                  />
                  <circle
                    cx={webGraph.cx}
                    cy={webGraph.cy}
                    r={154}
                    fill="none"
                    stroke="var(--chart-grid)"
                    strokeOpacity={0.7}
                    strokeDasharray="2 5"
                  />

                  {/* Edges: Core -> Domain Hubs */}
                  {webGraph.hubs.map((hub) => (
                    <line
                      key={`edge-core-${hub.domain}`}
                      x1={webGraph.cx}
                      y1={webGraph.cy}
                      x2={hub.x}
                      y2={hub.y}
                      stroke={hub.strokeVar}
                      strokeOpacity={0.4}
                      strokeWidth={1.6}
                    />
                  ))}

                  {/* Edges: Domain Hubs -> Vocabulary Nodes */}
                  {webGraph.leaves.map((leaf) => {
                    const isSelected = inspectedEntry?.id === leaf.entry.id;
                    const strokeColor = leaf.entry.mastered
                      ? 'var(--status-success)'
                      : HUB_CONFIG[leaf.domain].strokeVar;
                    return (
                      <line
                        key={`edge-leaf-${leaf.entry.id}`}
                        x1={leaf.hubX}
                        y1={leaf.hubY}
                        x2={leaf.x}
                        y2={leaf.y}
                        stroke={strokeColor}
                        strokeOpacity={isSelected ? 0.95 : 0.3}
                        strokeWidth={isSelected ? 2 : 1.2}
                      />
                    );
                  })}

                  {/* Central Lexical Anchor */}
                  <g>
                    <circle
                      cx={webGraph.cx}
                      cy={webGraph.cy}
                      r={24}
                      fill="var(--accent)"
                    />
                    <text
                      x={webGraph.cx}
                      y={webGraph.cy + 3}
                      textAnchor="middle"
                      fill="var(--ink-inverse)"
                      className="text-[10px] font-semibold"
                    >
                      Quillit
                    </text>
                  </g>

                  {/* Domain Hubs (Clickable to filter) */}
                  {webGraph.hubs.map((hub) => {
                    const activeDomain = domainFilter === hub.domain;
                    return (
                      <g
                        key={`hub-${hub.domain}`}
                        onClick={() =>
                          setDomainFilter((prev) =>
                            prev === hub.domain ? 'all' : hub.domain
                          )
                        }
                        className="cursor-pointer"
                      >
                        <circle
                          cx={hub.x}
                          cy={hub.y}
                          r={18}
                          fill={activeDomain ? hub.strokeVar : 'var(--bg-surface)'}
                          stroke={hub.strokeVar}
                          strokeWidth={2}
                        />
                        <text
                          x={hub.x}
                          y={hub.y + 30}
                          textAnchor="middle"
                          fill="var(--ink-secondary)"
                          className="text-[10px] font-semibold"
                        >
                          {hub.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Vocabulary Upgrade Nodes */}
                  {webGraph.leaves.map((leaf) => {
                    const isSelected = inspectedEntry?.id === leaf.entry.id;
                    const fillToken = leaf.entry.mastered
                      ? 'var(--status-success)'
                      : 'var(--chart-primary)';
                    return (
                      <g
                        key={`node-${leaf.entry.id}`}
                        onClick={() => setSelectedNodeId(leaf.entry.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedNodeId(leaf.entry.id);
                          }
                        }}
                        className="cursor-pointer focus:outline-none"
                        role="button"
                        tabIndex={0}
                        aria-label={`Inspect ${leaf.entry.betterAlternative}`}
                      >
                        <circle
                          cx={leaf.x}
                          cy={leaf.y}
                          r={isSelected ? 9 : 6.5}
                          fill={fillToken}
                          stroke="var(--bg-surface)"
                          strokeWidth={isSelected ? 2.5 : 1.5}
                        />
                        <text
                          x={leaf.labelX}
                          y={leaf.labelY}
                          textAnchor={leaf.textAnchor}
                          fill={isSelected ? 'var(--ink-primary)' : 'var(--ink-secondary)'}
                          className={`text-[10px] ${
                            isSelected ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {leaf.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Integrated Node Inspector */}
              <div className="lg:col-span-4 p-5 flex flex-col justify-between gap-4 bg-subtle">
                {inspectedEntry ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                        <span className="text-ink-muted">
                          {MODE_LABELS[inspectedEntry.mode]}
                        </span>
                        <span
                          className={
                            inspectedEntry.mastered
                              ? 'font-semibold text-status-success'
                              : 'font-semibold text-ink-primary'
                          }
                        >
                          {inspectedEntry.mastered ? 'Mastered' : 'Practicing'}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs line-through text-ink-muted">
                          {inspectedEntry.used}
                        </div>
                        <div className="font-display text-xl font-medium text-ink-primary mt-0.5">
                          {inspectedEntry.betterAlternative}
                        </div>
                      </div>

                      <p className="text-xs text-ink-secondary leading-relaxed">
                        {inspectedEntry.explanation}
                      </p>

                      <div className="p-3 rounded-lg border border-border-subtle bg-surface text-xs italic text-ink-secondary">
                        “{inspectedEntry.contextSnippet}”
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                      <span className="text-[11px] font-mono-tabular text-ink-muted">
                        Added {inspectedEntry.dateAdded}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleMastered(inspectedEntry.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          inspectedEntry.mastered
                            ? 'border-status-success-border bg-status-success-soft text-status-success'
                            : 'btn-primary'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {inspectedEntry.mastered ? 'Mastered' : 'Mark Mastered'}
                        </span>
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-muted">
                    Select any node in the graph to inspect its usage context.
                  </p>
                )}
              </div>
            </div>
          ) : activeDrillCard ? (
            <div className="p-6 max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between text-xs font-mono-tabular text-ink-muted">
                <span>
                  Card {(drillIdx % drillPool.length) + 1} of {drillPool.length} ·{' '}
                  {MODE_LABELS[activeDrillCard.mode]}
                </span>
                <span>
                  {activeDrillCard.mastered ? 'Already Mastered' : 'In Practice Queue'}
                </span>
              </div>

              <div className="p-5 rounded-xl border border-border-subtle bg-subtle space-y-3">
                <div className="text-xs text-ink-muted">
                  Replace this habit phrase in your next draft:
                </div>
                <div className="font-display text-xl font-medium text-ink-primary">
                  “{activeDrillCard.used}”
                </div>
                <div className="text-xs text-ink-secondary">
                  Context clue: {activeDrillCard.explanation}
                </div>

                {drillRevealed && (
                  <div className="pt-3 border-t border-border-subtle space-y-1.5">
                    <div className="text-xs font-semibold text-ink-primary">
                      Upgraded Expression: {activeDrillCard.betterAlternative}
                    </div>
                    <div className="text-xs italic text-ink-secondary">
                      “{activeDrillCard.contextSnippet}”
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDrillRevealed((v) => !v)}
                  className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
                >
                  <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{drillRevealed ? 'Hide Upgrade' : 'Reveal Upgrade'}</span>
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-status-success-border bg-status-success-soft text-status-success hover:border-border-strong transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Got It · Mark Mastered</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDrillRevealed(false);
                      setDrillIdx((i) => i + 1);
                    }}
                    className="btn-primary px-3.5 py-2 text-xs font-medium"
                  >
                    Next Card
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search old words, upgrades, or context..."
              aria-label="Search vocabulary library"
              className="input-tactile w-full pl-8 pr-3 py-2 text-xs"
            />
          </div>

          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value as 'all' | HubDomain)}
            aria-label="Filter vocabulary by writing domain"
            className="input-tactile px-3 py-2 text-xs"
          >
            <option value="all">All Domains</option>
            <option value="technical">Technical &amp; Interview</option>
            <option value="outreach">LinkedIn &amp; Email</option>
            <option value="creative">Creative &amp; Voice</option>
          </select>
        </div>

        <div
          role="tablist"
          aria-label="Filter vocabulary status"
          className="segmented-track flex items-center gap-0.5"
        >
          {(['all', 'practicing', 'mastered'] as const).map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={statusFilter === status}
              data-active={statusFilter === status ? 'true' : 'false'}
              onClick={() => setStatusFilter(status)}
              className="segmented-item px-3 py-1.5 text-xs font-medium capitalize"
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Vocabulary List */}
      {filtered.length === 0 ? (
        <div className="card-surface p-12 text-center text-sm text-ink-muted">
          No vocabulary items match your filter.
        </div>
      ) : (
        <div className="card-surface divide-y divide-border-subtle overflow-hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedNodeId(item.id)}
              className={`row-tactile p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                selectedNodeId === item.id ? 'bg-subtle' : ''
              }`}
            >
              <div className="space-y-1">
                <div className="text-sm flex flex-wrap items-center gap-2">
                  <span className="line-through text-ink-muted">
                    {item.used}
                  </span>
                  <span aria-hidden="true" className="text-ink-muted">
                    →
                  </span>
                  <span className="font-semibold text-ink-primary">
                    {item.betterAlternative}
                  </span>
                </div>
                <p className="text-xs text-ink-secondary">
                  {item.explanation}
                </p>
                <div className="text-xs text-ink-muted">
                  “{item.contextSnippet}” · {MODE_LABELS[item.mode]} ·{' '}
                  <span className="font-mono-tabular">{item.dateAdded}</span> ·{' '}
                  {item.mastered ? 'Mastered' : 'Practicing'}
                </div>
              </div>

              <div
                className="flex items-center gap-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onToggleMastered(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    item.mastered
                      ? 'border-status-success-border bg-status-success-soft text-status-success'
                      : 'btn-secondary'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{item.mastered ? 'Mastered' : 'Mark Mastered'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteVocab(item.id)}
                  aria-label={`Remove vocabulary item ${item.betterAlternative}`}
                  className="btn-ghost p-2 hover:text-status-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
