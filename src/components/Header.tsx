import { useEffect, useRef, useState } from 'react';
import type { AppView, CalendarSlot, ThemePreference } from '../types';
import type { DayNotificationSummary } from '../utils/notifications';
import type { DailyPracticeSuggestion } from '../utils/dailyPracticeCoach';
import {
  Bell,
  BellRing,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  Laptop,
  Moon,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';
import { QuillitLogo } from './QuillitLogo';
import { NotificationCenterPopover } from './NotificationCenterPopover';
import { playTactileClick } from '../utils/tactileSound';

export type CloudSyncState =
  | 'local'
  | 'syncing'
  | 'synced'
  | 'workspace-fallback'
  | 'error';

interface HeaderProps {
  activeView: AppView;
  themePreference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  onCycleTheme: () => void;
  onNavigate: (view: AppView) => void;
  cloudUserEmail?: string | null;
  cloudSyncStatus: CloudSyncState;
  onConnectCloud: () => void;
  weeklyCompletedCount?: number;
  weeklyTargetCount?: number;
  tactileSoundEnabled?: boolean;
  notificationSummary: DayNotificationSummary;
  notificationsEnabled: boolean;
  browserPermission: NotificationPermission | 'unsupported';
  hasDismissedOrSnoozedNotifications?: boolean;
  onToggleNotifications: () => void;
  onOpenTaskFromNotification: (slot: CalendarSlot) => void;
  onDismissNotification?: (id: string) => void;
  onSnoozeNotification?: (id: string) => void;
  onResetDismissedNotifications?: () => void;
  dailySuggestion?: DailyPracticeSuggestion | null;
  onAcceptDailySuggestion?: (suggestion: DailyPracticeSuggestion) => void;
  writeEvaluationState?: {
    inProgress: boolean;
    hasUnreadResult: boolean;
  };
  converseStatus?: {
    inProgress: boolean;
    hasUnreadResult: boolean;
    hasActiveChat: boolean;
  };
}

const PRIMARY_NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'converse', label: 'Converse' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'vocabulary', label: 'Vocabulary' },
];

