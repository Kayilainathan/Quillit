import { useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Flame,
  Lightbulb,
  PenLine,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CalendarSlot,
  ToneSetting,
  WritingMode,
  WritingSession,
} from '../types';
import {
  MODE_LABELS,
  TONE_LABELS,
  buildMonthMatrix,
  computeTaskStreak,
  deriveInternationalMetrics,
  getMonthTriWeeklyDates,
  parseISODate,
} from '../utils/analytics';

interface CalendarViewProps {
  slots: CalendarSlot[];
  sessions: WritingSession[];
  todayISO: string;
  autoReloadSchedule: boolean;
  refreshingSchedule: boolean;
  scheduleError: string | null;
  onToggleAutoReloadSchedule: () => void;
  onRefreshTriWeeklySchedule: () => void;
  onLoadMonthTriWeekly: (year: number, monthIndex0: number) => void;
  onRegenerateMonthWithAI: (
    year: number,
    monthIndex0: number,
    focusNote?: string
  ) => void;
  onAddSlot: (slot: CalendarSlot) => void;
  onUpdateSlot: (slot: CalendarSlot) => void;
  onSwapSingleSlot: (slotId: string) => void;
  onToggleSlotComplete: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onClearAllSlots?: () => void;
  onLaunchSlotInStudio: (slot: CalendarSlot) => void;
  onOpenScheduledPopup: (slot: CalendarSlot) => void;
}

function buildNextSevenDays(startISO: string): Array<{
  iso: string;
  weekdayShort: string;
  dayNum: string;
  isToday: boolean;
}> {
  const base = parseISODate(startISO);
  const result = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    result.push({
      iso,
      weekdayShort: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: String(dt.getDate()).padStart(2, '0'),
      isToday: i === 0,
    });
  }
  return result;
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Monday-first indices for Wednesday (2), Friday (4), Sunday (6)
const TRI_WEEKLY_INDICES = new Set([2, 4, 6]);

