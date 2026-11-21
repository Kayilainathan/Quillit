import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Cloud,
  Feather,
  X,
} from 'lucide-react';
import { ManuscriptPasswordInput } from './ManuscriptPasswordInput';

interface OfflineMigrationModalProps {
  open: boolean;
  accountEmail: string | null;
  onMergeOfflineSpace: (
    passphrase: string,
    clearLocalAfterMerge: boolean
  ) => Promise<{
    addedSessions: number;
    addedVocab: number;
    addedSlots: number;
  }>;
  onKeepSeparate: () => void;
}

export function OfflineMigrationModal({
  open,
  accountEmail,
  onMergeOfflineSpace,
  onKeepSeparate,
}: OfflineMigrationModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [clearLocalAfterMerge, setClearLocalAfterMerge] = useState(true);
  const [inkActive, setInkActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergedSummary, setMergedSummary] = useState<{
    addedSessions: number;
    addedVocab: number;
    addedSlots: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setInkActive(false);
      setPassphrase('');
      setError(null);
      setMergedSummary(null);
      return;
    }
    const timer = window.setTimeout(() => setInkActive(true), 220);
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onKeepSeparate();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, busy, onKeepSeparate]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!passphrase.trim()) {
      setError('Enter your Offline Space passphrase to unlock those pages.');
      return;
    }
    setBusy(true);
    try {
      const summary = await onMergeOfflineSpace(
        passphrase,
        clearLocalAfterMerge
      );
      setMergedSummary(summary);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'That passphrase did not unlock your offline notebook. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-migration-title"
      data-testid="offline-migration-flashcard"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onKeepSeparate();
        }
      }}
    >
      <div
        className={`modal-panel w-full max-w-[430px] overflow-hidden ${
          inkActive ? 'ink-active' : ''
        }`}
        onMouseEnter={() => setInkActive(true)}
        onTouchStart={() => setInkActive(true)}
      >
        {/* Stationery Band: Local Notebook Gliding Gently to Cloud */}
        <div
          className="stationery-band relative px-6 pt-5 pb-4 border-b border-border-subtle bg-subtle/45 select-none"
          onClick={() => setInkActive((v) => !v)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <Cloud className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
              <span>Offline pages found on this browser</span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!busy) onKeepSeparate();
              }}
              aria-label="Close sync offline pages notice"
              className="btn-ghost p-1.5 -mr-1.5 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4" aria-hidden="true">
            <svg
              viewBox="0 0 260 48"
              className="w-full h-12 overflow-visible"
              fill="none"
            >
              {/* Local closed notebook on the left */}
              <rect
                x="14"
                y="11"
                width="26"
                height="30"
                rx="3"
                fill="var(--bg-surface)"
                stroke="var(--ink-primary)"
                strokeWidth="1.5"
              />
              <line
                x1="20"
                y1="11"
                x2="20"
                y2="41"
                stroke="var(--border-strong)"
                strokeWidth="1.2"
              />
              <line
                x1="24"
                y1="20"
                x2="35"
                y2="20"
                stroke="var(--ink-muted)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="24"
                y1="26"
                x2="33"
                y2="26"
                stroke="var(--ink-muted)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />

              {/* Sweeping dotted carry arc */}
              <path
                d="M 48 27 C 92 8, 152 8, 198 25"
                stroke="var(--ink-primary)"
                strokeWidth="1.6"
                strokeLinecap="round"
                className="glide-trail"
              />

              {/* Tiny folded manuscript note gliding along the arc */}
              <g transform="translate(108, 10)">
                <g className="glide-note">
                  <path
                    d="M 2 9 L 20 2 L 15 16 L 10 11 L 2 9 Z"
                    fill="var(--bg-surface)"
                    stroke="var(--ink-primary)"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </g>
              </g>

              {/* Soft cloud outline on the right */}
              <path
                d="M 212 35 H 239 C 244 35 247 31.5 247 27.5 C 247 23.8 244.3 20.8 240.8 20.3 C 239.7 15.2 235.2 11.5 229.8 11.5 C 223.8 11.5 218.9 16.1 218.5 22 C 214.6 22.5 211.5 25.8 211.5 29.8 C 211.5 32.7 211.7 35 212 35 Z"
                fill="var(--bg-surface)"
                stroke="var(--ink-primary)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          {mergedSummary ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg border border-status-success-border bg-status-success-soft flex items-center justify-center shrink-0">
                  <Check
                    className="w-4 h-4 text-status-success"
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-1">
                  <h2
                    id="offline-migration-title"
                    className="font-display text-xl font-medium text-ink-primary"
                  >
                    Your pages are now synced
                  </h2>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    Brought over{' '}
                    <span className="font-mono-tabular font-semibold text-ink-primary">
                      {mergedSummary.addedSessions}
                    </span>{' '}
                    {mergedSummary.addedSessions === 1 ? 'draft' : 'drafts'},{' '}
                    <span className="font-mono-tabular font-semibold text-ink-primary">
                      {mergedSummary.addedVocab}
                    </span>{' '}
                    vocabulary entries, and{' '}
                    <span className="font-mono-tabular font-semibold text-ink-primary">
                      {mergedSummary.addedSlots}
                    </span>{' '}
                    scheduled tasks into{' '}
                    <span className="font-medium text-ink-primary">
                      {accountEmail || 'your cloud account'}
                    </span>
                    .
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="offline-migration-done"
                onClick={onKeepSeparate}
                className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium"
              >
                <span>Open My Studio</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h2
                  id="offline-migration-title"
                  className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
                >
                  Bring your offline pages along?
                </h2>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  We noticed a private notebook saved on this browser. Unlock it once to blend those drafts, scores, and vocabulary into{' '}
                  <span className="font-medium text-ink-primary">
                    {accountEmail || 'your cloud account'}
                  </span>{' '}
                  without losing anything already in the cloud.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="migration-offline-passphrase"
                    className="block text-xs font-medium text-ink-secondary mb-1.5"
                  >
                    Offline Space Passphrase
                  </label>
                  <ManuscriptPasswordInput
                    id="migration-offline-passphrase"
                    value={passphrase}
                    onChange={(next) => {
                      setPassphrase(next);
                      if (error) setError(null);
                    }}
                    placeholder="Enter your saved offline passphrase"
                    autoComplete="current-password"
                    showValue={showPassphrase}
                    onToggleShow={() => setShowPassphrase((v) => !v)}
                    autoFocus
                  />
                </div>

                <label className="tactile-note-row flex items-start gap-2.5 px-2.5 py-2 -mx-2.5 text-xs text-ink-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearLocalAfterMerge}
                    onChange={(e) => setClearLocalAfterMerge(e.target.checked)}
                    className="mt-0.5 rounded border-border-default accent-accent"
                  />
                  <span>
                    Tidy up the separate offline copy on this browser once everything is safely synced to my cloud account.
                  </span>
                </label>

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                <div className="pt-1 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="offline-migration-confirm"
                    onMouseEnter={() => setInkActive(true)}
                    className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                  >
                    <Feather className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {busy ? 'Merging your pages...' : 'Merge & Sync to Cloud'}
                    </span>
                    {!busy && (
                      <ArrowRight
                        className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    data-testid="offline-migration-skip"
                    onClick={onKeepSeparate}
                    className="btn-ghost w-full px-4 py-2 text-xs font-medium whitespace-nowrap"
                  >
                    Keep them separate for now
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