export function Header({
  activeView,
  themePreference,
  resolvedTheme,
  onCycleTheme,
  onNavigate,
  cloudUserEmail,
  cloudSyncStatus,
  onConnectCloud,
  weeklyCompletedCount = 0,
  weeklyTargetCount = 4,
  tactileSoundEnabled = false,
  notificationSummary,
  notificationsEnabled,
  browserPermission,
  hasDismissedOrSnoozedNotifications = false,
  onToggleNotifications,
  onOpenTaskFromNotification,
  onDismissNotification,
  onSnoozeNotification,
  onResetDismissedNotifications,
  dailySuggestion,
  onAcceptDailySuggestion,
  writeEvaluationState,
  converseStatus,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notifOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notifOpen]);

  const actionableCount = notificationSummary.totalActionable;
  const themeLabel =
    themePreference === 'system'
      ? 'Auto'
      : resolvedTheme === 'dark'
        ? 'Dark'
        : 'Light';

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-canvas/92 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-2.5 sm:gap-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onNavigate('write')}
          className="inline-flex items-center gap-2 font-display text-lg font-medium tracking-tight text-ink-primary whitespace-nowrap shrink-0 rounded-md px-1 -ml-1 transition-colors hover:text-ink-secondary cursor-pointer"
        >
          <QuillitLogo size="md" />
          <span>Quillit</span>
        </button>

        {/* Center 5-item Navigation */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-1"
        >
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            const showWriteRunning =
              item.id === 'write' &&
              !isActive &&
              Boolean(writeEvaluationState?.inProgress);
            const showWriteReady =
              item.id === 'write' &&
              !isActive &&
              !showWriteRunning &&
              Boolean(writeEvaluationState?.hasUnreadResult);
            const showConverseRunning =
              item.id === 'converse' &&
              !isActive &&
              Boolean(converseStatus?.inProgress);
            const showConverseReady =
              item.id === 'converse' &&
              !isActive &&
              !showConverseRunning &&
              Boolean(converseStatus?.hasUnreadResult);
            const showConverseActive =
              item.id === 'converse' &&
              !isActive &&
              !showConverseRunning &&
              !showConverseReady &&
              Boolean(converseStatus?.hasActiveChat);
            const showRunning = showWriteRunning || showConverseRunning;
            const showReady = showWriteReady || showConverseReady;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive ? 'true' : 'false'}
                title={
                  showWriteRunning
                    ? 'Evaluation running in background — return to Write'
                    : showWriteReady
                      ? 'Evaluation report ready in Write'
                      : showConverseRunning
                        ? 'Live chat activity in progress — return to Converse'
                        : showConverseReady
                          ? 'Conversation scorecard ready in Converse'
                          : showConverseActive
                            ? 'Live conversation in progress — return to Converse'
                            : undefined
                }
                className="nav-link-tactile relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0"
              >
                <span>{item.label}</span>
                {showRunning && (
                  <span
                    aria-label="Evaluation in progress"
                    className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                  />
                )}
                {showReady && (
                  <span
                    aria-label="Evaluation ready"
                    className="w-1.5 h-1.5 rounded-full bg-status-success"
                  />
                )}
                {showConverseActive && (
                  <span
                    aria-label="Active conversation"
                    className="w-1.5 h-1.5 rounded-full bg-ink-muted"
                  />
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="tab-indicator-slide absolute inset-x-3 -bottom-[15px] h-[2px] rounded-full bg-accent"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Quiet Utility Cluster (No Lock button, No cluttered badges) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Compact 10-Min Weekly Rhythm Indicator */}
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            data-testid="header-weekly-rhythm"
            title="10-min weekly writing cadence"
            className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono-tabular text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="font-semibold text-ink-primary">
              {weeklyCompletedCount}/{weeklyTargetCount}
            </span>
            <span className="text-ink-muted">this wk</span>
          </button>

          {/* 3-Way Theme Switcher */}
          <button
            type="button"
            data-testid="header-theme-toggle"
            onClick={() => {
              playTactileClick(tactileSoundEnabled);
              onCycleTheme();
            }}
            aria-label={`Theme: ${themeLabel}. Click to cycle theme`}
            title={`Theme: ${themeLabel} (click to switch)`}
            className="btn-ghost inline-flex items-center justify-center gap-1.5 min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 px-2 sm:px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
          >
            {themePreference === 'system' ? (
              <Laptop className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            ) : resolvedTheme === 'dark' ? (
              <Moon className="w-3.5 h-3.5 text-ink-primary" aria-hidden="true" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{themeLabel}</span>
          </button>

          {/* Redesigned Notification Center Trigger */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              data-testid="header-notifications-button"
              onClick={() => {
                playTactileClick(tactileSoundEnabled);
                setNotifOpen((v) => !v);
              }}
              aria-expanded={notifOpen}
              aria-label={
                actionableCount > 0
                  ? `Notifications (${actionableCount} active)`
                  : 'Notifications'
              }
              className={`inline-flex items-center justify-center gap-1 min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 px-2 sm:px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                notifOpen ? 'btn-secondary' : 'btn-ghost'
              }`}
            >
              {actionableCount > 0 ? (
                <BellRing
                  className="w-3.5 h-3.5 text-ink-primary"
                  aria-hidden="true"
                />
              ) : (
                <Bell className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              )}
              {actionableCount > 0 && (
                <span className="font-mono-tabular text-[11px] font-semibold text-ink-primary">
                  {actionableCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <NotificationCenterPopover
                notificationSummary={notificationSummary}
                notificationsEnabled={notificationsEnabled}
                browserPermission={browserPermission}
                dailySuggestion={dailySuggestion}
                hasDismissedOrSnoozed={hasDismissedOrSnoozedNotifications}
                onClose={() => setNotifOpen(false)}
                onToggleNotifications={onToggleNotifications}
                onOpenTask={onOpenTaskFromNotification}
                onOpenDashboard={() => onNavigate('dashboard')}
                onAcceptDailySuggestion={onAcceptDailySuggestion}
                onDismissItem={(id) => onDismissNotification?.(id)}
                onSnoozeItem={(id) => onSnoozeNotification?.(id)}
                onResetDismissed={() => onResetDismissedNotifications?.()}
              />
            )}
          </div>

          {/* Redesigned Quiet Monochrome Cloud Control (No Cluttered Floating Dot) */}
          {cloudUserEmail ? (
            <button
              type="button"
              data-testid="header-cloud-button"
              onClick={() => onNavigate('vault')}
              title={
                cloudSyncStatus === 'syncing'
                  ? `Syncing · ${cloudUserEmail}`
                  : cloudSyncStatus === 'workspace-fallback'
                    ? `Sheets & Docs Sync · ${cloudUserEmail}`
                    : `Cloud Synced · ${cloudUserEmail}`
              }
              aria-label={
                cloudSyncStatus === 'syncing'
                  ? 'Syncing to cloud'
                  : `Cloud synced (${cloudUserEmail})`
              }
              className="btn-ghost inline-flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 p-0 shrink-0"
            >
              {cloudSyncStatus === 'syncing' ? (
                <RefreshCw
                  className="w-3.5 h-3.5 text-ink-secondary animate-spin"
                  aria-hidden="true"
                />
              ) : cloudSyncStatus === 'workspace-fallback' ? (
                <FileSpreadsheet
                  className="w-3.5 h-3.5 text-ink-primary"
                  aria-hidden="true"
                />
              ) : (
                <Cloud
                  className="w-3.5 h-3.5 text-ink-primary"
                  aria-hidden="true"
                />
              )}
            </button>
          ) : (
            <button
              type="button"
              data-testid="header-cloud-button"
              onClick={onConnectCloud}
              title="Connect Cloud Sync"
              aria-label="Connect Cloud Sync"
              className="btn-ghost hidden sm:inline-flex items-center justify-center w-8 h-8 p-0 shrink-0"
            >
              <CloudOff className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
            </button>
          )}

          {/* Settings Gear */}
          <button
            type="button"
            data-testid="header-settings-button"
            onClick={() => onNavigate('vault')}
            aria-label="Settings & Coach"
            aria-current={activeView === 'vault' ? 'page' : undefined}
            title="Settings & Custom Coach"
            className={`inline-flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 p-0 shrink-0 ${
              activeView === 'vault' ? 'btn-primary' : 'btn-ghost'
            }`}
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
