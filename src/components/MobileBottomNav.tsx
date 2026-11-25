import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Calendar,
  MessageSquare,
  PenLine,
} from 'lucide-react';
import type { AppView } from '../types';
import {
  MOBILE_BOTTOM_NAV_ITEMS,
  isVirtualKeyboardLikelyOpen,
  shouldShowMobileBottomNav,
} from '../utils/mobileViewport';
import { playTactileClick } from '../utils/tactileSound';

interface MobileBottomNavProps {
  activeView: AppView;
  focusMode: boolean;
  tactileSoundEnabled?: boolean;
  onNavigate: (view: AppView) => void;
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

const NAV_ICONS: Record<string, typeof PenLine> = {
  write: PenLine,
  converse: MessageSquare,
  dashboard: BarChart3,
  calendar: Calendar,
  vocabulary: BookMarked,
};

export function MobileBottomNav({
  activeView,
  focusMode,
  tactileSoundEnabled = false,
  onNavigate,
  writeEvaluationState,
  converseStatus,
}: MobileBottomNavProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const baselineHeight = window.innerHeight;

    const handleResize = () => {
      const open = isVirtualKeyboardLikelyOpen(
        Math.max(baselineHeight, window.innerHeight),
        vv.height,
        window.innerWidth
      );
      setKeyboardOpen(open);
    };

    vv.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const visible = shouldShowMobileBottomNav({
    activeView,
    focusMode,
    keyboardOpen,
  });

  if (!visible) return null;

  return (
    <nav
      aria-label="Mobile bottom navigation"
      data-testid="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border-subtle bg-canvas/94 backdrop-blur-md mobile-bottom-nav-safe"
    >
      <div className="grid grid-cols-5 items-stretch h-[58px] max-w-lg mx-auto px-1">
        {MOBILE_BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.id] ?? PenLine;
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
          const showActiveChat =
            item.id === 'converse' &&
            !isActive &&
            !showRunning &&
            !showReady &&
            Boolean(converseStatus?.hasActiveChat);

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`mobile-tab-${item.id}`}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => {
                playTactileClick(tactileSoundEnabled);
                onNavigate(item.id);
              }}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg transition-colors cursor-pointer select-none active:scale-[0.95] ${
                isActive
                  ? 'text-ink-primary font-semibold'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="tab-indicator-slide absolute top-0 inset-x-3 h-[2px] rounded-b-full bg-accent"
                />
              )}

              <span className="relative inline-flex items-center justify-center">
                <Icon
                  className={`w-[19px] h-[19px] transition-transform duration-150 ${
                    isActive ? 'stroke-[2.25] scale-[1.04]' : 'stroke-[1.75]'
                  }`}
                  aria-hidden="true"
                />
                {showRunning && (
                  <span
                    aria-label="Evaluation in progress"
                    className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-accent animate-pulse"
                  />
                )}
                {showReady && (
                  <span
                    aria-label="Evaluation ready"
                    className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-status-success"
                  />
                )}
                {showActiveChat && (
                  <span
                    aria-label="Active conversation"
                    className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-ink-muted"
                  />
                )}
              </span>

              <span className="text-[10px] leading-none tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
