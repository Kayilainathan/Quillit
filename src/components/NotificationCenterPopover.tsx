import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BellOff,
  Check,
  Clock,
  Compass,
  PenLine,
  RotateCcw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import type { CalendarSlot } from '../types';
import type { DailyPracticeSuggestion } from '../utils/dailyPracticeCoach';
import type {
  DayNotificationSummary,
  NotificationFeedItem,
} from '../utils/notifications';

type NotificationTab = 'all' | 'tasks' | 'insights';

interface NotificationCenterPopoverProps {
  notificationSummary: DayNotificationSummary;
  notificationsEnabled: boolean;
  browserPermission: NotificationPermission | 'unsupported';
  dailySuggestion?: DailyPracticeSuggestion | null;
  hasDismissedOrSnoozed: boolean;
  onClose: () => void;
  onToggleNotifications: () => void;
  onOpenTask: (slot: CalendarSlot) => void;
  onOpenDashboard: () => void;
  onAcceptDailySuggestion?: (suggestion: DailyPracticeSuggestion) => void;
  onDismissItem: (id: string) => void;
  onSnoozeItem: (id: string) => void;
  onResetDismissed: () => void;
}

export const NotificationCenterPopover: React.FC<
  NotificationCenterPopoverProps
> = ({
  notificationSummary,
  notificationsEnabled,
  browserPermission,
  dailySuggestion,
  hasDismissedOrSnoozed,
  onClose,
  onToggleNotifications,
  onOpenTask,
  onOpenDashboard,
  onAcceptDailySuggestion,
  onDismissItem,
  onSnoozeItem,
  onResetDismissed,
}) => {
  const [tab, setTab] = useState<NotificationTab>('all');

  const taskItems = useMemo(
    () =>
      notificationSummary.items.filter(
        (item) => item.category === 'due-today' || item.category === 'overdue'
      ),
    [notificationSummary.items]
  );

  const insightItems = useMemo(
    () =>
      notificationSummary.items.filter(
        (item) =>
          item.category === 'daily-goal' ||
          item.category === 'pending-ai' ||
          item.category === 'streak'
      ),
    [notificationSummary.items]
  );

  const visibleItems: NotificationFeedItem[] = useMemo(() => {
    if (tab === 'tasks') return taskItems;
    if (tab === 'insights') return insightItems;
    return notificationSummary.items;
  }, [tab, taskItems, insightItems, notificationSummary.items]);

  return (
    <div
      role="region"
      aria-label="Notification center"
      data-testid="notification-center-popover"
      className="popover-panel popup-glass-surface drawer-reveal fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[404px] max-h-[78dvh] overflow-y-auto p-4 space-y-3 z-40"
    >
      {/* Header + Segmented Filter Tabs */}
      <div className="space-y-2.5 pb-2.5 border-b border-border-subtle">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink-primary">
              {notificationSummary.headline}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
              {notificationSummary.body}
            </p>
          </div>
          {hasDismissedOrSnoozed && (
            <button
              type="button"
              data-testid="notif-reset-dismissed"
              onClick={onResetDismissed}
              title="Restore dismissed or snoozed alerts"
              className="btn-ghost px-2 py-1 text-[10px] font-medium text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Restore</span>
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Filter notifications"
          className="flex items-center gap-1 p-0.5 rounded-md bg-subtle/80 border border-border-subtle"
        >
          {(
            [
              { id: 'all', label: 'All', count: notificationSummary.items.length },
              { id: 'tasks', label: 'Tasks', count: taskItems.length },
              { id: 'insights', label: 'Insights', count: insightItems.length },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`notif-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-surface text-ink-primary shadow-xs'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                <span>{item.label}</span>
                <span className="font-mono-tabular text-[10px] opacity-75">
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Daily Adaptive Coach Card */}
      {tab !== 'tasks' &&
        dailySuggestion &&
        !dailySuggestion.alreadyCompletedToday && (
          <button
            type="button"
            data-testid="notif-daily-suggestion-card"
            onClick={() => {
              onClose();
              onAcceptDailySuggestion?.(dailySuggestion);
            }}
            className="card-interactive w-full text-left p-3 space-y-1 bg-subtle/60"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-ink-muted uppercase tracking-[0.05em]">
              <span className="inline-flex items-center gap-1 text-ink-primary font-semibold">
                <Compass className="w-3 h-3" aria-hidden="true" />
                <span>{dailySuggestion.cadenceLabel}</span>
              </span>
              <span className="inline-flex items-center gap-0.5 card-arrow text-ink-primary font-medium normal-case">
                <span>{dailySuggestion.ctaLabel}</span>
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </span>
            </div>
            <div className="text-xs font-medium text-ink-primary leading-snug">
              {dailySuggestion.headline}
            </div>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              {dailySuggestion.rationale}
            </p>
          </button>
        )}

      {/* Feed Items (Full Unclipped Titles + Dismiss / Snooze Controls) */}
      {visibleItems.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
          {visibleItems.map((item) => {
            const isSlot = item.category === 'due-today' || item.category === 'overdue';
            const isGoal = item.category === 'daily-goal';
            const isPendingAi = item.category === 'pending-ai';

            return (
              <div
                key={item.id}
                data-testid={`notif-item-${item.id}`}
                className="rounded-md border border-border-subtle bg-subtle/50 p-3 space-y-2 transition-colors hover:border-border-default"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular uppercase tracking-[0.04em]">
                      {isGoal ? (
                        <Target className="w-3 h-3 text-status-success shrink-0" aria-hidden="true" />
                      ) : isPendingAi ? (
                        <Sparkles className="w-3 h-3 text-status-warning shrink-0" aria-hidden="true" />
                      ) : (
                        <Clock className="w-3 h-3 text-status-info shrink-0" aria-hidden="true" />
                      )}
                      <span
                        className={
                          item.category === 'due-today'
                            ? 'text-status-info font-semibold'
                            : isPendingAi
                              ? 'text-status-warning font-semibold'
                              : isGoal
                                ? 'text-status-success font-semibold'
                                : 'text-ink-muted font-medium'
                        }
                      >
                        {item.subtitle}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-ink-primary leading-snug break-words">
                      {item.title}
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`notif-dismiss-${item.id}`}
                    onClick={() => onDismissItem(item.id)}
                    aria-label={`Dismiss ${item.title}`}
                    title="Dismiss"
                    className="btn-ghost p-1 text-ink-muted hover:text-ink-primary shrink-0 -mt-0.5 -mr-1"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    data-testid={`notif-snooze-${item.id}`}
                    onClick={() => onSnoozeItem(item.id)}
                    className="btn-ghost px-2 py-1 text-[10px] font-medium text-ink-muted hover:text-ink-primary whitespace-nowrap"
                  >
                    Snooze 1d
                  </button>

                  {isSlot && item.slot && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTask(item.slot!);
                      }}
                      className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <PenLine className="w-3 h-3" aria-hidden="true" />
                      <span>{item.actionLabel || 'Write'}</span>
                    </button>
                  )}

                  {isPendingAi && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDashboard();
                      }}
                      className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    >
                      <span>{item.actionLabel || 'Open Dashboard'}</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-[11px] text-ink-muted">
          No alerts in this tab right now.
        </div>
      )}

      {/* Footer: Browser Alert Toggle */}
      <div className="pt-2.5 border-t border-border-subtle flex items-center justify-between gap-2">
        <div className="text-[11px] text-ink-muted">
          {browserPermission === 'denied'
            ? 'Browser alerts blocked in settings'
            : notificationsEnabled
              ? 'Day-of browser alerts active'
              : 'Get alerted on scheduled writing days'}
        </div>
        <button
          type="button"
          onClick={onToggleNotifications}
          disabled={browserPermission === 'unsupported'}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap disabled:opacity-50 ${
            notificationsEnabled
              ? 'border-status-success-border bg-status-success-soft text-status-success'
              : 'btn-secondary'
          }`}
        >
          {notificationsEnabled ? (
            <>
              <Check className="w-3 h-3" aria-hidden="true" />
              <span>Alerts On</span>
            </>
          ) : (
            <>
              <BellOff className="w-3 h-3" aria-hidden="true" />
              <span>Enable</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
