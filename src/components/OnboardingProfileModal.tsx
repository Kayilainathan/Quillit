import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  Feather,
  Moon,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { StudentProfile, WritingMode } from '../types';

export interface OnboardingPreferencesPayload {
  profile: StudentProfile;
  rebuildMonthSchedule: boolean;
  notificationsEnabled: boolean;
  dailyWordGoal: number;
  liveOfflineCheck: boolean;
}

interface OnboardingProfileModalProps {
  initialProfile?: StudentProfile;
  initialNotificationsEnabled?: boolean;
  initialLiveOfflineCheck?: boolean;
  isEditingExisting?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onSave: (payload: OnboardingPreferencesPayload) => void;
  onClose?: () => void;
}

const WEEKDAYS: Array<{ index: number; short: string; full: string }> = [
  { index: 1, short: 'Mon', full: 'Monday' },
  { index: 2, short: 'Tue', full: 'Tuesday' },
  { index: 3, short: 'Wed', full: 'Wednesday' },
  { index: 4, short: 'Thu', full: 'Thursday' },
  { index: 5, short: 'Fri', full: 'Friday' },
  { index: 6, short: 'Sat', full: 'Saturday' },
  { index: 0, short: 'Sun', full: 'Sunday' },
];

const REMINDER_PRESETS: Array<{ label: string; time: string }> = [
  { label: 'Morning', time: '08:00' },
  { label: 'Evening', time: '18:30' },
  { label: 'Night', time: '21:00' },
];

const WORD_GOAL_OPTIONS: Array<{ words: number; label: string; caption: string }> = [
  { words: 150, label: '150w', caption: 'Quick' },
  { words: 250, label: '250w', caption: 'Balanced' },
  { words: 400, label: '400w', caption: 'Deep' },
];

const DEFAULT_MODE_OPTIONS: Array<{ id: WritingMode; label: string }> = [
  { id: 'journal', label: 'Journal' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'email', label: 'Email' },
  { id: 'technical', label: 'Technical' },
  { id: 'creative', label: 'Creative' },
];

