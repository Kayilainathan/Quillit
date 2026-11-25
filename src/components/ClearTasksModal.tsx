import { useState, type FormEvent } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, ShieldAlert, X } from 'lucide-react';

interface ClearTasksModalProps {
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  cloudConnected: boolean;
  onVerifyPassphrase: (passphrase: string) => Promise<boolean>;
  onConfirmedClear: () => void;
  onClose: () => void;
}

export function ClearTasksModal({
  totalCount,
  pendingCount,
  completedCount,
  cloudConnected,
  onVerifyPassphrase,
  onConfirmedClear,
  onClose,
}: ClearTasksModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Checked, setStep1Checked] = useState(false);
  const [step2Checked, setStep2Checked] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStep1Continue() {
    if (!step1Checked) {
      setError('Please check the first confirmation box before proceeding.');
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleStep2Submit(e: FormEvent) {
    e.preventDefault();
    if (!step2Checked) {
      setError('Please check the final confirmation box to clear all tasks.');
      return;
    }
    if (!passphrase.trim()) {
      setError('Enter your studio passphrase to authorize clearing all tasks.');
      return;
    }

    setError(null);
    setVerifying(true);
    try {
      const valid = await onVerifyPassphrase(passphrase);
      if (!valid) {
        setError('Incorrect studio passphrase. Scheduled tasks were not removed.');
        return;
      }
      onConfirmedClear();
      onClose();
    } catch {
      setError('Unable to verify passphrase. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-tasks-modal-title"
      className="modal-scrim fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="modal-panel mobile-sheet-panel max-w-md w-full max-h-[92dvh] overflow-y-auto rounded-b-none rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 safe-area-pb space-y-5">
        <div
          className="sm:hidden w-10 h-1 rounded-full bg-border-strong/80 mx-auto -mt-1 mb-1"
          aria-hidden="true"
        />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-status-danger">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Confirmation {step} of 2</span>
            </div>
            <h2
              id="clear-tasks-modal-title"
              className="font-display text-lg font-medium text-ink-primary"
            >
              {step === 1
                ? 'Clear All Scheduled Tasks?'
                : 'Final Confirmation & Passphrase'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel clearing tasks"
            className="btn-ghost p-1.5"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-3.5 rounded-lg border border-border-subtle bg-subtle space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-ink-primary font-medium">
            <span>Tasks scheduled for removal</span>
            <span className="font-mono-tabular">{totalCount} total</span>
          </div>
          <div className="text-ink-muted font-mono-tabular">
            {pendingCount} pending · {completedCount} completed
          </div>
          <p className="text-ink-secondary pt-1 leading-relaxed">
            {cloudConnected
              ? 'This permanently removes all scheduled tasks from your Offline Space and Google Cloud Sync. Your saved writing sessions and vocabulary are untouched.'
              : 'This permanently removes all scheduled tasks from your Offline Space. Your saved writing sessions and vocabulary are untouched.'}
          </p>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <label className="flex items-start gap-2.5 text-xs text-ink-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={step1Checked}
                onChange={(e) => {
                  setStep1Checked(e.target.checked);
                  if (error) setError(null);
                }}
                className="mt-0.5 rounded border-border-default accent-status-danger"
              />
              <span>
                Confirmation 1: I understand all {totalCount} scheduled calendar tasks will be removed and cannot be undone.
              </span>
            </label>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs text-status-danger bg-status-danger-soft border border-status-danger-border px-3 py-2 rounded-lg"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary px-3.5 py-2 text-xs font-medium"
              >
                Keep Tasks
              </button>
              <button
                type="button"
                onClick={handleStep1Continue}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-status-danger-border bg-status-danger-soft text-status-danger hover:bg-status-danger hover:text-white active:scale-[0.985] transition-all whitespace-nowrap"
              >
                Continue to Confirmation 2
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <label className="flex items-start gap-2.5 text-xs text-ink-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={step2Checked}
                onChange={(e) => {
                  setStep2Checked(e.target.checked);
                  if (error) setError(null);
                }}
                className="mt-0.5 rounded border-border-default accent-status-danger"
              />
              <span>
                Confirmation 2: Permanently delete all {totalCount} scheduled tasks now.
              </span>
            </label>

            <div className="space-y-1.5">
              <label
                htmlFor="clear-tasks-vault-password"
                className="block text-xs font-medium text-ink-secondary"
              >
                Enter Studio Passphrase
              </label>
              <div className="relative">
                <Lock
                  className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  id="clear-tasks-vault-password"
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Your studio passphrase"
                  autoComplete="current-password"
                  autoFocus
                  className="input-tactile w-full pl-8 pr-9 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase((s) => !s)}
                  aria-label={showPassphrase ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors"
                >
                  {showPassphrase ? (
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs text-status-danger bg-status-danger-soft border border-status-danger-border px-3 py-2 rounded-lg"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                disabled={verifying}
                className="btn-secondary px-3 py-2 text-xs font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-status-danger-border bg-status-danger-soft text-status-danger hover:bg-status-danger hover:text-white active:scale-[0.985] disabled:opacity-60 transition-all whitespace-nowrap"
              >
                {verifying ? 'Verifying...' : 'Permanently Clear Tasks'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
