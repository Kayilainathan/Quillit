import React, { useEffect, useState } from 'react';
import { Check, Loader2, Mail, X } from 'lucide-react';
import {
  EMAIL_VERIFY_POPUP_DURATION_MS,
  computeEmailVerifyTimerRatio,
  shouldShowEmailVerifyPopup,
  tickEmailVerifyCountdown,
} from '../utils/emailVerifyPopup';

interface EmailVerifyPopupProps {
  visible: boolean;
  email: string | null;
  notice: string | null;
  busy: boolean;
  triggerNonce: number;
  onResend: () => void;
  onCheckVerified: () => void;
  onDismiss: () => void;
}

/**
 * Brief, aesthetic monochrome editorial popup for unverified email sign-ins.
 * Replaces the full-width top amber warning banner: fades in quietly, pauses on
 * hover/focus/action, and settles away automatically after 8 seconds so writing
 * stays uninterrupted.
 */
export const EmailVerifyPopup: React.FC<EmailVerifyPopupProps> = ({
  visible,
  email,
  notice,
  busy,
  triggerNonce,
  onResend,
  onCheckVerified,
  onDismiss,
}) => {
  const [remainingMs, setRemainingMs] = useState(EMAIL_VERIFY_POPUP_DURATION_MS);
  const [hoveredOrFocused, setHoveredOrFocused] = useState(false);

  // Reset the brief 8s window whenever the popup becomes visible or is explicitly re-triggered
  useEffect(() => {
    if (visible) {
      setRemainingMs(EMAIL_VERIFY_POPUP_DURATION_MS);
    }
  }, [visible, triggerNonce, notice]);

  useEffect(() => {
    if (!visible) return;
    const paused = hoveredOrFocused || busy;
    if (paused) return;

    const id = window.setInterval(() => {
      setRemainingMs((prev) => {
        const { nextRemainingMs, expired } = tickEmailVerifyCountdown(
          prev,
          100,
          false
        );
        if (expired) {
          window.setTimeout(() => onDismiss(), 0);
        }
        return nextRemainingMs;
      });
    }, 100);

    return () => window.clearInterval(id);
  }, [visible, hoveredOrFocused, busy, onDismiss]);

  const canRender = shouldShowEmailVerifyPopup({
    hasCloudUser: visible,
    emailVerified: false,
    dismissedThisSession: false,
    suppressed: false,
    remainingMs,
  });

  if (!canRender) {
    return null;
  }

  const ratio = computeEmailVerifyTimerRatio(
    remainingMs,
    EMAIL_VERIFY_POPUP_DURATION_MS
  );

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="email-verify-popup"
      onMouseEnter={() => setHoveredOrFocused(true)}
      onMouseLeave={() => setHoveredOrFocused(false)}
      onFocusCapture={() => setHoveredOrFocused(true)}
      onBlurCapture={() => setHoveredOrFocused(false)}
      className="post-eval-popup-enter mobile-floating-clearance fixed right-3 sm:right-4 left-3 sm:left-auto z-40 sm:w-[312px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-default/90 popup-glass-surface shadow-lg overflow-hidden"
    >
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="mt-0.5 w-6 h-6 rounded-md border border-border-subtle bg-subtle/70 text-ink-primary inline-flex items-center justify-center shrink-0"
            >
              <Mail className="w-3.5 h-3.5" />
            </span>

            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold text-ink-primary leading-snug">
                Confirm your email
              </p>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                {notice ||
                  `Verify ${email || 'your email'} to enable live cloud sync.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="email-verify-popup-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss email confirmation notice"
            className="btn-ghost p-1 text-ink-muted hover:text-ink-primary shrink-0 -mt-1 -mr-1"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            data-testid="email-verify-resend-btn"
            disabled={busy}
            onClick={onResend}
            className="px-2 py-1 text-[11px] font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Resend link
          </button>
          <button
            type="button"
            data-testid="email-verify-check-btn"
            disabled={busy}
            onClick={onCheckVerified}
            className="btn-primary inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
          >
            {busy ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                <span>Checking</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3" aria-hidden="true" />
                <span>I&apos;ve verified</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Whisper-slim auto-dismiss hairline rule */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-border-subtle/60 overflow-hidden"
      >
        <div
          className="h-full w-full origin-left bg-ink-primary/45 transition-transform duration-100 ease-linear"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </aside>
  );
};
