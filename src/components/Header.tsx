import { useEffect, useRef, useState } from 'react';
import type { AppView, CalendarSlot } from '../types';
import type { DayNotificationSummary } from '../utils/notifications';
import {
  Bell,
  BellOff,
  BellRing,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  Lock,
  Moon,
  PenLine,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { SwipeToLockDialog } from './SwipeToLockDialog';

export type CloudSyncState =
  | 'local'
  | 'syncing'
  | 'synced'
  | 'workspace-fallback'
  | 'error';

interface HeaderProps {
  activeView: AppView;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (view: AppView) => void;
  onLockVault: () => void;
  cloudUserEmail?: string | null;
  cloudSyncStatus: CloudSyncState;
  onConnectCloud: () => void;
  notificationSummary: DayNotificationSummary;
  notificationsEnabled: boolean;
  browserPermission: NotificationPermission | 'unsupported';
  onToggleNotifications: () => void;
  onOpenTaskFromNotification: (slot: CalendarSlot) => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'vault', label: 'Settings' },
];

export function Header({
  activeView,
  theme,
  onToggleTheme,
  onNavigate,
  onLockVault,
  cloudUserEmail,
  cloudSyncStatus,
  onConnectCloud,
  notificationSummary,
  notificationsEnabled,
  browserPermission,
  onToggleNotifications,
  onOpenTaskFromNotification,
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

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-canvas/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 sm:h-15 flex items-center justify-between gap-4 sm:gap-8">
        <button
          type="button"
          onClick={() => onNavigate('write')}
          className="font-display text-xl font-semibold tracking-tight text-ink-primary whitespace-nowrap shrink-0 rounded-md px-1 -ml-1 transition-colors hover:text-ink-secondary"
        >
          Quillit
        </button>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-1"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive ? 'true' : 'false'}
                className="nav-link-tactile relative px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0"
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-[14px] h-[2px] rounded-full bg-accent"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* Top-level Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="btn-secondary inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </span>
          </button>

          {/* Day-of Notification Center */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-expanded={notifOpen}
              aria-label={
                actionableCount > 0
                  ? `Writing reminders (${actionableCount} due)`
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

                {/* Actionable tasks list (today + past incomplete only) */}
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
                          <span>DUE TODAY · {slot.dayOfWeek.toUpperCase()}</span>
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
                        className="card-interactive w-full text-left p-3 space-y-1 bg-status-warning-soft border-status-warning-border"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-status-warning font-semibold">
                          <span>PAST UNFINISHED · {slot.scheduledDate}</span>
                          <span className="inline-flex items-center gap-1 card-arrow">
                            <PenLine className="w-3 h-3" aria-hidden="true" />
                            Catch up
                          </span>
                        </div>
                        <div className="text-xs font-medium text-ink-primary line-clamp-2">
                          {slot.topic}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Day-of browser notification toggle */}
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

          {/* Minimized Cloud Sync Indicator */}
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
                  : cloudSyncStatus === 'workspace-fallback'
                    ? `Synced via Google Sheets and Docs (${cloudUserEmail})`
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
              title="Connect Google Sync"
              aria-label="Connect Google Sync"
              className="btn-secondary inline-flex items-center justify-center w-8 h-8 p-0 shrink-0"
            >
              <CloudOff className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
            </button>
          )}

          {/* Tactile Lock Trigger -> opens Swipe-to-Lock confirmation */}
          <button
            type="button"
            onClick={() => setLockDialogOpen(true)}
            aria-label="Lock studio session"
            title="Lock studio"
            className="btn-secondary inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center gap-1 overflow-x-auto px-3 py-1.5 border-t border-border-subtle"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium whitespace-nowrap shrink-0 rounded-md transition-colors ${
                isActive
                  ? 'bg-accent text-ink-inverse'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-subtle'
              }`}
            >
              {item.label}
            </button>
          );
        })}
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