export function OnboardingProfileModal({
  initialProfile,
  initialNotificationsEnabled = true,
  initialLiveOfflineCheck = true,
  isEditingExisting = false,
  theme = 'dark',
  onToggleTheme,
  onSave,
  onClose,
}: OnboardingProfileModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Flashcard 1 — Essentials only (Name, Age, College)
  const [displayName, setDisplayName] = useState(
    initialProfile?.displayName ?? ''
  );
  const [age, setAge] = useState(
    initialProfile?.age ? String(initialProfile.age) : ''
  );
  const [collegeName, setCollegeName] = useState(
    initialProfile?.collegeName ?? ''
  );

  // Flashcard 2 — Weekly schedule & helpful writing preferences
  const [preferredDays, setPreferredDays] = useState<number[]>(
    initialProfile?.preferredDays && initialProfile.preferredDays.length > 0
      ? initialProfile.preferredDays
      : [3, 5, 0] // Wed, Fri, Sun default
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initialNotificationsEnabled
  );
  const [reminderTime, setReminderTime] = useState(
    initialProfile?.reminderTime ?? '18:30'
  );
  const [targetWordGoal, setTargetWordGoal] = useState<number>(
    initialProfile?.targetWordGoal ?? 250
  );
  const [defaultMode, setDefaultMode] = useState<WritingMode>(
    initialProfile?.defaultMode ?? 'journal'
  );
  const [liveOfflineCheck, setLiveOfflineCheck] = useState(
    initialLiveOfflineCheck
  );
  const [rebuildSchedule, setRebuildSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic ink-fill progress (0..100) responding smoothly to field completion + step
  const inkPercent = useMemo(() => {
    const nameDone = displayName.trim().length >= 2 ? 1 : 0;
    const ageNum = Number(age.trim());
    const ageDone = Number.isInteger(ageNum) && ageNum >= 12 && ageNum <= 95 ? 1 : 0;
    const collegeDone = collegeName.trim().length >= 2 ? 1 : 0;
    const step1Score = ((nameDone + ageDone + collegeDone) / 3) * 50;

    if (step === 1) {
      return Math.max(12, Math.round(step1Score));
    }

    const daysDone = preferredDays.length > 0 ? 1 : 0;
    const step2Score = daysDone * 50;
    return Math.min(100, Math.round(50 + step2Score));
  }, [displayName, age, collegeName, step, preferredDays]);

  function toggleWeekday(dayIdx: number) {
    setError(null);
    setPreferredDays((prev) => {
      if (prev.includes(dayIdx)) {
        return prev.filter((d) => d !== dayIdx);
      }
      return [...prev, dayIdx];
    });
  }

  function validateStep1(): boolean {
    const trimmedName = displayName.trim();
    const parsedAge = Number(age.trim());
    const trimmedCollege = collegeName.trim();

    if (trimmedName.length < 2) {
      setError('Enter your name to personalize your studio.');
      return false;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 12 || parsedAge > 95) {
      setError('Enter a valid age between 12 and 95.');
      return false;
    }
    if (trimmedCollege.length < 2) {
      setError('Enter your college, school, or organization.');
      return false;
    }
    return true;
  }

  function handleNextStep(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateStep1()) return;
    setStep(2);
  }

  function handleSkipFromStep1() {
    setError(null);
    const parsedAge = Number(age.trim());
    const validAge =
      Number.isInteger(parsedAge) && parsedAge >= 12 && parsedAge <= 95
        ? parsedAge
        : initialProfile?.age ?? 0;

    onSave({
      profile: {
        displayName: displayName.trim(),
        age: validAge,
        collegeName: collegeName.trim(),
        collegeDegree: initialProfile?.collegeDegree ?? '',
        semester: initialProfile?.semester ?? '',
        onboardingCompleted: true,
        preferredDays:
          preferredDays.length > 0 ? preferredDays : [3, 5, 0],
        reminderTime,
        defaultMode,
        targetWordGoal,
      },
      rebuildMonthSchedule: false,
      notificationsEnabled,
      dailyWordGoal: targetWordGoal,
      liveOfflineCheck,
    });
  }

  function handleSkipFromStep2() {
    setError(null);
    const parsedAge = Number(age.trim());
    const validAge =
      Number.isInteger(parsedAge) && parsedAge >= 12 && parsedAge <= 95
        ? parsedAge
        : initialProfile?.age ?? 0;

    onSave({
      profile: {
        displayName: displayName.trim(),
        age: validAge,
        collegeName: collegeName.trim(),
        collegeDegree: initialProfile?.collegeDegree ?? '',
        semester: initialProfile?.semester ?? '',
        onboardingCompleted: true,
        preferredDays:
          preferredDays.length > 0 ? preferredDays : [3, 5, 0],
        reminderTime: initialProfile?.reminderTime ?? '18:30',
        defaultMode: initialProfile?.defaultMode ?? 'journal',
        targetWordGoal: initialProfile?.targetWordGoal ?? 250,
      },
      rebuildMonthSchedule: false,
      notificationsEnabled: false,
      dailyWordGoal: initialProfile?.targetWordGoal ?? 250,
      liveOfflineCheck: true,
    });
  }

  function handleFinalSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (preferredDays.length === 0) {
      setError('Pick at least one writing day in the week to build your schedule.');
      return;
    }

    onSave({
      profile: {
        displayName: displayName.trim(),
        age: Number(age.trim()),
        collegeName: collegeName.trim(),
        collegeDegree: initialProfile?.collegeDegree ?? '',
        semester: initialProfile?.semester ?? '',
        onboardingCompleted: true,
        preferredDays,
        reminderTime,
        defaultMode,
        targetWordGoal,
      },
      rebuildMonthSchedule: rebuildSchedule,
      notificationsEnabled,
      dailyWordGoal: targetWordGoal,
      liveOfflineCheck,
    });
  }

  const inkWellProgressHeader = (
    <div className="space-y-3" data-testid="ink-progress-indicator">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Animated Ink Well Reservoir */}
          <div
            className="relative w-9 h-9 rounded-lg border border-border-strong bg-subtle overflow-hidden flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-accent transition-all duration-500 ease-out"
              style={{ height: `${inkPercent}%`, opacity: 0.28 }}
            />
            <div
              className="absolute inset-x-0 h-[2px] bg-accent transition-all duration-500 ease-out"
              style={{ bottom: `calc(${inkPercent}% - 2px)` }}
            />
            <Feather className="relative z-10 w-4 h-4 text-ink-primary" />
          </div>

          <div>
            <div className="text-xs font-semibold text-ink-primary">
              {step === 1 ? 'Step 1 of 2 · About You' : 'Step 2 of 2 · Writing Rhythm'}
            </div>
            <div className="text-[11px] font-mono-tabular text-ink-muted">
              {inkPercent < 100
                ? `Filling ink · ${inkPercent}%`
                : 'Ink ready · Ready to write'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
            aria-label="Go to step 1"
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 1 ? 'w-6 bg-accent' : 'w-2 bg-border-strong'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              if (validateStep1()) {
                setError(null);
                setStep(2);
              }
            }}
            aria-label="Go to step 2"
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step === 2 ? 'w-6 bg-accent' : 'w-2 bg-border-default'
            }`}
          />
          {isEditingExisting && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile preferences"
              className="btn-ghost p-1 ml-1"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Creative Ink Stroke Line with Gliding Nib Tip */}
      <div
        role="progressbar"
        aria-label="Onboarding ink fill progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={inkPercent}
        className="relative h-1.5 rounded-full bg-subtle border border-border-subtle overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${inkPercent}%` }}
        />
      </div>
    </div>
  );

  const flashcardBody = (
    <div
      className={`card-surface w-full max-w-lg shadow-md ${
        step === 2 ? 'p-5 sm:p-6 space-y-4' : 'p-6 sm:p-8 space-y-6'
      }`}
    >
      {inkWellProgressHeader}

      {step === 1 ? (
        <form onSubmit={handleNextStep} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <h1
              id="onboarding-profile-title"
              className="font-display text-2xl sm:text-[28px] leading-tight font-medium tracking-tight text-ink-primary"
            >
              Before the first page
            </h1>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              Just three quick essentials so your writing studio feels like yours.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="onboarding-name"
                className="block text-xs font-medium text-ink-secondary"
              >
                Your Name
              </label>
              <input
                id="onboarding-name"
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g., Aarav"
                maxLength={80}
                autoFocus
                className="input-tactile w-full px-3.5 py-2.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5 sm:col-span-1">
                <label
                  htmlFor="onboarding-age"
                  className="block text-xs font-medium text-ink-secondary"
                >
                  Age
                </label>
                <input
                  id="onboarding-age"
                  type="number"
                  inputMode="numeric"
                  min={12}
                  max={95}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="21"
                  className="input-tactile w-full px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="onboarding-college"
                  className="block text-xs font-medium text-ink-secondary"
                >
                  College / University
                </label>
                <input
                  id="onboarding-college"
                  type="text"
                  value={collegeName}
                  onChange={(e) => {
                    setCollegeName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g., PSG College of Technology"
                  maxLength={140}
                  className="input-tactile w-full px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            {isEditingExisting && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost px-4 py-2.5 text-xs font-medium"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              data-testid="onboarding-step1-next"
              className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium"
            >
              <span>Next · Weekly Rhythm</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {!isEditingExisting && (
            <div className="pt-3 border-t border-border-subtle flex items-center justify-center">
              <button
                type="button"
                data-testid="onboarding-customise-later-step1"
                onClick={handleSkipFromStep1}
                className="group inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
              >
                <Feather
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-rotate-12 group-hover:text-ink-primary"
                  aria-hidden="true"
                />
                <span className="inline-link-tactile border-transparent group-hover:border-border-strong">
                  Skip my details · customise my notebook later
                </span>
              </button>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={handleFinalSubmit} className="space-y-3.5" noValidate>
          <div className="space-y-1">
            <h1
              id="onboarding-profile-title"
              className="font-display text-2xl sm:text-[26px] leading-tight font-medium tracking-tight text-ink-primary"
            >
              Shape your writing cadence
            </h1>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              Choose the days you want scheduled prompts and gentle reminders.
            </p>
          </div>

          {/* Aesthetic Weekly Day Picker */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-secondary">
                Weekly Writing Days ({preferredDays.length}/wk)
              </span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPreferredDays([3, 5, 0])}
                  className="inline-link-tactile text-ink-muted hover:text-ink-primary"
                >
                  3×/wk
                </button>
                <span className="text-ink-muted">·</span>
                <button
                  type="button"
                  onClick={() => setPreferredDays([1, 2, 3, 4, 5])}
                  className="inline-link-tactile text-ink-muted hover:text-ink-primary"
                >
                  Weekdays
                </button>
                <span className="text-ink-muted">·</span>
                <button
                  type="button"
                  onClick={() => setPreferredDays([1, 2, 3, 4, 5, 6, 0])}
                  className="inline-link-tactile text-ink-muted hover:text-ink-primary"
                >
                  Daily
                </button>
              </div>
            </div>

            <div
              role="group"
              aria-label="Choose weekly writing days"
              className="grid grid-cols-7 gap-1.5"
            >
              {WEEKDAYS.map((day) => {
                const active = preferredDays.includes(day.index);
                return (
                  <button
                    key={day.index}
                    type="button"
                    aria-pressed={active}
                    aria-label={day.full}
                    onClick={() => toggleWeekday(day.index)}
                    className={`relative flex flex-col items-center justify-center py-2.5 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-accent text-ink-inverse border-accent shadow-xs'
                        : 'bg-subtle text-ink-secondary border-border-default hover:border-border-strong hover:text-ink-primary'
                    }`}
                  >
                    <span>{day.short}</span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 w-1 h-1 rounded-full transition-opacity ${
                        active ? 'bg-ink-inverse opacity-90' : 'opacity-0'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reminder Notification & Preferred Time */}
          <div className="p-3 rounded-lg border border-border-subtle bg-subtle/65 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {notificationsEnabled ? (
                  <Bell className="w-3.5 h-3.5 text-ink-primary shrink-0" aria-hidden="true" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink-primary">
                    Day-of Writing Reminders
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    Gentle nudge on your selected days
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={() => setNotificationsEnabled((v) => !v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  notificationsEnabled
                    ? 'border-status-success-border bg-status-success-soft text-status-success'
                    : 'border-border-default bg-surface text-ink-muted'
                }`}
              >
                {notificationsEnabled ? 'On' : 'Off'}
              </button>
            </div>

            {notificationsEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle">
                <div className="flex flex-wrap items-center gap-1.5">
                  {REMINDER_PRESETS.map((preset) => {
                    const selected = reminderTime === preset.time;
                    return (
                      <button
                        key={preset.time}
                        type="button"
                        onClick={() => setReminderTime(preset.time)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-surface border-border-strong text-ink-primary'
                            : 'bg-transparent border-transparent text-ink-muted hover:text-ink-primary'
                        }`}
                      >
                        {preset.label} ·{' '}
                        <span className="font-mono-tabular">{preset.time}</span>
                      </button>
                    );
                  })}
                </div>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  aria-label="Custom reminder time"
                  className="input-tactile px-2.5 py-1 text-[11px] font-mono-tabular min-w-[132px] w-auto shrink-0"
                />
              </div>
            )}
          </div>

          {/* Helpful Studio Options: Word Goal, Default Style, Live Offline Check */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-ink-secondary">
                Session Word Goal
              </span>
              <div className="segmented-track grid grid-cols-3 gap-1">
                {WORD_GOAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.words}
                    type="button"
                    data-active={targetWordGoal === opt.words ? 'true' : 'false'}
                    onClick={() => setTargetWordGoal(opt.words)}
                    className="segmented-item py-1.5 text-[11px] text-center"
                  >
                    <span className="font-mono-tabular font-semibold block">
                      {opt.label}
                    </span>
                    <span className="text-[10px] opacity-75">{opt.caption}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-ink-secondary">
                Default Writing Style
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_MODE_OPTIONS.map((opt) => {
                  const active = defaultMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDefaultMode(opt.id)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-accent text-ink-inverse border-accent'
                          : 'bg-subtle text-ink-secondary border-border-default hover:border-border-strong'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-border-subtle bg-subtle/40 cursor-pointer select-none">
            <div className="min-w-0">
              <div className="text-xs font-medium text-ink-primary">
                Instant Offline Proofreader
              </div>
              <div className="text-[11px] text-ink-muted">
                Live spelling, grammar &amp; punctuation checks as you type (0 API tokens)
              </div>
            </div>
            <input
              type="checkbox"
              checked={liveOfflineCheck}
              onChange={(e) => setLiveOfflineCheck(e.target.checked)}
              className="w-4 h-4 rounded border-border-default accent-accent shrink-0"
            />
          </label>

          {isEditingExisting && (
            <label className="flex items-start gap-2.5 text-xs text-ink-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rebuildSchedule}
                onChange={(e) => setRebuildSchedule(e.target.checked)}
                className="mt-0.5 rounded border-border-default accent-accent"
              />
              <span>
                Also update upcoming 30-day calendar slots with these chosen writing days.
              </span>
            </label>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back</span>
            </button>

            <button
              type="submit"
              data-testid="onboarding-step2-submit"
              className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium"
            >
              {isEditingExisting ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Save Preferences</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>Dip Pen &amp; Start Writing</span>
                </>
              )}
            </button>
          </div>

          {!isEditingExisting && (
            <div className="pt-3 border-t border-border-subtle flex items-center justify-center">
              <button
                type="button"
                data-testid="onboarding-customise-later-step2"
                onClick={handleSkipFromStep2}
                className="group inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
              >
                <Feather
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-rotate-12 group-hover:text-ink-primary"
                  aria-hidden="true"
                />
                <span className="inline-link-tactile border-transparent group-hover:border-border-strong">
                  Skip rhythm &amp; goals · customise my notebook later
                </span>
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );

  // First-time onboarding renders alone on a calm, distraction-free full-screen canvas
  if (!isEditingExisting) {
    return (
      <div
        role="region"
        aria-labelledby="onboarding-profile-title"
        className="min-h-screen flex flex-col bg-canvas text-ink-primary"
      >
        <header className="w-full max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <span className="font-display text-xl font-semibold tracking-tight text-ink-primary">
            Quillit
          </span>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              )}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          )}
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
          {flashcardBody}
        </main>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-profile-title"
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
    >
      {flashcardBody}
    </div>
  );
}