export function CalendarView({
  slots,
  sessions,
  todayISO,
  refreshingSchedule,
  scheduleError,
  onRefreshTriWeeklySchedule,
  onLoadMonthTriWeekly,
  onRegenerateMonthWithAI,
  onAddSlot,
  onUpdateSlot,
  onSwapSingleSlot,
  onToggleSlotComplete,
  onDeleteSlot,
  onClearAllSlots,
  onLaunchSlotInStudio,
  onOpenScheduledPopup,
}: CalendarViewProps) {
  const todayDate = parseISODate(todayISO);
  const [viewMode, setViewMode] = useState<'month' | 'monthly' | 'week' | 'list'>(
    'month'
  );
  const [displayYear, setDisplayYear] = useState(todayDate.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(todayDate.getMonth());
  const [selectedDateISO, setSelectedDateISO] = useState(todayISO);

  // Monthly Hub inline edit + AI focus state
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editPrimer, setEditPrimer] = useState('');
  const [editMode, setEditMode] = useState<WritingMode>('technical');
  const [editTone, setEditTone] = useState<ToneSetting>('academic-technical');
  const [editTargetWords, setEditTargetWords] = useState(200);
  const [monthFocusNote, setMonthFocusNote] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>(
    'all'
  );
  const [scheduledDate, setScheduledDate] = useState(todayISO);
  const [slotLabel, setSlotLabel] = useState('Slot 1 · Tech & Interview');
  const [mode, setMode] = useState<WritingMode>('technical');
  const [tone, setTone] = useState<ToneSetting>('academic-technical');
  const [topic, setTopic] = useState('');
  const [targetWords, setTargetWords] = useState(200);
  const [formError, setFormError] = useState<string | null>(null);

  const monthCells = useMemo(
    () => buildMonthMatrix(displayYear, displayMonth),
    [displayYear, displayMonth]
  );

  const monthTitle = useMemo(() => {
    const dt = new Date(displayYear, displayMonth, 1);
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [displayYear, displayMonth]);

  const monthPrefix = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}`;
  const expectedMonthDates = useMemo(
    () => getMonthTriWeeklyDates(displayYear, displayMonth),
    [displayYear, displayMonth]
  );

  const weekDays = useMemo(() => buildNextSevenDays(todayISO), [todayISO]);

  const sortedSlots = useMemo(
    () =>
      [...slots].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    [slots]
  );

  const monthlyTriSlots = useMemo(
    () =>
      sortedSlots.filter(
        (s) => s.scheduledDate.startsWith(monthPrefix) && s.isTriWeekly !== false
      ),
    [sortedSlots, monthPrefix]
  );

  const filteredSlots = useMemo(() => {
    return sortedSlots.filter((s) => {
      if (statusFilter === 'pending') return !s.completed;
      if (statusFilter === 'completed') return s.completed;
      return true;
    });
  }, [sortedSlots, statusFilter]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WritingSession[]>();
    for (const s of sessions) {
      if (s.status !== 'Completed') continue;
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  const taskStreak = useMemo(
    () => computeTaskStreak(slots, todayISO),
    [slots, todayISO]
  );

  const stats = useMemo(() => {
    const total = slots.length;
    const completedCount = slots.filter((s) => s.completed).length;
    const completionPct =
      total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const nextDue =
      sortedSlots.find((s) => !s.completed && s.scheduledDate >= todayISO) ??
      sortedSlots.find((s) => !s.completed) ??
      null;
    return { total, completedCount, completionPct, nextDue };
  }, [slots, sortedSlots, todayISO]);

  const selectedDaySlots = useMemo(
    () => sortedSlots.filter((s) => s.scheduledDate === selectedDateISO),
    [sortedSlots, selectedDateISO]
  );

  const selectedDaySessions = useMemo(
    () => sessionsByDate.get(selectedDateISO) ?? [],
    [sessionsByDate, selectedDateISO]
  );

  const selectedDayFormatted = useMemo(() => {
    const dt = parseISODate(selectedDateISO);
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDateISO]);

  function stepMonth(delta: number) {
    const dt = new Date(displayYear, displayMonth + delta, 1);
    setDisplayYear(dt.getFullYear());
    setDisplayMonth(dt.getMonth());
    setEditingSlotId(null);
  }

  function jumpToToday() {
    setDisplayYear(todayDate.getFullYear());
    setDisplayMonth(todayDate.getMonth());
    setSelectedDateISO(todayISO);
  }

  function openAddForDate(dateISO: string) {
    setScheduledDate(dateISO);
    setShowAddForm(true);
    setFormError(null);
  }

  function startEditingSlot(slot: CalendarSlot) {
    setEditingSlotId(slot.id);
    setEditTopic(slot.topic);
    setEditPrimer(slot.topicPrimer || '');
    setEditMode(slot.mode);
    setEditTone(slot.tone);
    setEditTargetWords(slot.targetWords);
  }

  function saveEditedSlot(slot: CalendarSlot) {
    if (!editTopic.trim()) return;
    onUpdateSlot({
      ...slot,
      topic: editTopic.trim(),
      topicPrimer: editPrimer.trim() || slot.topicPrimer,
      mode: editMode,
      tone: editTone,
      promptCategory: MODE_LABELS[editMode],
      targetWords: Math.max(50, Math.min(1500, Number(editTargetWords) || 200)),
    });
    setEditingSlotId(null);
  }

  function handleCreateSlot(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!topic.trim()) {
      setFormError('Describe the topic or writing goal for this scheduled slot.');
      return;
    }

    const dt = new Date(`${scheduledDate}T12:00:00`);
    const dayOfWeek = dt.toLocaleDateString('en-US', { weekday: 'long' });

    onAddSlot({
      id: `slot-${Date.now()}`,
      dayOfWeek,
      slotLabel: slotLabel.trim() || 'Slot 1',
      slotTime: '18:19',
      scheduledDate,
      mode,
      tone,
      promptCategory: MODE_LABELS[mode],
      topic: topic.trim(),
      targetWords: Math.max(50, Number(targetWords) || 200),
      completed: false,
    });

    setTopic('');
    setShowAddForm(false);
    setSelectedDateISO(scheduledDate);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
            Content Calendar &amp; Tri-Weekly Planner
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Wed · Fri · Sun tri-weekly rhythm combining technical interview clarity, career outreach, and creative storytelling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {slots.length > 0 && onClearAllSlots && (
            <button
              type="button"
              onClick={onClearAllSlots}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium hover:border-status-danger-border hover:text-status-danger whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear All Tasks</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshTriWeeklySchedule}
            disabled={refreshingSchedule}
            className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshingSchedule ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{refreshingSchedule ? 'Refreshing...' : 'Refresh Week AI'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showAddForm ? 'Close Form' : 'Schedule Slot'}</span>
          </button>
        </div>
      </div>

      {scheduleError && (
        <div
          role="alert"
          className="p-3 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
        >
          {scheduleError}
        </div>
      )}

      {/* Calendar Summary Strip */}
      <section
        aria-label="Schedule overview metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="card-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Flame className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
            <span>Task Streak</span>
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {taskStreak.currentTaskStreak}{' '}
            <span className="text-sm font-normal text-ink-muted">tasks</span>
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            Best: {taskStreak.longestTaskStreak} · {taskStreak.totalTasksCompleted} completed
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="text-xs text-ink-muted">
            This Week (Wed · Fri · Sun)
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono-tabular text-ink-primary">
            {taskStreak.weeklyCompleted}
            <span className="text-sm font-normal text-ink-muted">
              /{taskStreak.weeklyTarget}
            </span>
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-ink-muted">
            {stats.completionPct}% overall completion
          </div>
        </div>

        <div className="col-span-2 card-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-ink-secondary font-medium font-mono-tabular">
              {stats.nextDue
                ? stats.nextDue.scheduledDate === todayISO
                  ? 'Due Today'
                  : `Next Task · ${stats.nextDue.dayOfWeek} · ${stats.nextDue.scheduledDate}`
                : 'Schedule Clear'}
            </div>
            <div className="mt-1 text-sm font-medium text-ink-primary truncate">
              {stats.nextDue
                ? stats.nextDue.topic
                : 'All scheduled writing slots are complete.'}
            </div>
          </div>

          {stats.nextDue && (
            <button
              type="button"
              onClick={() => onOpenScheduledPopup(stats.nextDue!)}
              className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Write Now</span>
            </button>
          )}
        </div>
      </section>

      {showAddForm && (
        <form
          onSubmit={handleCreateSlot}
          className="card-surface p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-ink-primary">
            Add Scheduled Practice Task
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor="slot-date"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Date
              </label>
              <input
                id="slot-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label
                htmlFor="slot-label"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Slot Name
              </label>
              <input
                id="slot-label"
                type="text"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="Slot 1 · Tech & Interview"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label
                htmlFor="slot-mode"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Mode
              </label>
              <select
                id="slot-mode"
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

            <div>
              <label
                htmlFor="slot-tone"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Tone
              </label>
              <select
                id="slot-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneSetting)}
                className="input-tactile w-full px-3 py-2 text-xs"
              >
                {Object.entries(TONE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label
                htmlFor="slot-topic"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Topic Description
              </label>
              <input
                id="slot-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Explain thermocouple cold-junction compensation cleanly"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label
                htmlFor="slot-words"
                className="block text-xs font-medium text-ink-secondary mb-1"
              >
                Target Words
              </label>
              <input
                id="slot-words"
                type="number"
                min={50}
                max={1500}
                value={targetWords}
                onChange={(e) => setTargetWords(Number(e.target.value))}
                className="input-tactile w-full px-3 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>

          {formError && (
            <div
              role="alert"
              className="p-2.5 rounded-md bg-status-danger-soft border border-status-danger-border text-xs text-status-danger"
            >
              {formError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary px-4 py-2 text-xs font-medium"
            >
              Save Scheduled Slot
            </button>
          </div>
        </form>
      )}

      {/* Calendar View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Calendar display mode"
          className="segmented-track inline-flex flex-wrap items-center gap-1"
        >
          {(
            [
              { id: 'month', label: 'Month View' },
              { id: 'monthly', label: 'Monthly Tri-Weekly Tasks' },
              { id: 'week', label: '7-Day Board' },
              { id: 'list', label: 'Task Queue' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={viewMode === tab.id}
              data-active={viewMode === tab.id ? 'true' : 'false'}
              onClick={() => setViewMode(tab.id)}
              className="segmented-item px-3 py-1.5 text-xs whitespace-nowrap"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-ink-muted">
          Wed (Tech &amp; Interview) · Fri (LinkedIn &amp; Email) · Sun (Creative Story)
        </div>
      </div>

      {/* MONTH CALENDAR VIEW */}
      {viewMode === 'month' && (
        <section
          aria-label="Monthly writing calendar"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          <div className="lg:col-span-8 card-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg sm:text-xl font-medium text-ink-primary">
                  {monthTitle}
                </h2>
                <span className="text-xs text-ink-muted">
                  Wed · Fri · Sun highlighted
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepMonth(-1)}
                  aria-label="Previous month"
                  className="btn-secondary p-1.5"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="btn-secondary px-3 py-1.5 text-xs font-medium"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => stepMonth(1)}
                  aria-label="Next month"
                  className="btn-secondary p-1.5"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border-subtle bg-subtle">
              {WEEKDAY_HEADERS.map((wd, idx) => (
                <div
                  key={wd}
                  className={`py-2.5 text-center text-[11px] font-semibold tracking-wide ${
                    TRI_WEEKLY_INDICES.has(idx)
                      ? 'text-ink-primary'
                      : 'text-ink-muted'
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-border-subtle">
              {monthCells.map((cell) => {
                const daySlots = sortedSlots.filter(
                  (s) => s.scheduledDate === cell.iso
                );
                const daySessions = sessionsByDate.get(cell.iso) ?? [];
                const isToday = cell.iso === todayISO;
                const isSelected = cell.iso === selectedDateISO;
                const totalDayWords = daySessions.reduce(
                  (acc, s) => acc + s.wordCount,
                  0
                );

                return (
                  <div
                    key={cell.iso}
                    onClick={() => setSelectedDateISO(cell.iso)}
                    className={`min-h-[98px] p-2 flex flex-col justify-between gap-1 cursor-pointer transition-colors ${
                      !cell.inCurrentMonth
                        ? 'bg-subtle/50 text-ink-muted'
                        : isSelected
                          ? 'bg-accent-soft'
                          : 'bg-surface hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateISO(cell.iso);
                        }}
                        aria-label={`Select ${cell.iso}`}
                        className={`w-6 h-6 rounded-sm text-xs font-mono-tabular flex items-center justify-center transition-colors cursor-pointer ${
                          isToday
                            ? 'bg-accent text-ink-inverse font-semibold'
                            : isSelected
                              ? 'ring-1 ring-accent text-ink-primary font-semibold'
                              : cell.inCurrentMonth
                                ? 'text-ink-primary'
                                : 'text-ink-muted'
                        }`}
                      >
                        {cell.dayNum}
                      </button>

                      {totalDayWords > 0 && (
                        <span className="text-[10px] font-mono-tabular text-status-success">
                          {totalDayWords}w
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {daySlots.slice(0, 2).map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDateISO(cell.iso);
                            onOpenScheduledPopup(slot);
                          }}
                          title={slot.topic}
                          className={`w-full text-left px-1.5 py-1 rounded-sm text-[10px] leading-tight truncate border transition-colors cursor-pointer ${
                            slot.completed
                              ? 'border-status-success-border bg-status-success-soft text-status-success line-through'
                              : slot.mode === 'creative'
                                ? 'border-status-warning-border bg-status-warning-soft text-ink-primary hover:border-border-strong'
                                : 'border-border-default bg-subtle text-ink-primary hover:border-border-strong'
                          }`}
                        >
                          {slot.completed ? '✓ ' : ''}
                          {slot.topic}
                        </button>
                      ))}
                      {daySlots.length > 2 && (
                        <div className="text-[10px] font-mono-tabular text-ink-muted pl-1">
                          +{daySlots.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 4 Cols: Selected Day & Task Inspector */}
          <aside className="lg:col-span-4 card-surface p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-border-subtle">
              <div>
                <div className="text-xs font-mono-tabular text-ink-muted">
                  {selectedDateISO === todayISO ? 'Today' : selectedDateISO}
                </div>
                <h2 className="font-display text-lg font-medium text-ink-primary mt-0.5">
                  {selectedDayFormatted}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => openAddForDate(selectedDateISO)}
                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Task</span>
              </button>
            </div>

            {selectedDaySlots.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-ink-muted">
                  No writing slot scheduled for {selectedDateISO}.
                </p>
                <button
                  type="button"
                  onClick={() => openAddForDate(selectedDateISO)}
                  className="inline-link-tactile text-xs font-medium cursor-pointer"
                >
                  Schedule a practice task for this day
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDaySlots.map((slot) => {
                  const isEditingInspector = editingSlotId === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className="p-3.5 rounded-md border border-border-subtle bg-subtle space-y-2.5"
                    >
                      {isEditingInspector ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTopic}
                            onChange={(e) => setEditTopic(e.target.value)}
                            aria-label="Edit selected day slot topic"
                            className="input-tactile w-full px-2.5 py-1.5 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={editMode}
                              onChange={(e) => setEditMode(e.target.value as WritingMode)}
                              aria-label="Edit selected day mode"
                              className="input-tactile px-2 py-1 text-[11px]"
                            >
                              {Object.entries(MODE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <select
                              value={editTone}
                              onChange={(e) => setEditTone(e.target.value as ToneSetting)}
                              aria-label="Edit selected day tone"
                              className="input-tactile px-2 py-1 text-[11px]"
                            >
                              {Object.entries(TONE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingSlotId(null)}
                              className="btn-secondary px-2.5 py-1 text-[11px]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditedSlot(slot)}
                              className="btn-primary px-2.5 py-1 text-[11px] font-medium"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[11px] font-medium text-ink-secondary flex items-center gap-1.5">
                                <span>{slot.slotLabel}</span>
                                <span>·</span>
                                <span className="font-mono-tabular">~{slot.targetWords}w</span>
                              </div>
                              <div
                                className={`text-sm font-medium mt-0.5 ${
                                  slot.completed
                                    ? 'line-through text-ink-muted'
                                    : 'text-ink-primary'
                                }`}
                              >
                                {slot.topic}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onToggleSlotComplete(slot.id)}
                              aria-label={
                                slot.completed
                                  ? `Mark "${slot.topic}" incomplete`
                                  : `Mark "${slot.topic}" complete`
                              }
                              className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                slot.completed
                                  ? 'bg-status-success border-status-success text-ink-inverse'
                                  : 'border-border-default hover:border-border-strong'
                              }`}
                            >
                              {slot.completed && (
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>

                          {slot.topicPrimer && (
                            <p className="text-[11px] text-ink-secondary leading-relaxed">
                              {slot.topicPrimer}
                            </p>
                          )}

                          {slot.suggestions && slot.suggestions.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-border-subtle">
                              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary">
                                <Lightbulb
                                  className="w-3 h-3 text-ink-muted"
                                  aria-hidden="true"
                                />
                                <span>Writing Suggestions</span>
                              </div>
                              <ul className="space-y-0.5 text-[11px] text-ink-secondary list-disc pl-4">
                                {slot.suggestions.map((tip, i) => (
                                  <li key={i}>{tip}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onOpenScheduledPopup(slot)}
                              className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
                            >
                              <PenLine className="w-3 h-3" aria-hidden="true" />
                              <span>Quick Write</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onLaunchSlotInStudio(slot)}
                              className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              <span>Studio</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditingSlot(slot)}
                              className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                            >
                              <Edit3 className="w-3 h-3" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onSwapSingleSlot(slot.id)}
                              className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                            >
                              <Shuffle className="w-3 h-3" aria-hidden="true" />
                              <span>Swap</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedDaySessions.length > 0 && (
              <div className="pt-3 border-t border-border-subtle space-y-2">
                <h3 className="text-xs font-semibold text-ink-secondary">
                  Logged Sessions on {selectedDateISO}
                </h3>
                {selectedDaySessions.map((sess) => {
                  const intl = deriveInternationalMetrics(sess);
                  return (
                    <div
                      key={sess.id}
                      className="p-3 rounded-md border border-border-subtle bg-subtle text-xs space-y-0.5"
                    >
                      <div className="font-medium text-ink-primary">
                        {sess.topicDescription}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-ink-muted">
                        {sess.totalScore}/60 ({sess.percentage.toFixed(1)}%) · CEFR{' '}
                        {sess.cefrLevel} · IELTS {intl.ieltsBand.toFixed(1)} ·{' '}
                        {sess.wordCount}w
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </section>
      )}

      {/* MONTHLY LOADED TRI-WEEKLY TASKS VIEW (Inline Edit, Swap, Full Month Load, AI Performance Regeneration) */}
      {viewMode === 'monthly' && (
        <section
          aria-label="Monthly loaded tri-weekly tasks"
          className="space-y-4"
        >
          <div className="card-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => stepMonth(-1)}
                  aria-label="Previous month"
                  className="btn-secondary p-1.5"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-medium text-ink-primary">
                    {monthTitle} · Tri-Weekly Curriculum
                  </h2>
                  <p className="text-xs text-ink-muted font-mono-tabular">
                    {monthlyTriSlots.length} / {expectedMonthDates.length} Wed · Fri · Sun slots loaded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => stepMonth(1)}
                  aria-label="Next month"
                  className="btn-secondary p-1.5"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {monthlyTriSlots.length < expectedMonthDates.length && (
                  <button
                    type="button"
                    onClick={() => onLoadMonthTriWeekly(displayYear, displayMonth)}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Auto-Fill Month</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={refreshingSchedule}
                  onClick={() =>
                    onRegenerateMonthWithAI(
                      displayYear,
                      displayMonth,
                      monthFocusNote.trim() || undefined
                    )
                  }
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {refreshingSchedule
                      ? 'Generating Month...'
                      : 'AI Generate Month'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={monthFocusNote}
                onChange={(e) => setMonthFocusNote(e.target.value)}
                placeholder="Optional AI focus for this month (e.g., interview drills, cold outreach, vivid pacing)..."
                aria-label="Optional monthly AI focus note"
                className="input-tactile flex-1 min-w-[240px] px-3 py-2 text-xs"
              />
              <span className="text-[11px] text-ink-muted">
                Completed slots are preserved; pending slots adapt to your profile &amp; rubric.
              </span>
            </div>
          </div>

          {monthlyTriSlots.length === 0 ? (
            <div className="card-surface p-10 text-center space-y-3">
              <p className="text-sm text-ink-secondary">
                No tasks scheduled yet for {monthTitle}. Click Auto-Fill Month or generate a custom curriculum with AI.
              </p>
            </div>
          ) : (
            <div className="card-surface divide-y divide-border-subtle">
              {monthlyTriSlots.map((slot) => {
                const isEditing = editingSlotId === slot.id;
                return (
                  <div key={slot.id} className="row-tactile p-4 sm:p-5 space-y-3">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-ink-secondary">
                          <span>
                            Editing {slot.dayOfWeek} · {slot.scheduledDate}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingSlotId(null)}
                              className="btn-secondary px-2.5 py-1 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditedSlot(slot)}
                              className="btn-primary px-3 py-1 text-xs font-medium"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <input
                            type="text"
                            value={editTopic}
                            onChange={(e) => setEditTopic(e.target.value)}
                            aria-label="Edit slot topic"
                            className="input-tactile sm:col-span-2 px-3 py-2 text-xs"
                          />
                          <select
                            value={editMode}
                            onChange={(e) => setEditMode(e.target.value as WritingMode)}
                            aria-label="Edit slot mode"
                            className="input-tactile px-3 py-2 text-xs"
                          >
                            {Object.entries(MODE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <select
                              value={editTone}
                              onChange={(e) => setEditTone(e.target.value as ToneSetting)}
                              aria-label="Edit slot tone"
                              className="input-tactile flex-1 px-2.5 py-2 text-xs"
                            >
                              {Object.entries(TONE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={50}
                              max={1500}
                              value={editTargetWords}
                              onChange={(e) => setEditTargetWords(Number(e.target.value))}
                              aria-label="Edit target word count"
                              className="input-tactile w-20 px-2.5 py-2 text-xs font-mono-tabular"
                            />
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={editPrimer}
                          onChange={(e) => setEditPrimer(e.target.value)}
                          placeholder="Beginner-friendly topic primer..."
                          aria-label="Edit slot primer"
                          className="input-tactile w-full px-3 py-2 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => onToggleSlotComplete(slot.id)}
                            aria-label={
                              slot.completed
                                ? `Mark "${slot.topic}" incomplete`
                                : `Mark "${slot.topic}" complete`
                            }
                            className={`mt-1 w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                              slot.completed
                                ? 'bg-status-success border-status-success text-ink-inverse'
                                : 'border-border-default hover:border-border-strong'
                            }`}
                          >
                            {slot.completed && (
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono-tabular text-ink-muted">
                              <span className="font-semibold text-ink-primary">
                                {slot.scheduledDate} · {slot.dayOfWeek}
                              </span>
                              <span>·</span>
                              <span className="font-sans">{MODE_LABELS[slot.mode]}</span>
                              <span>·</span>
                              <span>~{slot.targetWords}w</span>
                              <span>·</span>
                              <span
                                className={
                                  slot.completed
                                    ? 'text-status-success font-semibold'
                                    : ''
                                }
                              >
                                {slot.completed ? 'Completed' : 'Pending'}
                              </span>
                            </div>

                            <div
                              className={`text-sm sm:text-base font-medium ${
                                slot.completed
                                  ? 'line-through text-ink-muted'
                                  : 'text-ink-primary'
                              }`}
                            >
                              {slot.topic}
                            </div>

                            {slot.topicPrimer && (
                              <p className="text-xs text-ink-secondary leading-relaxed max-w-3xl">
                                {slot.topicPrimer}
                              </p>
                            )}

                            {slot.feedbackReminder && (
                              <div className="text-[11px] text-status-warning">
                                Coach Focus: {slot.feedbackReminder}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-8 lg:pl-0">
                          <button
                            type="button"
                            onClick={() => startEditingSlot(slot)}
                            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSwapSingleSlot(slot.id)}
                            title="Swap topic locally (0 API tokens)"
                            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                          >
                            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Swap</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenScheduledPopup(slot)}
                            className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
                          >
                            <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Write</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onLaunchSlotInStudio(slot)}
                            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Studio</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 7-DAY WEEK BOARD */}
      {viewMode === 'week' && (
        <section
          aria-label="Upcoming 7-day writing schedule"
          className="card-surface p-5 space-y-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">
                7-Day Writing Board
              </h2>
              <p className="text-xs text-ink-muted">
                Click any scheduled card to write in a popup, or add a slot to any day.
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-ink-muted">
              {weekDays[0]?.iso} — {weekDays[6]?.iso}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            {weekDays.map((day) => {
              const daySlots = sortedSlots.filter(
                (s) => s.scheduledDate === day.iso
              );
              return (
                <div
                  key={day.iso}
                  className={`rounded-md border p-3 min-h-[140px] flex flex-col justify-between gap-2 ${
                    day.isToday
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-subtle bg-subtle'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">
                        <span
                          className={
                            day.isToday
                              ? 'text-ink-primary font-semibold'
                              : 'text-ink-muted'
                          }
                        >
                          {day.weekdayShort}
                        </span>{' '}
                        <span className="font-mono-tabular text-ink-primary">
                          {day.dayNum}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAddForDate(day.iso)}
                        aria-label={`Add scheduled task on ${day.iso}`}
                        className="btn-ghost p-1"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    {daySlots.length === 0 ? (
                      <div className="text-[11px] text-ink-muted pt-2">
                        Rest / free write
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => onOpenScheduledPopup(slot)}
                            className={`w-full text-left p-2 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                              slot.completed
                                ? 'border-status-success-border bg-status-success-soft text-ink-muted line-through'
                                : 'border-border-default bg-surface hover:border-border-strong text-ink-primary'
                            }`}
                          >
                            <div className="font-medium text-[10px] font-mono-tabular text-ink-secondary no-underline">
                              {MODE_LABELS[slot.mode].split(' ')[0]} · ~{slot.targetWords}w
                            </div>
                            <div className="line-clamp-2 mt-0.5 leading-snug">
                              {slot.topic}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* DETAILED QUEUE VIEW */}
      {viewMode === 'list' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-primary">
              All Scheduled Tasks
            </h2>

            <div
              role="tablist"
              aria-label="Filter scheduled slots"
              className="segmented-track flex items-center gap-1"
            >
              {(['all', 'pending', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab}
                  data-active={statusFilter === tab ? 'true' : 'false'}
                  onClick={() => setStatusFilter(tab)}
                  className="segmented-item px-3 py-1 text-xs capitalize"
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {filteredSlots.length === 0 ? (
            <div className="card-surface p-12 text-center text-sm text-ink-muted">
              No scheduled slots match this filter.
            </div>
          ) : (
            <div className="card-surface divide-y divide-border-subtle">
              {filteredSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="row-tactile p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <button
                      type="button"
                      onClick={() => onToggleSlotComplete(slot.id)}
                      aria-label={
                        slot.completed
                          ? `Mark "${slot.topic}" incomplete`
                          : `Mark "${slot.topic}" complete`
                      }
                      className={`mt-0.5 w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        slot.completed
                          ? 'bg-status-success border-status-success text-ink-inverse'
                          : 'border-border-default hover:border-border-strong'
                      }`}
                    >
                      {slot.completed && (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>

                    <div>
                      <div className="text-xs text-ink-muted flex flex-wrap items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="font-mono-tabular">{slot.scheduledDate}</span>
                        <span aria-hidden="true">·</span>
                        <span>{slot.dayOfWeek}</span>
                        <span aria-hidden="true">·</span>
                        <span>{slot.promptCategory}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          ~{slot.targetWords} words
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={slot.completed ? 'text-status-success font-medium' : ''}>
                          {slot.completed ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div
                        className={`mt-1 text-sm font-medium ${
                          slot.completed
                            ? 'line-through text-ink-muted'
                            : 'text-ink-primary'
                        }`}
                      >
                        {slot.topic}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 pl-8 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => onOpenScheduledPopup(slot)}
                      className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                    >
                      <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Quick Write</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLaunchSlotInStudio(slot)}
                      className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open Studio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSlot(slot.id)}
                      aria-label={`Delete scheduled slot "${slot.topic}"`}
                      className="btn-ghost p-2 hover:text-status-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
