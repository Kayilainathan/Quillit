import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Cloud,
  HardDrive,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Moon,
  Sun,
  Upload,
} from 'lucide-react';
import type { EncryptedEnvelope, ThemePreference } from '../types';
import { isEncryptedEnvelope } from '../utils/crypto';
import { QuillitLogo } from './QuillitLogo';
import { playTactileClick } from '../utils/tactileSound';

type EntryTab = 'cloud' | 'local';
type CloudAuthMode = 'signin' | 'signup' | 'reset';

interface EntryDeskProps {
  themePreference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  onChangeThemePreference: (pref: ThemePreference) => void;
  hasLegacyEncryptedVault: boolean;
  localDeskSessionsCount: number;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onEnterLocalDesk: () => Promise<void>;
  onUnlockLegacyVault: (passphrase: string) => Promise<void>;
  onImportEncryptedBackup: (
    envelope: EncryptedEnvelope,
    passphrase: string
  ) => Promise<void>;
}

export function EntryDesk({
  themePreference,
  resolvedTheme,
  onChangeThemePreference,
  hasLegacyEncryptedVault,
  localDeskSessionsCount,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onSendPasswordReset,
  onEnterLocalDesk,
  onUnlockLegacyVault,
  onImportEncryptedBackup,
}: EntryDeskProps) {
  const [activeTab, setActiveTab] = useState<EntryTab>('cloud');
  const [authMode, setAuthMode] = useState<CloudAuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Quiet expandable drawer for legacy encrypted vaults or backup restore
  const [showLegacyUnlock, setShowLegacyUnlock] = useState(false);
  const [legacyPass, setLegacyPass] = useState('');
  const [restoreFile, setRestoreFile] = useState<EncryptedEnvelope | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restorePass, setRestorePass] = useState('');

  async function handleGoogleClick() {
    if (googleBusy || busy) return;
    setError(null);
    setNotice(null);
    setGoogleBusy(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google sign-in could not be completed.'
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || googleBusy) return;
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    if (authMode === 'reset') {
      setBusy(true);
      try {
        await onSendPasswordReset(trimmedEmail);
        setNotice(`Password reset link sent to ${trimmedEmail}.`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not send password reset email.'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (authMode === 'signup') {
        await onEmailSignUp(trimmedEmail, password);
      } else {
        await onEmailSignIn(trimmedEmail, password);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : authMode === 'signup'
            ? 'Could not create your account.'
            : 'Invalid email or password.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleInstantLocalEntry() {
    if (localBusy) return;
    setError(null);
    setNotice(null);
    setLocalBusy(true);
    playTactileClick(false);
    try {
      await onEnterLocalDesk();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open local desk storage.'
      );
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleLegacyUnlockSubmit(e: FormEvent) {
    e.preventDefault();
    if (!legacyPass) {
      setError('Enter your encrypted vault passphrase.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onUnlockLegacyVault(legacyPass);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Incorrect vault passphrase.'
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSelectBackupFile(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isEncryptedEnvelope(parsed)) {
          setError('Selected file is not a valid Quillit encrypted backup.');
          return;
        }
        setRestoreFile(parsed);
        setRestoreFileName(file.name);
      } catch {
        setError('Could not read JSON backup file.');
      }
    };
    reader.readAsText(file);
  }

  async function handleRestoreBackupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!restoreFile || !restorePass) {
      setError('Choose a backup file and enter its passphrase.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onImportEncryptedBackup(restoreFile, restorePass);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not decrypt backup file.'
      );
    } finally {
      setBusy(false);
    }
  }

  const themeOptions: Array<{
    id: ThemePreference;
    label: string;
    icon: typeof Sun;
  }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'Auto', icon: Laptop },
  ];

  return (
    <div
      data-testid="entry-desk"
      className="min-h-screen flex flex-col justify-between bg-canvas text-ink-primary px-4 py-6 sm:px-6"
    >
      {/* Top Quiet Utility Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2">
          <QuillitLogo size="md" />
          <span className="font-display text-lg font-medium tracking-tight text-ink-primary">
            Quillit
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="segmented-track inline-flex items-center gap-0.5"
        >
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = themePreference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-active={active ? 'true' : 'false'}
                data-testid={`entry-theme-${opt.id}`}
                onClick={() => onChangeThemePreference(opt.id)}
                className="segmented-item inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Centered Single-Card Tactile Entry */}
      <main className="w-full max-w-[420px] mx-auto my-6 sm:my-12">
        <div className="card-surface editorial-enter p-5 sm:p-8 space-y-5 sm:space-y-6">
          <div className="space-y-1.5 text-center">
            <h1 className="font-display text-2xl sm:text-[26px] font-medium tracking-tight text-ink-primary">
              Your writing desk
            </h1>
            <p className="text-xs sm:text-[13px] text-ink-secondary leading-relaxed">
              10-minute deliberate practice for clear writing and natural spoken fluency.
            </p>
          </div>

          {/* Springless Segmented Switch: Cloud Account | Local Vault */}
          <div
            role="tablist"
            aria-label="Workspace mode"
            className="segmented-track grid grid-cols-2 gap-1 p-1"
          >
            <button
              type="button"
              role="tab"
              data-testid="entry-tab-cloud"
              aria-selected={activeTab === 'cloud'}
              data-active={activeTab === 'cloud' ? 'true' : 'false'}
              onClick={() => {
                setActiveTab('cloud');
                setError(null);
                setNotice(null);
              }}
              className="segmented-item inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Cloud Account</span>
            </button>
            <button
              type="button"
              role="tab"
              data-testid="entry-tab-local"
              aria-selected={activeTab === 'local'}
              data-active={activeTab === 'local' ? 'true' : 'false'}
              onClick={() => {
                setActiveTab('local');
                setError(null);
                setNotice(null);
              }}
              className="segmented-item inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium"
            >
              <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Local Vault</span>
            </button>
          </div>

          {/* Feedback Notices */}
          {error && (
            <div
              role="alert"
              className="p-3 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger leading-relaxed"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="p-3 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success leading-relaxed"
            >
              {notice}
            </div>
          )}

          {/* TAB 1: CLOUD ACCOUNT */}
          {activeTab === 'cloud' && (
            <div key="tab-cloud" className="drawer-reveal space-y-4">
              <button
                type="button"
                data-testid="entry-google-signin"
                disabled={googleBusy || busy}
                onClick={() => void handleGoogleClick()}
                className="btn-secondary w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-medium"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.71 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.14 14.69 3.2 12.17 3.2 7.1 3.2 3 7.34 3 12.55s4.1 9.35 9.17 9.35c5.29 0 8.8-3.72 8.8-8.96 0-.6-.06-1.06-.16-1.84z"
                  />
                </svg>
                <span>
                  {googleBusy ? 'Connecting Google...' : 'Continue with Google'}
                </span>
              </button>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-border-subtle" />
                <span className="px-3 text-[11px] text-ink-muted">
                  or with email
                </span>
                <div className="flex-grow border-t border-border-subtle" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label
                    htmlFor="entry-email"
                    className="block text-[11px] font-medium text-ink-secondary"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="entry-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@university.edu"
                      className="input-tactile w-full pl-9 pr-3 py-2 text-[16px] sm:text-xs"
                    />
                  </div>
                </div>

                {authMode !== 'reset' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="entry-password"
                        className="block text-[11px] font-medium text-ink-secondary"
                      >
                        Password
                      </label>
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('reset');
                            setError(null);
                            setNotice(null);
                          }}
                          className="text-[11px] text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound
                        className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="entry-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={
                          authMode === 'signup'
                            ? 'new-password'
                            : 'current-password'
                        }
                        placeholder="••••••••"
                        className="input-tactile w-full pl-9 pr-3 py-2 text-[16px] sm:text-xs"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="entry-email-submit"
                  disabled={busy || googleBusy}
                  className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium mt-1"
                >
                  <span>
                    {busy
                      ? 'Opening Desk...'
                      : authMode === 'signup'
                        ? 'Create Cloud Account'
                        : authMode === 'reset'
                          ? 'Send Reset Link'
                          : 'Sign In'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </form>

              <div className="pt-1 flex items-center justify-center gap-1 text-[11px] text-ink-muted">
                {authMode === 'signin' ? (
                  <>
                    <span>New to Quillit?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signup');
                        setError(null);
                        setNotice(null);
                      }}
                      className="inline-link-tactile font-medium text-ink-primary cursor-pointer"
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    <span>Already have an account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setError(null);
                        setNotice(null);
                      }}
                      className="inline-link-tactile font-medium text-ink-primary cursor-pointer"
                    >
                      Back to sign in
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LOCAL VAULT (Zero-Friction Instant IndexedDB Desk) */}
          {activeTab === 'local' && (
            <div key="tab-local" className="drawer-reveal space-y-4">
              <div className="p-4 rounded-lg border border-border-subtle bg-subtle/60 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-ink-primary">
                    Instant on-device desk
                  </span>
                  {localDeskSessionsCount > 0 && (
                    <span className="font-mono-tabular text-[11px] text-ink-muted">
                      {localDeskSessionsCount} saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Drop straight into your writing desk with zero setup. Drafts stay privately in this browser and can be synced to your Cloud Account anytime.
                </p>
              </div>

              <button
                type="button"
                data-testid="enter-local-desk-button"
                disabled={localBusy}
                onClick={() => void handleInstantLocalEntry()}
                className="btn-primary w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium"
              >
                <span>
                  {localBusy ? 'Opening Desk...' : 'Enter Local Desk'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {/* Quiet Legacy Encrypted Vault / Backup Restore Disclosure */}
              <div className="pt-2 border-t border-border-subtle space-y-3">
                <button
                  type="button"
                  onClick={() => setShowLegacyUnlock((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    <span>
                      {hasLegacyEncryptedVault
                        ? 'Unlock passphrase-encrypted vault or restore backup'
                        : 'Restore encrypted .json backup'}
                    </span>
                  </span>
                  <span>{showLegacyUnlock ? 'Hide' : 'Open'}</span>
                </button>

                {showLegacyUnlock && (
                  <div className="space-y-3 pt-1">
                    {hasLegacyEncryptedVault && (
                      <form
                        onSubmit={handleLegacyUnlockSubmit}
                        className="space-y-2"
                      >
                        <label
                          htmlFor="legacy-vault-pass"
                          className="block text-[11px] text-ink-secondary"
                        >
                          Existing Encrypted Vault Passphrase
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="legacy-vault-pass"
                            type="password"
                            value={legacyPass}
                            onChange={(e) => setLegacyPass(e.target.value)}
                            placeholder="Enter passphrase"
                            className="input-tactile flex-1 px-3 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="btn-secondary px-3 py-1.5 text-xs font-medium"
                          >
                            Unlock
                          </button>
                        </div>
                      </form>
                    )}

                    <form
                      onSubmit={handleRestoreBackupSubmit}
                      className="space-y-2 pt-2 border-t border-border-subtle"
                    >
                      <label
                        htmlFor="entry-backup-file"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border-default bg-subtle/40 text-[11px] text-ink-secondary cursor-pointer hover:border-border-strong hover:text-ink-primary transition-colors"
                      >
                        <Upload className="w-3 h-3" aria-hidden="true" />
                        <span>
                          {restoreFileName || 'Choose encrypted .json backup'}
                        </span>
                      </label>
                      <input
                        id="entry-backup-file"
                        type="file"
                        accept="application/json,.json"
                        onChange={handleSelectBackupFile}
                        className="sr-only"
                      />
                      {restoreFile && (
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={restorePass}
                            onChange={(e) => setRestorePass(e.target.value)}
                            placeholder="Backup passphrase"
                            aria-label="Backup passphrase"
                            className="input-tactile flex-1 px-3 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="btn-secondary px-3 py-1.5 text-xs font-medium"
                          >
                            Restore
                          </button>
                        </div>
                      )}
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Whisper Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-[11px] text-ink-muted font-mono-tabular">
        <span>
          {resolvedTheme === 'dark' ? 'Nocturne Obsidian' : 'Cotton Rag'} ·
          Private writing practice
        </span>
      </footer>
    </div>
  );
}
