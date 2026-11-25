import type { AppView } from '../types';

export interface MobileNavItem {
  id: AppView;
  label: string;
  ariaLabel: string;
}

export const MOBILE_BOTTOM_NAV_ITEMS: MobileNavItem[] = [
  { id: 'write', label: 'Write', ariaLabel: 'Write studio' },
  { id: 'converse', label: 'Converse', ariaLabel: 'Live conversation practice' },
  { id: 'dashboard', label: 'Progress', ariaLabel: 'Progress and fluency dashboard' },
  { id: 'calendar', label: 'Calendar', ariaLabel: 'Writing schedule calendar' },
  { id: 'vocabulary', label: 'Lexicon', ariaLabel: 'Personal vocabulary lexicon' },
];

/**
 * Detects whether a mobile software keyboard is likely open using the
 * Visual Viewport height relative to the layout viewport height.
 */
export function isVirtualKeyboardLikelyOpen(
  layoutHeight: number,
  visualHeight: number,
  viewportWidth: number
): boolean {
  if (viewportWidth >= 768) return false;
  if (layoutHeight <= 0 || visualHeight <= 0) return false;
  const heightDrop = layoutHeight - visualHeight;
  const ratio = visualHeight / layoutHeight;
  return heightDrop >= 140 && ratio < 0.78;
}

/**
 * Decides whether the mobile bottom navigation bar should be visible.
 * Hides cleanly during Write Focus Mode or when the mobile virtual keyboard
 * is open so it never floats awkwardly above the keyboard.
 */
export function shouldShowMobileBottomNav(params: {
  activeView: AppView;
  focusMode: boolean;
  keyboardOpen: boolean;
}): boolean {
  if (params.keyboardOpen) return false;
  if (params.activeView === 'write' && params.focusMode) return false;
  return true;
}

/**
 * Checks that combined fixed/sticky top + bottom chrome respects the 15%
 * mobile viewport height budget.
 */
export function computeStickyViewportRatio(
  topBarPx: number,
  bottomBarPx: number,
  viewportHeightPx: number
): number {
  if (viewportHeightPx <= 0) return 0;
  return (Math.max(0, topBarPx) + Math.max(0, bottomBarPx)) / viewportHeightPx;
}

/**
 * Formats a concise single-line summary for the collapsed mobile WriteStudio
 * setup bar (e.g. "Technical · Standard · Academic").
 */
export function formatMobileStudioSummary(params: {
  modeLabel: string;
  drillLabel: string;
  toneLabel: string;
  constraintShortLabel?: string | null;
  flowLockActive?: boolean;
}): string {
  const parts: string[] = [params.modeLabel];
  if (params.drillLabel && params.drillLabel !== 'Standard') {
    parts.push(params.drillLabel);
  }
  if (params.constraintShortLabel) {
    parts.push(params.constraintShortLabel);
  } else if (params.flowLockActive) {
    parts.push('3m Flow');
  } else if (params.toneLabel) {
    parts.push(params.toneLabel);
  }
  return parts.join(' · ');
}
