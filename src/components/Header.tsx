import { useEffect, useRef, useState } from 'react';
import type { AppView, CalendarSlot, ThemePreference } from '../types';
import type { DayNotificationSummary } from '../utils/notifications';
import {
  Bell,
  BellOff,
  BellRing,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  Laptop,
  Lock,
  Moon,
  PenLine,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react';
import { SwipeToLockDialog } from './SwipeToLockDialog';
import { QuillitLogo } from './QuillitLogo';
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
  onLockVault: () => void;
  cloudUserEmail?: string | null;
  cloudSyncStatus: CloudSyncState;
  onConnectCloud: () => void;
  localSessionCount?: number;
  weeklyCompletedCount?: number;
  weeklyTargetCount?: number;
  tactileSoundEnabled?: boolean;
  vaultLatchEnabled?: boolean;
  notificationSummary: DayNotificationSummary;
  notificationsEnabled: boolean;
  browserPermission: NotificationPermission | 'unsupported';
  onToggleNotifications: () => void;
  onOpenTaskFromNotification: (slot: CalendarSlot) => void;
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
  onLockVault,
  cloudUserEmail,
  cloudSyncStatus,
  onConnectCloud,
  localSessionCount = 0,
  weeklyCompletedCount = 0,
  weeklyTargetCount = 4,
  tactileSoundEnabled = false,
  vaultLatchEnabled = false,
  notificationSummary,
  notificationsEnabled,
  browserPermission,
  onToggleNotifications,
  onOpenTaskFromNotification,
  writeEvaluationState,
  converseStatus,
}: HeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
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
    <>
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

          {/* Right Quiet Utility Cluster */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Compact 10-Min Weekly Rhythm Indicator (unboxed tabular text) */}
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

            {/* 3-Way Theme Switcher (Light / Dark / Auto) */}
            <button
              type="button"
              data-testid="header-theme-toggle"
              onClick={() => {
                playTactileClick(tactileSoundEnabled);
                onCycleTheme();
              }}
              aria-label={`Theme: ${themeLabel}. Click to cycle theme`}
              title={`Theme: ${themeLabel} (click to switch)`}
              className="btn-secondary inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
            >
              {themePreference === 'system' ? (
                <Laptop className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              ) : resolvedTheme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-ink-primary" aria-hidden="true" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{themeLabel}</span>
            </button>

            {/* Day-of Notification Center */}
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-expanded={notifOpen}
                aria-label={
                  actionableCount > 0
                    ? `Writing reminders (${actionableCount} open)`
                    : 'Writing reminders'
                }
                className="btn-secondary relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
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
                <div
                  role="region"
                  aria-label="Day-of writing reminders"
                  className="popover-panel absolute right-0 mt-2 w-80 sm:w-96 p-4 space-y-3 z-40"
                >
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-border-subtle">
                    <div>
                      <div className="text-xs font-semibold text-ink-primary">
                        {notificationSummary.headline}
                      </div>
                      <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
                        {notificationSummary.body}
                      </p>
                    </div>
                  </div>

                  {actionableCount > 0 && (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {notificationSummary.dueTodayPending.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onOpenTaskFromNotification(slot);
                          }}
                          className="card-interactive w-full text-left p-3 space-y-1 bg-subtle"
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-status-info font-semibold">
                            <span>TODAY · 10 MIN</span>
                            <span className="inline-flex items-center gap-1 card-arrow text-ink-primary">
                              <PenLine className="w-3 h-3" aria-hidden="true" />
                              Write
                            </span>
                          </div>
                          <div className="text-xs font-medium text-ink-primary line-clamp-2">
                            {slot.topic}
                          </div>
                        </button>
                      ))}

                      {notificationSummary.overduePending.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onOpenTaskFromNotification(slot);
                          }}
                          className="card-interactive w-full text-left p-3 space-y-1 bg-subtle"
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-ink-secondary font-medium">
                            <span>STILL OPEN · 10 MIN · {slot.scheduledDate}</span>
                            <span className="inline-flex items-center gap-1 card-arrow text-ink-primary">
                              <PenLine className="w-3 h-3" aria-hidden="true" />
                              Open
                            </span>
                          </div>
                          <div className="text-xs font-medium text-ink-primary line-clamp-2">
                            {slot.topic}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-border-subtle flex items-center justify-between gap-2">
                    <div className="text-[11px] text-ink-muted">
                      {browserPermission === 'denied'
                        ? 'Browser alerts blocked in settings'
                        : notificationsEnabled
                          ? 'Day-of alerts active on scheduled days'
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
                          <Bell className="w-3 h-3" aria-hidden="true" />
                          <span>On</span>
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
              )}
            </div>

            {/* Cloud Sync Icon */}
            {cloudUserEmail ? (
              <button
                type="button"
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
                className="btn-secondary relative inline-flex items-center justify-center w-8 h-8 p-0 shrink-0"
              >
                {cloudSyncStatus === 'syncing' ? (
                  <RefreshCw
                    className="w-3.5 h-3.5 text-ink-secondary animate-spin"
                    aria-hidden="true"
                  />
                ) : cloudSyncStatus === 'workspace-fallback' ? (
                  <FileSpreadsheet
                    className="w-3.5 h-3.5 text-status-info"
                    aria-hidden="true"
                  />
                ) : (
                  <Cloud
                    className="w-3.5 h-3.5 text-ink-primary"
                    aria-hidden="true"
                  />
                )}
                {cloudSyncStatus !== 'syncing' && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                      cloudSyncStatus === 'workspace-fallback'
                        ? 'bg-status-info'
                        : 'bg-status-success'
                    }`}
                  />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectCloud}
                title="Sign in for Cloud Sync"
                aria-label="Sign in for Cloud Sync"
                className="btn-secondary inline-flex items-center justify-center w-8 h-8 p-0 shrink-0"
              >
                <CloudOff className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              </button>
            )}

            {/* Settings Gear (Desktop only; mobile has Settings in the nav strip) */}
            <button
              type="button"
              data-testid="header-settings-button"
              onClick={() => onNavigate('vault')}
              aria-label="Coach & Vault Settings"
              aria-current={activeView === 'vault' ? 'page' : undefined}
              title="Settings & Custom Coach"
              className={`hidden md:inline-flex items-center justify-center w-8 h-8 p-0 shrink-0 ${
                activeView === 'vault' ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {/* Mechanical Vault Latch Control */}
            <button
              type="button"
              data-testid="header-vault-latch"
              onClick={() => {
                playTactileClick(tactileSoundEnabled);
                setLockDialogOpen(true);
              }}
              aria-label="Lock studio session"
              title={
                vaultLatchEnabled
                  ? 'Vault Latch armed — click to lock desk'
                  : 'Lock desk & return to Entry'
              }
              className="btn-secondary inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span
                className="vault-latch-track"
                data-latched={vaultLatchEnabled ? 'true' : 'false'}
                aria-hidden="true"
              >
                <span className="vault-latch-thumb" />
              </span>
              <Lock className="w-3 h-3 text-ink-secondary hidden sm:inline" aria-hidden="true" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {/* Quiet Sync Bridge Strip when working locally with saved drafts/sessions */}
        {!cloudUserEmail && localSessionCount > 0 && (
          <div
            data-testid="local-sync-bridge"
            className="border-t border-border-subtle bg-subtle/65 px-4 sm:px-6 py-1.5"
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 text-[11px] text-ink-secondary">
              <span className="font-mono-tabular">
                {localSessionCount} local{' '}
                {localSessionCount === 1 ? 'entry' : 'entries'} on this device
              </span>
              <button
                type="button"
                onClick={onConnectCloud}
                className="inline-link-tactile font-medium text-ink-primary whitespace-nowrap cursor-pointer"
              >
                Sign in to sync across devices
              </button>
            </div>
          </div>
        )}

        {/* Compact minimal mobile navigation row */}
        <nav
          aria-label="Mobile navigation"
          className="flex md:hidden items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth-touch snap-x px-3 py-1.5 border-t border-border-subtle"
        >
          {[...PRIMARY_NAV_ITEMS, { id: 'vault' as AppView, label: 'Settings' }].map(
            (item) => {
              const isActive = activeView === item.id;
              const showRunning =
                !isActive &&
                ((item.id === 'write' && Boolean(writeEvaluationState?.inProgress)) ||
                  (item.id === 'converse' && Boolean(converseStatus?.inProgress)));
              const showReady =
                !isActive &&
                !showRunning &&
                ((item.id === 'write' && Boolean(writeEvaluationState?.hasUnreadResult)) ||
                  (item.id === 'converse' && Boolean(converseStatus?.hasUnreadResult)));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`snap-start inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-medium whitespace-nowrap shrink-0 rounded-md transition-all duration-150 ${
                    isActive
                      ? 'bg-accent text-ink-inverse shadow-xs'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
                  }`}
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
                </button>
              );
            }
          )}
        </nav>
      </header>

      <SwipeToLockDialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        onConfirmLock={onLockVault}
      />
    </>
  );
}
