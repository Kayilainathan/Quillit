import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
  Wand2,
  X,
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
  computeStreaks,
  formatLocalDateISO,
} from '../utils/analytics';
import { formatWritingDaysSummary } from '../utils/fastEvaluate';

const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function formatDayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  return FULL_WEEKDAYS[dt.getDay()] ?? 'Wednesday';
}

function formatMonthLabel(year: number, monthIndex0: number): string {
  const dt = new Date(year, monthIndex0, 1);
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getThisWeekBounds(todayISO: string): { start: string; end: string } {
  const [y, m, d] = todayISO.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  const mondayOffset = (dt.getDay() + 6) % 7;
  const start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - mondayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    start: formatLocalDateISO(start),
    end: formatLocalDateISO(end),
  };
}

interface MonthCalendarCell {
  dateISO: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  weekdayIndex: number;
}

function buildMonthCalendarGrid(
  year: number,
  monthIndex0: number,
  todayISO: string
): MonthCalendarCell[] {
  return buildMonthMatrix(year, monthIndex0).map((cell) => ({
    dateISO: cell.iso,
    dayNumber: cell.dayNum,
    inCurrentMonth: cell.inCurrentMonth,
    isToday: cell.iso === todayISO,
    weekdayIndex: cell.weekdayIndex,
  }));
}

interface CalendarViewProps {
  slots: CalendarSlot[];
  sessions: WritingSession[];
  todayISO: string;
  preferredDays?: number[];
  autoReloadSchedule: boolean;
  refreshingSchedule: boolean;
  scheduleError: string | null;
  onToggleAutoReloadSchedule: () => void;
  onRefreshTriWeeklySchedule: () => void;
  onLoadMonthTriWeekly: (year: number, monthIndex: number) => void;
  onRegenerateMonthWithAI: (
    year: number,
    monthIndex: number,
    focusTheme: string
  ) => Promise<void>;
  onAddSlot: (slot: CalendarSlot) => void;
  onUpdateSlot: (slot: CalendarSlot) => void;
  onSwapSingleSlot: (slotId: string) => void;
  onToggleSlotComplete: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onClearAllSlots: () => void;
  onLaunchSlotInStudio: (slot: CalendarSlot) => void;
  onOpenScheduledPopup: (slot: CalendarSlot) => void;
}

type CalendarSubView = 'month' | 'schedule' | 'tasks';
type TaskFilter = 'pending' | 'completed' | 'all';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_SLOT_DRAFT = {
  topic: '',
  mode: 'journal' as WritingMode,
  tone: 'conversational' as ToneSetting,
  targetWords: 200,
  topicPrimer: '',
};

function formatFriendlyDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function CalendarView({
  slots,
  sessions,
  todayISO,
  preferredDays,
  autoReloadSchedule,
  refreshingSchedule,
  scheduleError,
  onToggleAutoReloadSchedule,
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
  const [todayYear, todayMonth] = useMemo(() => {
    const [y, m] = todayISO.split('-').map(Number);
    return [y || new Date().getFullYear(), (m || 1) - 1];
  }, [todayISO]);

  const [subView, setSubView] = useState<CalendarSubView>('month');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('pending');
  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState(todayISO);

  // Clean inline composer / edit / AI plan states
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState(todayISO);
  const [draft, setDraft] = useState(DEFAULT_SLOT_DRAFT);

  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editMode, setEditMode] = useState<WritingMode>('journal');
  const [editTone, setEditTone] = useState<ToneSetting>('conversational');
  const [editTargetWords, setEditTargetWords] = useState(200);
  const [editPrimer, setEditPrimer] = useState('');

  const [showAiPlanBox, setShowAiPlanBox] = useState(false);
  const [aiFocusTheme, setAiFocusTheme] = useState('');
  const [generatingMonth, setGeneratingMonth] = useState(false);
  const [monthBanner, setMonthBanner] = useState<string | null>(null);

  // Writer's dynamic practice rhythm (adapts to whatever weekdays they chose)
  const rhythm = useMemo(
    () => formatWritingDaysSummary(preferredDays),
    [preferredDays]
  );

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status !== 'Draft'),
    [sessions]
  );

  const streakDays = useMemo(
    () => computeStreaks(completedSessions, todayISO).currentStreak,
    [completedSessions, todayISO]
  );

  const monthCells = useMemo(
    () => buildMonthCalendarGrid(viewYear, viewMonth, todayISO),
    [viewYear, viewMonth, todayISO]
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.scheduledDate) ?? [];
      list.push(slot);
      map.set(slot.scheduledDate, list);
    }
    return map;
  }, [slots]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WritingSession[]>();
    for (const s of completedSessions) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [completedSessions]);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    [slots]
  );

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const currentMonthSlots = useMemo(
    () => sortedSlots.filter((s) => s.scheduledDate.startsWith(monthKey)),
    [sortedSlots, monthKey]
  );

  // Weekly progress dynamically based on actual scheduled tasks + logged sessions this week
  const weekBounds = useMemo(() => getThisWeekBounds(todayISO), [todayISO]);
  const thisWeekStats = useMemo(() => {
    const inWeekSlots = slots.filter(
      (s) => s.scheduledDate >= weekBounds.start && s.scheduledDate <= weekBounds.end
    );
    const doneSlots = inWeekSlots.filter((s) => s.completed).length;
    const weekLoggedDates = new Set(
      completedSessions
        .filter((s) => s.date >= weekBounds.start && s.date <= weekBounds.end)
        .map((s) => s.date)
    );
    const completedCount = Math.max(doneSlots, weekLoggedDates.size);
    const targetCount = Math.max(inWeekSlots.length, rhythm.countPerWeek);
    return {
      completed: completedCount,
      target: targetCount,
      percentage:
        targetCount > 0
          ? Math.min(100, Math.round((completedCount / targetCount) * 100))
          : 0,
    };
  }, [slots, completedSessions, weekBounds, rhythm.countPerWeek]);

  const nextUpcomingSlot = useMemo(
    () =>
      sortedSlots.find(
        (s) => !s.completed && s.scheduledDate >= todayISO
      ) ?? null,
    [sortedSlots, todayISO]
  );

  const selectedDaySlots = slotsByDate.get(selectedDate) ?? [];
  const selectedDaySessions = sessionsByDate.get(selectedDate) ?? [];

  const filteredAllTasks = useMemo(() => {
    if (taskFilter === 'pending') return sortedSlots.filter((s) => !s.completed);
    if (taskFilter === 'completed') return sortedSlots.filter((s) => s.completed);
    return sortedSlots;
  }, [sortedSlots, taskFilter]);

  const pendingTotal = useMemo(
    () => slots.filter((s) => !s.completed).length,
    [slots]
  );
  const completedTotal = slots.length - pendingTotal;

  function stepMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setMonthBanner(null);
  }

  function jumpToToday() {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDate(todayISO);
  }

  function openAddForDate(dateISO: string) {
    setAddDate(dateISO);
    setDraft(DEFAULT_SLOT_DRAFT);
    setShowAddForm(true);
  }

  function handleCreateSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.topic.trim()) return;
    onAddSlot({
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      scheduledDate: addDate,
      dayOfWeek: formatDayName(addDate),
      slotLabel: MODE_LABELS[draft.mode],
      slotTime: '18:19',
      mode: draft.mode,
      tone: draft.tone,
      promptCategory: MODE_LABELS[draft.mode],
      topic: draft.topic.trim(),
      topicPrimer: draft.topicPrimer.trim() || undefined,
      targetWords: Math.max(50, Math.min(2000, Number(draft.targetWords) || 200)),
      completed: false,
    });
    setDraft(DEFAULT_SLOT_DRAFT);
    setShowAddForm(false);
    setSelectedDate(addDate);
  }

  function startEditing(slot: CalendarSlot) {
    setEditingSlotId(slot.id);
    setEditTopic(slot.topic);
    setEditDate(slot.scheduledDate);
    setEditMode(slot.mode);
    setEditTone(slot.tone);
    setEditTargetWords(slot.targetWords || 200);
    setEditPrimer(slot.topicPrimer || '');
  }

  function saveEdit(slot: CalendarSlot) {
    if (!editTopic.trim()) return;
    onUpdateSlot({
      ...slot,
      topic: editTopic.trim(),
      scheduledDate: editDate || slot.scheduledDate,
      dayOfWeek: formatDayName(editDate || slot.scheduledDate),
      mode: editMode,
      tone: editTone,
      targetWords: Math.max(50, Math.min(2000, Number(editTargetWords) || 200)),
      topicPrimer: editPrimer.trim() || undefined,
    });
    setEditingSlotId(null);
  }

  async function handleGenerateAiMonth(e: React.FormEvent) {
    e.preventDefault();
    setGeneratingMonth(true);
    setMonthBanner(null);
    try {
      await onRegenerateMonthWithAI(viewYear, viewMonth, aiFocusTheme.trim());
      setMonthBanner(
        `Fresh writing plan ready for ${formatMonthLabel(viewYear, viewMonth)}.`
      );
      setShowAiPlanBox(false);
      setAiFocusTheme('');
    } finally {
      setGeneratingMonth(false);
    }
  }

  return (
    <div
      data-testid="writing-calendar-view"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6"
    >
      {/* Editorial Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
            Writing Calendar
          </h1>
          <p className="text-xs text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-ink-secondary">{rhythm.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{rhythm.shortList}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAddForDate(selectedDate)}
            data-testid="calendar-add-task-button"
            className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Schedule Session</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAiPlanBox((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap ${
              showAiPlanBox ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>AI Plan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onLoadMonthTriWeekly(viewYear, viewMonth);
              setMonthBanner(
                `Filled ${formatMonthLabel(viewYear, viewMonth)} with writing slots.`
              );
            }}
            className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap"
          >
            <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Auto-Fill Month</span>
          </button>
        </div>
      </header>

      {/* Whisper-Quiet Summary Ribbon (Streak · Weekly Rhythm · Next Up) */}
      <section
        aria-label="Writing schedule summary"
        className="grid grid-cols-1 md:grid-cols-3 border-y border-border-subtle divide-y md:divide-y-0 md:divide-x divide-border-subtle bg-surface/55"
      >
        {/* Streak */}
        <div className="py-3.5 px-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
              Current Streak
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono-tabular text-xl font-semibold text-ink-primary">
                {streakDays}
              </span>
              <span className="text-xs text-ink-muted">
                {streakDays === 1 ? 'day' : 'days'}
              </span>
            </div>
          </div>
          <Flame
            className={`w-4 h-4 shrink-0 ${
              streakDays > 0 ? 'text-status-warning' : 'text-ink-muted/60'
            }`}
            aria-hidden="true"
          />
        </div>

        {/* This Week Progress */}
        <div className="py-3.5 px-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-[0.06em] text-ink-muted">
              This Week
            </span>
            <span className="font-mono-tabular font-medium text-ink-primary">
              {thisWeekStats.completed} / {thisWeekStats.target} sessions
            </span>
          </div>
          <div className="h-[5px] w-full rounded-full bg-border-subtle overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${thisWeekStats.percentage}%` }}
            />
          </div>
        </div>

        {/* Next Writing Slot */}
        <div className="py-3.5 px-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
              Next Session
            </div>
            {nextUpcomingSlot ? (
              <div className="mt-0.5 text-xs font-medium text-ink-primary truncate">
                {nextUpcomingSlot.scheduledDate === todayISO
                  ? 'Today'
                  : nextUpcomingSlot.scheduledDate}{' '}
                · {nextUpcomingSlot.topic}
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-ink-muted">
                Open schedule. Add a session anytime.
              </div>
            )}
          </div>
          {nextUpcomingSlot && (
            <button
              type="button"
              onClick={() => onLaunchSlotInStudio(nextUpcomingSlot)}
              className="btn-secondary px-2.5 py-1.5 text-[11px] font-medium shrink-0 inline-flex items-center gap-1"
            >
              <PenLine className="w-3 h-3" aria-hidden="true" />
              <span>Write</span>
            </button>
          )}
        </div>
      </section>

      {/* Optional AI Plan Drawer */}
      {showAiPlanBox && (
        <form
          onSubmit={handleGenerateAiMonth}
          className="card-surface p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-ink-primary">
                Generate {formatMonthLabel(viewYear, viewMonth)} Writing Plan
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Optional theme to tailor prompts across your writing days ({rhythm.shortList}).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAiPlanBox(false)}
              aria-label="Close AI plan generator"
              className="btn-ghost p-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={aiFocusTheme}
              onChange={(e) => setAiFocusTheme(e.target.value)}
              placeholder="e.g., Clear workplace emails, reflective essays, interview prep..."
              className="input-tactile flex-1 min-w-[220px] px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={generatingMonth}
              className="btn-primary px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {generatingMonth ? 'Building plan...' : 'Generate Plan'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Optional Add Task Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleCreateSlot}
          className="card-surface p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-primary">
              Schedule a Writing Session
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              aria-label="Close add session form"
              className="btn-ghost p-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Topic or Title
              </label>
              <input
                type="text"
                required
                value={draft.topic}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, topic: e.target.value }))
                }
                placeholder="What would you like to write about?"
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="input-tactile w-full px-3 py-2 text-xs font-mono-tabular"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Word Goal
              </label>
              <input
                type="number"
                min={50}
                max={2000}
                step={25}
                value={draft.targetWords}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    targetWords: Number(e.target.value) || 200,
                  }))
                }
                className="input-tactile w-full px-3 py-2 text-xs font-mono-tabular"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Mode
              </label>
              <select
                value={draft.mode}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    mode: e.target.value as WritingMode,
                  }))
                }
                className="input-tactile w-full px-3 py-2 text-xs"
              >
                {Object.entries(MODE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Tone
              </label>
              <select
                value={draft.tone}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    tone: e.target.value as ToneSetting,
                  }))
                }
                className="input-tactile w-full px-3 py-2 text-xs"
              >
                {Object.entries(TONE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Brief Note (optional)
              </label>
              <input
                type="text"
                value={draft.topicPrimer}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, topicPrimer: e.target.value }))
                }
                placeholder="Key angle or reminder..."
                className="input-tactile w-full px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="btn-ghost px-3 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-1.5 text-xs font-medium"
            >
              Add to Calendar
            </button>
          </div>
        </form>
      )}

      {(monthBanner || scheduleError) && (
        <div
          className={`px-3.5 py-2.5 rounded-md border text-xs flex items-center justify-between gap-3 ${
            scheduleError
              ? 'border-status-danger-border bg-status-danger-soft text-status-danger'
              : 'border-status-success-border bg-status-success-soft text-status-success'
          }`}
        >
          <span>{scheduleError || monthBanner}</span>
          <button
            type="button"
            onClick={() => setMonthBanner(null)}
            aria-label="Dismiss notice"
            className="btn-ghost p-0.5"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Clean View Switcher + Month Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Calendar views"
          className="segmented-track inline-flex items-center gap-1"
        >
          {(
            [
              { id: 'month', label: 'Month' },
              { id: 'schedule', label: `Schedule (${currentMonthSlots.length})` },
              { id: 'tasks', label: `All Tasks (${slots.length})` },
            ] as Array<{ id: CalendarSubView; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subView === tab.id}
              data-active={subView === tab.id ? 'true' : 'false'}
              onClick={() => setSubView(tab.id)}
              className="segmented-item px-3 py-1.5 text-xs whitespace-nowrap"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {subView !== 'tasks' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className="btn-secondary p-1.5"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="font-display text-base font-medium text-ink-primary min-w-[144px] text-center">
              {formatMonthLabel(viewYear, viewMonth)}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              className="btn-secondary p-1.5"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="btn-ghost px-2.5 py-1.5 text-xs font-medium ml-1"
            >
              Today
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: Clean Month Grid + Editorial Day Sheet Inspector */}
      {subView === 'month' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Month Grid */}
          <div className="lg:col-span-8 card-surface overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border-subtle bg-subtle/40">
              {WEEKDAY_HEADERS.map((day, idx) => {
                const isPreferred = rhythm.mondayFirstIndices.has(idx);
                return (
                  <div
                    key={day}
                    className={`py-2.5 px-2 text-center text-[11px] font-medium tracking-wide ${
                      isPreferred ? 'text-ink-primary' : 'text-ink-muted'
                    }`}
                  >
                    <span>{day}</span>
                    {isPreferred && (
                      <span
                        aria-label="Planned writing day"
                        className="inline-block w-1 h-1 rounded-full bg-accent ml-1 align-middle"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-border-subtle">
              {monthCells.map((cell) => {
                const daySlots = slotsByDate.get(cell.dateISO) ?? [];
                const daySessions = sessionsByDate.get(cell.dateISO) ?? [];
                const isSelected = selectedDate === cell.dateISO;
                const isPreferred = rhythm.mondayFirstIndices.has(cell.weekdayIndex);
                const hasDone =
                  daySessions.length > 0 ||
                  daySlots.some((s) => s.completed);
                const hasPending = daySlots.some((s) => !s.completed);

                return (
                  <button
                    key={cell.dateISO}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateISO)}
                    className={`relative min-h-[76px] sm:min-h-[86px] p-2 text-left flex flex-col justify-between transition-colors cursor-pointer ${
                      !cell.inCurrentMonth
                        ? 'bg-subtle/25 text-ink-muted/55'
                        : isPreferred
                          ? 'bg-surface'
                          : 'bg-surface/70'
                    } ${
                      isSelected
                        ? 'ring-2 ring-inset ring-accent bg-accent-soft/30'
                        : 'hover:bg-subtle/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono-tabular text-xs w-6 h-6 rounded-full inline-flex items-center justify-center ${
                          cell.isToday
                            ? 'bg-accent text-ink-inverse font-semibold'
                            : isSelected
                              ? 'font-semibold text-ink-primary'
                              : cell.inCurrentMonth
                                ? 'text-ink-primary'
                                : 'text-ink-muted/60'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {/* Subtle completion or scheduled ink indicators */}
                      <div className="flex items-center gap-1">
                        {hasDone && (
                          <span
                            title="Completed writing session"
                            className="w-1.5 h-1.5 rounded-full bg-status-success"
                          />
                        )}
                        {hasPending && (
                          <span
                            title="Scheduled writing task"
                            className="w-1.5 h-1.5 rounded-full bg-accent"
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 mt-1">
                      {daySlots.slice(0, 2).map((slot) => (
                        <div
                          key={slot.id}
                          className={`text-[10px] leading-tight truncate px-1.5 py-0.5 rounded-xs ${
                            slot.completed
                              ? 'bg-status-success-soft text-status-success line-through'
                              : 'bg-subtle text-ink-secondary'
                          }`}
                        >
                          {slot.topic}
                        </div>
                      ))}
                      {daySlots.length === 0 && daySessions.length > 0 && (
                        <div className="text-[10px] leading-tight truncate px-1.5 py-0.5 rounded-xs bg-status-success-soft text-status-success">
                          {daySessions[0].topicDescription}
                        </div>
                      )}
                      {daySlots.length > 2 && (
                        <div className="text-[10px] font-mono-tabular text-ink-muted pl-1">
                          +{daySlots.length - 2} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-border-subtle bg-subtle/30 flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-muted">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span>Scheduled</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
                  <span>Written</span>
                </span>
              </div>
              <span className="font-mono-tabular">
                Writing days: {rhythm.shortList}
              </span>
            </div>
          </div>

          {/* Right Day Sheet Inspector */}
          <aside className="lg:col-span-4 card-surface p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-border-subtle">
              <div>
                <div className="text-[11px] font-mono-tabular text-ink-muted">
                  {selectedDate === todayISO ? 'Today' : selectedDate}
                </div>
                <h2 className="font-display text-lg font-medium text-ink-primary mt-0.5">
                  {formatFriendlyDate(selectedDate)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => openAddForDate(selectedDate)}
                className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium shrink-0"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>

            {/* Scheduled Tasks for Selected Day */}
            {selectedDaySlots.length > 0 ? (
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                  Planned Sessions
                </div>
                {selectedDaySlots.map((slot) => {
                  const isEditing = editingSlotId === slot.id;
                  if (isEditing) {
                    return (
                      <div
                        key={slot.id}
                        className="p-3 rounded-md border border-border-default bg-subtle/50 space-y-2.5"
                      >
                        <input
                          type="text"
                          value={editTopic}
                          onChange={(e) => setEditTopic(e.target.value)}
                          className="input-tactile w-full px-2.5 py-1.5 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="input-tactile px-2 py-1 text-[11px] font-mono-tabular"
                          />
                          <input
                            type="number"
                            min={50}
                            max={2000}
                            value={editTargetWords}
                            onChange={(e) =>
                              setEditTargetWords(Number(e.target.value) || 200)
                            }
                            className="input-tactile px-2 py-1 text-[11px] font-mono-tabular"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editMode}
                            onChange={(e) =>
                              setEditMode(e.target.value as WritingMode)
                            }
                            className="input-tactile px-2 py-1 text-[11px]"
                          >
                            {Object.entries(MODE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editTone}
                            onChange={(e) =>
                              setEditTone(e.target.value as ToneSetting)
                            }
                            className="input-tactile px-2 py-1 text-[11px]"
                          >
                            {Object.entries(TONE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingSlotId(null)}
                            className="btn-ghost px-2.5 py-1 text-[11px]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(slot)}
                            className="btn-primary px-2.5 py-1 text-[11px]"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot.id}
                      className="p-3.5 rounded-md border border-border-subtle bg-subtle/30 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={`text-sm font-medium leading-snug ${
                              slot.completed
                                ? 'line-through text-ink-muted'
                                : 'text-ink-primary'
                            }`}
                          >
                            {slot.topic}
                          </div>
                          <div className="text-[11px] text-ink-muted mt-1 font-mono-tabular">
                            {MODE_LABELS[slot.mode]} · {TONE_LABELS[slot.tone]} ·{' '}
                            {slot.targetWords}w
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleSlotComplete(slot.id)}
                          aria-label={
                            slot.completed
                              ? 'Mark session incomplete'
                              : 'Mark session complete'
                          }
                          className={`p-1 rounded-sm transition-colors cursor-pointer ${
                            slot.completed
                              ? 'text-status-success'
                              : 'text-ink-muted hover:text-ink-primary'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>

                      {slot.topicPrimer && (
                        <p className="text-xs text-ink-secondary leading-relaxed">
                          {slot.topicPrimer}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/70">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onLaunchSlotInStudio(slot)}
                            className="btn-primary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
                          >
                            <PenLine className="w-3 h-3" aria-hidden="true" />
                            <span>Write</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenScheduledPopup(slot)}
                            title="Open quick-write popup"
                            className="btn-ghost p-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSwapSingleSlot(slot.id)}
                            title="Swap topic"
                            className="btn-ghost p-1"
                          >
                            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditing(slot)}
                            title="Edit session"
                            className="btn-ghost p-1"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSlot(slot.id)}
                            title="Delete session"
                            className="btn-ghost p-1 hover:text-status-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center space-y-2.5">
                <CalendarIcon
                  className="w-5 h-5 text-ink-muted mx-auto"
                  aria-hidden="true"
                />
                <p className="text-xs text-ink-muted">
                  Nothing scheduled for this day yet.
                </p>
                <button
                  type="button"
                  onClick={() => openAddForDate(selectedDate)}
                  className="btn-secondary px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>Plan a session</span>
                </button>
              </div>
            )}

            {/* Logged Sessions Written on Selected Day */}
            {selectedDaySessions.length > 0 && (
              <div className="pt-3 border-t border-border-subtle space-y-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                  Logged Writing
                </div>
                {selectedDaySessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-3 rounded-md border border-status-success-border/60 bg-status-success-soft/40 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink-primary truncate">
                        {session.topicDescription}
                      </span>
                      <span className="font-mono-tabular text-[11px] font-semibold text-status-success shrink-0">
                        {session.totalScore}/60
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-ink-muted">
                      {MODE_LABELS[session.mode]} · {session.wordCount}w ·{' '}
                      {session.cefrLevel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* VIEW 2: Monthly Schedule List */}
      {subView === 'schedule' && (
        <section className="card-surface overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle bg-subtle/40 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-ink-primary">
                {formatMonthLabel(viewYear, viewMonth)} Schedule
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                {currentMonthSlots.length}{' '}
                {currentMonthSlots.length === 1 ? 'session' : 'sessions'} planned across your chosen days ({rhythm.shortList}).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReloadSchedule}
                  onChange={onToggleAutoReloadSchedule}
                  className="rounded border-border-default accent-accent"
                />
                <span>Auto-refresh upcoming</span>
              </label>

              <button
                type="button"
                disabled={refreshingSchedule}
                onClick={onRefreshTriWeeklySchedule}
                className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshingSchedule ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>
                  {refreshingSchedule ? 'Refreshing...' : 'Refresh Upcoming'}
                </span>
              </button>
            </div>
          </div>

          {currentMonthSlots.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-3">
              <p className="text-sm text-ink-secondary">
                No sessions planned for {formatMonthLabel(viewYear, viewMonth)} yet.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onLoadMonthTriWeekly(viewYear, viewMonth)}
                  className="btn-primary px-3.5 py-2 text-xs font-medium"
                >
                  Auto-Fill Month
                </button>
                <button
                  type="button"
                  onClick={() => openAddForDate(selectedDate)}
                  className="btn-secondary px-3.5 py-2 text-xs font-medium"
                >
                  Add Custom Session
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {currentMonthSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-subtle/30 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleSlotComplete(slot.id)}
                      aria-label={
                        slot.completed ? 'Mark incomplete' : 'Mark complete'
                      }
                      className={`mt-0.5 w-4.5 h-4.5 rounded-sm border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        slot.completed
                          ? 'bg-status-success border-status-success text-ink-inverse'
                          : 'border-border-strong hover:border-accent'
                      }`}
                    >
                      {slot.completed && <Check className="w-3 h-3" aria-hidden="true" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-ink-muted">
                        <span className="font-medium text-ink-secondary">
                          {slot.dayOfWeek}, {slot.scheduledDate}
                        </span>
                        <span>·</span>
                        <span>{MODE_LABELS[slot.mode]}</span>
                        <span>·</span>
                        <span>{slot.targetWords}w</span>
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
                      {slot.topicPrimer && (
                        <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">
                          {slot.topicPrimer}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLaunchSlotInStudio(slot)}
                      className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                    >
                      <PenLine className="w-3 h-3" aria-hidden="true" />
                      <span>Write</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSwapSingleSlot(slot.id)}
                      title="Swap topic"
                      className="btn-ghost p-1.5"
                    >
                      <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSlot(slot.id)}
                      title="Delete session"
                      className="btn-ghost p-1.5 hover:text-status-danger"
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

      {/* VIEW 3: All Tasks */}
      {subView === 'tasks' && (
        <section className="card-surface overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle bg-subtle/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'pending', label: `Pending (${pendingTotal})` },
                  { id: 'completed', label: `Completed (${completedTotal})` },
                  { id: 'all', label: `All (${slots.length})` },
                ] as Array<{ id: TaskFilter; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTaskFilter(f.id)}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium cursor-pointer transition-colors ${
                    taskFilter === f.id
                      ? 'bg-accent text-ink-inverse'
                      : 'text-ink-secondary hover:bg-subtle'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {slots.length > 0 && (
              <button
                type="button"
                onClick={onClearAllSlots}
                className="btn-ghost px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-status-danger inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {filteredAllTasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-ink-muted">
              No writing sessions in this view yet.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {filteredAllTasks.map((slot) => (
                <div
                  key={slot.id}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-subtle/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleSlotComplete(slot.id)}
                      aria-label={
                        slot.completed ? 'Mark incomplete' : 'Mark complete'
                      }
                      className={`w-4.5 h-4.5 rounded-sm border flex items-center justify-center shrink-0 cursor-pointer ${
                        slot.completed
                          ? 'bg-status-success border-status-success text-ink-inverse'
                          : 'border-border-strong hover:border-accent'
                      }`}
                    >
                      {slot.completed && <Check className="w-3 h-3" aria-hidden="true" />}
                    </button>
                    <div className="min-w-0">
                      <div
                        className={`text-xs sm:text-sm font-medium truncate ${
                          slot.completed
                            ? 'line-through text-ink-muted'
                            : 'text-ink-primary'
                        }`}
                      >
                        {slot.topic}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-ink-muted">
                        {slot.scheduledDate} · {MODE_LABELS[slot.mode]} ·{' '}
                        {slot.targetWords}w
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLaunchSlotInStudio(slot)}
                      className="btn-secondary px-2.5 py-1 text-[11px] font-medium"
                    >
                      Write
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSlot(slot.id)}
                      aria-label="Delete task"
                      className="btn-ghost p-1 hover:text-status-danger"
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
