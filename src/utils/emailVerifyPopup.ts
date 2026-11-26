/**
 * Pure state helpers for the brief, non-intrusive email verification popup.
 * Replaces the persistent top warning banner with a quiet floating stationery
 * toast that auto-settles after 8 seconds (pausing on hover, focus, or action).
 */

export const EMAIL_VERIFY_POPUP_DURATION_MS = 8000;

export interface EmailVerifyPopupVisibilityInput {
  hasCloudUser: boolean;
  emailVerified: boolean;
  dismissedThisSession: boolean;
  suppressed: boolean;
  remainingMs: number;
}

/**
 * Generates a per-user sessionStorage dismissal key so the brief notice
 * appears once per sign-in session unless explicitly re-opened on sync attempt.
 */
export function getEmailVerifyDismissKey(uid: string): string {
  return `quillit_email_verify_popup_dismissed_${uid || 'anon'}`;
}

/**
 * Determines whether the brief verification popup should currently be rendered.
 */
export function shouldShowEmailVerifyPopup(
  input: EmailVerifyPopupVisibilityInput
): boolean {
  if (!input.hasCloudUser || input.emailVerified) return false;
  if (input.dismissedThisSession || input.suppressed) return false;
  return input.remainingMs > 0;
}

/**
 * Advances the brief auto-dismiss countdown cleanly, pausing while the user
 * hovers, focuses inside the popup, or triggers a resend/check action.
 */
export function tickEmailVerifyCountdown(
  remainingMs: number,
  deltaMs: number,
  paused: boolean
): { nextRemainingMs: number; expired: boolean } {
  if (paused || remainingMs <= 0) {
    return { nextRemainingMs: Math.max(0, remainingMs), expired: remainingMs <= 0 };
  }
  const next = Math.max(0, remainingMs - Math.max(0, deltaMs));
  return {
    nextRemainingMs: next,
    expired: next === 0,
  };
}

/**
 * Returns the normalized 0..1 progress ratio for the subtle hairline countdown rule.
 */
export function computeEmailVerifyTimerRatio(
  remainingMs: number,
  totalMs = EMAIL_VERIFY_POPUP_DURATION_MS
): number {
  if (totalMs <= 0) return 0;
  return Math.max(0, Math.min(1, remainingMs / totalMs));
}
