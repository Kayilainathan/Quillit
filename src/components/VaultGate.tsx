import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  Download,
  Feather,
  HardDrive,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import type { EncryptedEnvelope } from '../types';
import { ManuscriptPasswordInput } from './ManuscriptPasswordInput';
import { OfflineSpacePage, type OfflinePageMode } from './OfflineSpacePage';

type OfflineModalMode = 'none' | 'first-time' | 'returning' | 'overwrite-guard';

interface VaultGateProps {
  hasExistingVault: boolean;
  existingLocalEnvelope?: EncryptedEnvelope | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onCreateOfflineSpace: (
    passphrase: string,
    hint?: string
  ) => Promise<{ recoveryKey: string }>;
  onCompleteOfflineEntry: () => void;
  onUnlockVault: (passphrase: string) => Promise<void>;
  onRecoverWithKey: (
    recoveryKey: string,
    newPassphrase: string,
    newHint?: string
  ) => Promise<{ recoveryKey: string }>;
  onImportEncryptedBackup: (
    envelope: EncryptedEnvelope,
    passphrase: string
  ) => Promise<void>;
}

export function VaultGate({
  hasExistingVault,
  existingLocalEnvelope = null,
  theme,
  onToggleTheme,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onSendPasswordReset,
  onCreateOfflineSpace,
  onCompleteOfflineEntry,
  onUnlockVault,
  onRecoverWithKey,
  onImportEncryptedBackup,
}: VaultGateProps) {
  // Page stage: Page 1 (Cloud Sign In) vs Page 2 (Dedicated Offline Space page)
  const [pageStage, setPageStage] = useState<'cloud' | 'offline'>('cloud');
  const [offlineEntryMode, setOfflineEntryMode] = useState<
    Exclude<OfflinePageMode, 'recovery-kit'>
  >(hasExistingVault ? 'unlock' : 'create');

  // Cloud Email & Password form state
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // Context-aware Offline flashcards + Overwrite guard state
  const [offlineModalMode, setOfflineModalMode] =
    useState<OfflineModalMode>('none');
  const [flashcardInkActive, setFlashcardInkActive] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  const anyBusy = googleBusy || emailBusy || resetBusy;

  useEffect(() => {
    if (offlineModalMode === 'none') {
      setFlashcardInkActive(false);
      return;
    }
    setFlashcardInkActive(false);
    const introTimer = window.setTimeout(() => setFlashcardInkActive(true), 220);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOfflineModalMode('none');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(introTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [offlineModalMode]);

  function openOfflinePage(
    targetMode: Exclude<OfflinePageMode, 'recovery-kit'>
  ) {
    setOfflineModalMode('none');
    setError(null);
    setAuthNotice(null);
    setOfflineEntryMode(targetMode);
    setPageStage('offline');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  function openFreshSpaceGuard() {
    setOverwriteConfirmed(false);
    setBackupDownloaded(false);
    setOfflineModalMode('overwrite-guard');
  }

  function handleDownloadExistingRawBackup() {
    if (!existingLocalEnvelope) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(existingLocalEnvelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quillit_offline_backup_${dateStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  }

  async function handleGoogleClick() {
    setError(null);
    setAuthNotice(null);
    setGoogleBusy(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In could not be completed. Please try again.'
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAuthNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (emailMode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setEmailBusy(true);
    try {
      if (emailMode === 'signup') {
        await onEmailSignUp(trimmedEmail, password);
      } else {
        await onEmailSignIn(trimmedEmail, password);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Email sign-in could not be completed.'
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setAuthNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter your email address first to receive a password reset link.');
      return;
    }
    setResetBusy(true);
    try {
      await onSendPasswordReset(trimmedEmail);
      setAuthNotice(
        `Password reset email sent to ${trimmedEmail}. Check your inbox and spam folder.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send password reset email.'
      );
    } finally {
      setResetBusy(false);
    }
  }

  // Reusable Overwrite Guard Flashcard (accessible from both Returning Flashcard & Offline Space Page)
  const overwriteGuardModal =
    offlineModalMode === 'overwrite-guard' ? (
      <div
        className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="overwrite-guard-title"
        data-testid="overwrite-guard-flashcard"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setOfflineModalMode('none');
          }
        }}
      >
        <div
          className={`modal-panel w-full max-w-[430px] overflow-hidden ${
            flashcardInkActive ? 'ink-active' : ''
          }`}
          onMouseEnter={() => setFlashcardInkActive(true)}
          onTouchStart={() => setFlashcardInkActive(true)}
        >
          <div
            className="stationery-band relative px-6 pt-5 pb-4 border-b border-border-subtle bg-subtle/45 select-none"
            onClick={() => setFlashcardInkActive((v) => !v)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-[11px] font-medium text-status-warning">
                <Feather className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Protect your existing pages</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOfflineModalMode('none');
                }}
                aria-label="Close fresh space confirmation"
                className="btn-ghost p-1.5 -mr-1.5 -mt-1 shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Stacked Manuscript Folios SVG */}
            <div className="mt-4 flex justify-center" aria-hidden="true">
              <svg
                viewBox="0 0 140 50"
                className="w-36 h-12 overflow-visible"
                fill="none"
              >
                <g className="folio-back">
                  <rect
                    x="42"
                    y="8"
                    width="44"
                    height="34"
                    rx="3"
                    fill="var(--bg-subtle)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.3"
                  />
                </g>
                <g className="folio-front">
                  <rect
                    x="52"
                    y="10"
                    width="44"
                    height="34"
                    rx="3"
                    fill="var(--bg-surface)"
                    stroke="var(--ink-primary)"
                    strokeWidth="1.5"
                  />
                  <line x1="61" y1="20" x2="87" y2="20" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="61" y1="27" x2="83" y2="27" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="61" y1="34" x2="77" y2="34" stroke="var(--border-default)" strokeWidth="1.2" strokeLinecap="round" />
                </g>
              </svg>
            </div>
          </div>

          <div className="p-6 sm:p-7 space-y-5">
            <div className="space-y-2">
              <h2
                id="overwrite-guard-title"
                className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
              >
                Start a brand new notebook here?
              </h2>
              <p className="text-sm text-ink-secondary leading-relaxed">
                This browser already holds a saved Offline Space. Creating a fresh one replaces those local pages permanently unless you save an encrypted copy first.
              </p>
            </div>

            {existingLocalEnvelope && (
              <button
                type="button"
                data-testid="overwrite-download-backup"
                onClick={handleDownloadExistingRawBackup}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                  backupDownloaded
                    ? 'border-status-success-border bg-status-success-soft text-status-success'
                    : 'btn-secondary'
                }`}
              >
                {backupDownloaded ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Encrypted backup saved to your device</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save encrypted backup copy first (.json)</span>
                  </>
                )}
              </button>
            )}

            <label className="tactile-note-row flex items-start gap-2.5 px-2.5 py-2 -mx-2.5 text-xs text-ink-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="overwrite-confirm-checkbox"
                checked={overwriteConfirmed}
                onChange={(e) => setOverwriteConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-border-default accent-accent"
              />
              <span>
                I understand my existing offline notebook on this browser will be replaced.
              </span>
            </label>

            <div className="pt-1 flex flex-col gap-2">
              <button
                type="button"
                disabled={!overwriteConfirmed}
                data-testid="overwrite-confirm-proceed"
                onClick={() => openOfflinePage('create')}
                className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
              >
                <span>Create Fresh Space</span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                data-testid="overwrite-keep-existing"
                onClick={() => {
                  if (pageStage === 'offline') {
                    setOfflineModalMode('none');
                  } else {
                    setOfflineModalMode('returning');
                  }
                }}
                className="btn-ghost w-full px-4 py-2 text-xs font-medium whitespace-nowrap"
              >
                Keep my saved notebook
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  // PAGE 2: Dedicated Standalone Offline Space Page (Unlock, Create, Restore, Forgot Passphrase, Recovery Key)
  if (pageStage === 'offline') {
    return (
      <>
        <OfflineSpacePage
          initialMode={offlineEntryMode}
          hasExistingVault={hasExistingVault}
          existingLocalEnvelope={existingLocalEnvelope}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onBackToCloud={() => {
            setOfflineModalMode('none');
            setPageStage('cloud');
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }}
          onRequestFreshSpaceOverwrite={openFreshSpaceGuard}
          onCreateOfflineSpace={onCreateOfflineSpace}
          onCompleteOfflineEntry={onCompleteOfflineEntry}
          onUnlockVault={onUnlockVault}
          onRecoverWithKey={onRecoverWithKey}
          onImportEncryptedBackup={onImportEncryptedBackup}
        />
        {overwriteGuardModal}
      </>
    );
  }

  // PAGE 1 (Default): Clean Cloud Sign-In Page
  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-primary page-glide-enter">
      <header className="w-full max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <span className="font-display text-xl font-semibold tracking-tight text-ink-primary">
          Quillit
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
          )}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">
              Sign in to Quillit
            </h1>
            <p className="text-sm text-ink-secondary">
              Private writing studio synced across your devices
            </p>
          </div>

          <section
            aria-label="Account sign in"
            className="card-surface p-6 sm:p-7 space-y-5"
          >
            {/* Official Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={anyBusy}
              className="gsi-material-button"
              aria-label="Sign in with Google"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon" aria-hidden="true">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span>
                  {googleBusy ? 'Signing in with Google...' : 'Sign in with Google'}
                </span>
              </div>
            </button>

            {/* Clean Divider */}
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-border-subtle" />
              <span className="px-3 text-xs text-ink-muted">
                or continue with email
              </span>
              <div className="flex-1 border-t border-border-subtle" />
            </div>

            {/* Email Sign In / Create Account */}
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Email authentication mode"
                className="segmented-track grid grid-cols-2 gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={emailMode === 'signin'}
                  data-active={emailMode === 'signin' ? 'true' : 'false'}
                  onClick={() => {
                    setEmailMode('signin');
                    setError(null);
                    setAuthNotice(null);
                  }}
                  className="segmented-item py-1.5 px-2.5 text-xs font-medium whitespace-nowrap"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={emailMode === 'signup'}
                  data-active={emailMode === 'signup' ? 'true' : 'false'}
                  onClick={() => {
                    setEmailMode('signup');
                    setError(null);
                    setAuthNotice(null);
                  }}
                  className="segmented-item py-1.5 px-2.5 text-xs font-medium whitespace-nowrap"
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-ink-secondary mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="input-tactile w-full px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      Password
                    </label>
                    {emailMode === 'signin' && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={anyBusy}
                        className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                      >
                        {resetBusy ? 'Sending...' : 'Forgot password?'}
                      </button>
                    )}
                  </div>
                  <ManuscriptPasswordInput
                    id="auth-password"
                    value={password}
                    onChange={(next) => {
                      setPassword(next);
                      if (error) setError(null);
                    }}
                    placeholder={
                      emailMode === 'signup'
                        ? 'At least 6 characters'
                        : 'Enter your password'
                    }
                    autoComplete={
                      emailMode === 'signup' ? 'new-password' : 'current-password'
                    }
                    showValue={showPassword}
                    onToggleShow={() => setShowPassword((v) => !v)}
                  />
                </div>

                {emailMode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-medium text-ink-secondary mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <ManuscriptPasswordInput
                      id="auth-confirm-password"
                      value={confirmPassword}
                      onChange={(next) => {
                        setConfirmPassword(next);
                        if (error) setError(null);
                      }}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      showValue={showPassword}
                      showToggleButton={false}
                    />
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                {authNotice && (
                  <div
                    role="status"
                    className="p-3 rounded-lg border border-status-success-border bg-status-success-soft text-xs text-status-success leading-relaxed"
                  >
                    {authNotice}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={anyBusy}
                  className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {emailBusy
                      ? emailMode === 'signup'
                        ? 'Creating account...'
                        : 'Signing in...'
                      : emailMode === 'signup'
                        ? 'Create Cloud Account'
                        : 'Sign In with Email'}
                  </span>
                </button>
              </form>
            </div>

            {/* Clean Offline Space Doorway (opens context-aware flashcard -> dedicated Offline Space page) */}
            <div className="pt-3.5 border-t border-border-subtle">
              <button
                type="button"
                data-testid="offline-space-trigger"
                onClick={() => {
                  setError(null);
                  setAuthNotice(null);
                  if (hasExistingVault) {
                    setOfflineModalMode('returning');
                  } else {
                    setOfflineModalMode('first-time');
                  }
                }}
                className="group w-full flex items-center justify-between text-xs text-ink-muted hover:text-ink-primary transition-colors py-1 cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  {hasExistingVault ? (
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {hasExistingVault
                      ? 'Open Offline Space on this device'
                      : 'Continue in Offline Space'}
                  </span>
                </span>
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>

          <p className="text-center text-[11px] text-ink-muted">
            Cross-device cloud sync · Private on-device encryption
          </p>
        </div>
      </main>

      {/* FLASHCARD A: First-Time Offline Writer (Ruled Paper + Fountain Pen Nib) */}
      {offlineModalMode === 'first-time' && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-flashcard-title"
          data-testid="offline-space-flashcard"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setOfflineModalMode('none');
            }
          }}
        >
          <div
            className={`modal-panel w-full max-w-[420px] overflow-hidden ${
              flashcardInkActive ? 'ink-active' : ''
            }`}
            onMouseEnter={() => setFlashcardInkActive(true)}
            onTouchStart={() => setFlashcardInkActive(true)}
          >
            <div
              className="stationery-band relative px-6 pt-5 pb-4 border-b border-border-subtle bg-subtle/45 select-none"
              onClick={() => setFlashcardInkActive((v) => !v)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-muted">
                  <HardDrive className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  <span>Offline Space</span>
                  <span aria-hidden="true">·</span>
                  <span>This device only</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOfflineModalMode('none');
                  }}
                  aria-label="Close Offline Space notice"
                  className="btn-ghost p-1.5 -mr-1.5 -mt-1 shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex justify-center" aria-hidden="true">
                <svg
                  viewBox="0 0 220 44"
                  className="w-56 h-11 overflow-visible"
                  fill="none"
                >
                  <path
                    d="M 18 30 C 52 24, 78 33, 118 28 C 148 24, 168 29, 188 27"
                    stroke="var(--border-strong)"
                    strokeWidth="1.25"
                    strokeDasharray="3 4"
                    strokeLinecap="round"
                  />
                  <path
                    className="ink-stroke-line"
                    d="M 18 30 C 52 24, 78 33, 118 28 C 148 24, 168 29, 188 27"
                    stroke="var(--ink-primary)"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <g transform="translate(182, 4)">
                    <g className="nib-emblem">
                      <path
                        d="M 14 2 L 22 10 L 9 23 L 3 25 L 5 19 L 14 2 Z"
                        fill="var(--bg-surface)"
                        stroke="var(--ink-primary)"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="9"
                        y1="19"
                        x2="14"
                        y2="14"
                        stroke="var(--ink-primary)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <circle cx="14.5" cy="13.5" r="1.35" fill="var(--ink-primary)" />
                    </g>
                  </g>
                </svg>
              </div>
            </div>

            <div className="p-6 sm:p-7 space-y-5">
              <div className="space-y-2">
                <h2
                  id="offline-flashcard-title"
                  className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
                >
                  A quiet desk, all to yourself
                </h2>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  Everything you write stays encrypted right inside this browser. Your drafts remain on this device alone until you decide to carry them across devices.
                </p>
              </div>

              <div className="space-y-1 pt-2 border-t border-border-subtle">
                <div
                  className="tactile-note-row flex items-start gap-3 px-2.5 py-2.5 -mx-2.5 cursor-default select-none"
                  onMouseEnter={() => setFlashcardInkActive(true)}
                  onTouchStart={() => setFlashcardInkActive(true)}
                >
                  <Feather
                    className="tactile-note-icon w-4 h-4 mt-0.5 text-ink-muted shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-primary">
                      Private from the very first sentence
                    </div>
                    <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
                      No account needed. Your pages stay locked locally on this device with a personal Recovery Key.
                    </p>
                  </div>
                </div>

                <div
                  className="tactile-note-row flex items-start gap-3 px-2.5 py-2.5 -mx-2.5 cursor-default select-none"
                  onMouseEnter={() => setFlashcardInkActive(true)}
                  onTouchStart={() => setFlashcardInkActive(true)}
                >
                  <Cloud
                    className="tactile-note-icon w-4 h-4 mt-0.5 text-ink-muted shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-primary">
                      Ready to sync whenever you are
                    </div>
                    <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
                      Turn on cloud sync later in Settings and bring every page along.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="offline-flashcard-proceed"
                  onMouseEnter={() => setFlashcardInkActive(true)}
                  onFocus={() => setFlashcardInkActive(true)}
                  onClick={() => openOfflinePage('create')}
                  className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                >
                  <span>Continue Offline</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  data-testid="offline-flashcard-cancel"
                  onClick={() => setOfflineModalMode('none')}
                  className="btn-ghost w-full px-4 py-2 text-xs font-medium whitespace-nowrap"
                >
                  Back to Cloud Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLASHCARD B: Returning Saved Offline Writer -> Steps cleanly to Dedicated Offline Space Page */}
      {offlineModalMode === 'returning' && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="returning-flashcard-title"
          data-testid="returning-offline-flashcard"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setOfflineModalMode('none');
            }
          }}
        >
          <div
            className={`modal-panel w-full max-w-[430px] overflow-hidden ${
              flashcardInkActive ? 'ink-active' : ''
            }`}
            onMouseEnter={() => setFlashcardInkActive(true)}
            onTouchStart={() => setFlashcardInkActive(true)}
          >
            <div
              className="stationery-band relative px-6 pt-5 pb-4 border-b border-border-subtle bg-subtle/45 select-none"
              onClick={() => setFlashcardInkActive((v) => !v)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-muted">
                  <BookOpen className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  <span>Saved on this browser</span>
                  <span aria-hidden="true">·</span>
                  <span>Offline Space</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOfflineModalMode('none');
                  }}
                  aria-label="Close returning offline notebook"
                  className="btn-ghost p-1.5 -mr-1.5 -mt-1 shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex justify-center" aria-hidden="true">
                <svg
                  viewBox="0 0 220 50"
                  className="w-56 h-12 overflow-visible"
                  fill="none"
                >
                  <path
                    d="M 48 10 C 66 8, 92 9, 108 14 L 108 42 C 92 38, 66 37, 48 39 Z"
                    fill="var(--bg-surface)"
                    stroke="var(--ink-primary)"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <line x1="58" y1="19" x2="96" y2="20" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="58" y1="26" x2="92" y2="27" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="58" y1="33" x2="84" y2="33" stroke="var(--border-default)" strokeWidth="1.2" strokeLinecap="round" />

                  <g className="page-corner-lift">
                    <path
                      d="M 108 14 C 124 9, 150 8, 168 10 L 168 39 C 150 37, 124 38, 108 42 Z"
                      fill="var(--bg-surface)"
                      stroke="var(--ink-primary)"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <line x1="120" y1="20" x2="156" y2="19" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="120" y1="27" x2="150" y2="26" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" />
                  </g>

                  <g className="bookmark-ribbon">
                    <path
                      d="M 134 10 L 142 10 L 142 36 L 138 32.5 L 134 36 Z"
                      fill="var(--accent)"
                    />
                  </g>
                </svg>
              </div>
            </div>

            <div className="p-6 sm:p-7 space-y-5">
              <div className="space-y-2">
                <h2
                  id="returning-flashcard-title"
                  className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
                >
                  Your pages are waiting right here
                </h2>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  Your notebook lives privately on this device alone. Whenever you want your writing on your phone or another laptop too, connect Cloud Sync in Settings.
                </p>
              </div>

              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="returning-open-offline-page"
                  onMouseEnter={() => setFlashcardInkActive(true)}
                  onFocus={() => setFlashcardInkActive(true)}
                  onClick={() => openOfflinePage('unlock')}
                  className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Unlock with Saved Passphrase</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  data-testid="returning-cloud-signin"
                  onClick={() => setOfflineModalMode('none')}
                  className="btn-ghost w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back to Cloud Sign In</span>
                </button>
              </div>

              {/* Quiet utility shortcuts straight to Recovery / Restore / Fresh Space */}
              <div className="pt-3 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  data-testid="returning-forgot-link"
                  onClick={() => openOfflinePage('forgot')}
                  className="inline-flex items-center gap-1 text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" aria-hidden="true" />
                  <span>Forgot passphrase?</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="returning-restore-link"
                    onClick={() => openOfflinePage('restore')}
                    className="text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                  >
                    Restore backup
                  </button>
                  <button
                    type="button"
                    data-testid="returning-new-space-trigger"
                    onClick={openFreshSpaceGuard}
                    className="inline-link-tactile text-[11px] font-medium text-ink-muted hover:text-ink-primary cursor-pointer"
                  >
                    Start fresh
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {overwriteGuardModal}
    </div>
  );
}
