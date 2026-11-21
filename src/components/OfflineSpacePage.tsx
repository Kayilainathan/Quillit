import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  Copy,
  Download,
  Feather,
  KeyRound,
  Lightbulb,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import type { EncryptedEnvelope } from '../types';
import { isEncryptedEnvelope } from '../utils/crypto';
import {
  buildRecoveryCardText,
  loadOfflineRecoveryLockbox,
  validatePassphraseHint,
  type OfflineRecoveryLockbox,
} from '../utils/offlineRecovery';
import { ManuscriptPasswordInput } from './ManuscriptPasswordInput';

export type OfflinePageMode =
  | 'unlock'
  | 'create'
  | 'restore'
  | 'forgot'
  | 'recovery-kit';

interface OfflineSpacePageProps {
  initialMode: Exclude<OfflinePageMode, 'recovery-kit'>;
  hasExistingVault: boolean;
  existingLocalEnvelope: EncryptedEnvelope | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onBackToCloud: () => void;
  onRequestFreshSpaceOverwrite: () => void;
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

export function OfflineSpacePage({
  initialMode,
  hasExistingVault,
  existingLocalEnvelope,
  theme,
  onToggleTheme,
  onBackToCloud,
  onRequestFreshSpaceOverwrite,
  onCreateOfflineSpace,
  onCompleteOfflineEntry,
  onUnlockVault,
  onRecoverWithKey,
  onImportEncryptedBackup,
}: OfflineSpacePageProps) {
  const [mode, setMode] = useState<OfflinePageMode>(initialMode);
  const [inkActive, setInkActive] = useState(false);

  // Unlock / Create / Restore form state
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [memoryHint, setMemoryHint] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [importedEnvelope, setImportedEnvelope] =
    useState<EncryptedEnvelope | null>(null);
  const [importedFileName, setImportedFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot passphrase recovery state
  const [recoveryLockbox, setRecoveryLockbox] =
    useState<OfflineRecoveryLockbox | null>(() => loadOfflineRecoveryLockbox());
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newRecoveryPass, setNewRecoveryPass] = useState('');
  const [confirmRecoveryPass, setConfirmRecoveryPass] = useState('');
  const [newRecoveryHint, setNewRecoveryHint] = useState('');
  const [showNewRecoveryPass, setShowNewRecoveryPass] = useState(false);
  const [emergencyBackupSaved, setEmergencyBackupSaved] = useState(false);

  // One-time Recovery Key Kit display state (after Create or Successful Recovery)
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<
    string | null
  >(null);
  const [generatedHint, setGeneratedHint] = useState<string>('');
  const [recoveryKitOrigin, setRecoveryKitOrigin] = useState<
    'created' | 'recovered'
  >('created');
  const [copiedKey, setCopiedKey] = useState(false);
  const [downloadedCard, setDownloadedCard] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setPassphrase('');
    setConfirmPassphrase('');
    setMemoryHint('');
    setRecoveryLockbox(loadOfflineRecoveryLockbox());
  }, [initialMode]);

  useEffect(() => {
    setInkActive(false);
    const timer = window.setTimeout(() => setInkActive(true), 220);
    return () => window.clearTimeout(timer);
  }, [mode]);

  function switchMode(next: Exclude<OfflinePageMode, 'recovery-kit'>) {
    if (next === 'create' && hasExistingVault) {
      onRequestFreshSpaceOverwrite();
      return;
    }
    setError(null);
    setPassphrase('');
    setConfirmPassphrase('');
    setRecoveryLockbox(loadOfflineRecoveryLockbox());
    setMode(next);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isEncryptedEnvelope(parsed)) {
          setError('This file is not a valid Quillit encrypted backup.');
          return;
        }
        setImportedEnvelope(parsed);
        setImportedFileName(file.name);
      } catch {
        setError('Could not read that file. Choose a valid JSON backup.');
      }
    };
    reader.readAsText(file);
  }

  function handleDownloadEmergencyBackup() {
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
    setEmergencyBackupSaved(true);
  }

  async function handleCopyRecoveryKey() {
    if (!generatedRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(generatedRecoveryKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2600);
    } catch {
      // Clipboard fallback ignored; user can still highlight or download card
    }
  }

  function handleDownloadRecoveryCard() {
    if (!generatedRecoveryKey) return;
    const content = buildRecoveryCardText(generatedRecoveryKey, generatedHint);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quillit_Recovery_Key_${dateStamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadedCard(true);
  }

  async function handleUnlockOrCreateOrRestore(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      if (passphrase.length < 6) {
        setError('Use at least 6 characters for your Offline Space passphrase.');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match.');
        return;
      }
      const hintCheck = validatePassphraseHint(memoryHint, passphrase);
      if (!hintCheck.ok) {
        setError(hintCheck.error || 'Please adjust your memory hint.');
        return;
      }
      setBusy(true);
      try {
        const { recoveryKey } = await onCreateOfflineSpace(
          passphrase,
          hintCheck.cleaned || undefined
        );
        setGeneratedRecoveryKey(recoveryKey);
        setGeneratedHint(hintCheck.cleaned);
        setRecoveryKitOrigin('created');
        setCopiedKey(false);
        setDownloadedCard(false);
        setMode('recovery-kit');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to create your Offline Space right now.'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'unlock') {
      if (!passphrase) {
        setError('Enter your saved passphrase to open your notebook.');
        return;
      }
      setBusy(true);
      try {
        await onUnlockVault(passphrase);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'That passphrase did not unlock this notebook.'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'restore') {
      if (!importedEnvelope) {
        setError('Choose an encrypted backup (.json) file first.');
        return;
      }
      if (!passphrase) {
        setError('Enter the passphrase that locked this backup.');
        return;
      }
      setBusy(true);
      try {
        await onImportEncryptedBackup(importedEnvelope, passphrase);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not unlock that backup with this passphrase.'
        );
      } finally {
        setBusy(false);
      }
    }
  }

  async function handleRecoverSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!recoveryKeyInput.trim()) {
      setError('Enter your saved Recovery Key first.');
      return;
    }
    if (newRecoveryPass.length < 6) {
      setError('Choose a new passphrase with at least 6 characters.');
      return;
    }
    if (newRecoveryPass !== confirmRecoveryPass) {
      setError('New passphrases do not match.');
      return;
    }
    const hintCheck = validatePassphraseHint(newRecoveryHint, newRecoveryPass);
    if (!hintCheck.ok) {
      setError(hintCheck.error || 'Please adjust your memory hint.');
      return;
    }

    setBusy(true);
    try {
      const { recoveryKey } = await onRecoverWithKey(
        recoveryKeyInput,
        newRecoveryPass,
        hintCheck.cleaned || undefined
      );
      setGeneratedRecoveryKey(recoveryKey);
      setGeneratedHint(hintCheck.cleaned);
      setRecoveryKitOrigin('recovered');
      setCopiedKey(false);
      setDownloadedCard(false);
      setMode('recovery-kit');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not recover your notebook with that Recovery Key.'
      );
    } finally {
      setBusy(false);
    }
  }

  const pageEyebrow =
    mode === 'unlock'
      ? 'Offline Space · This device only'
      : mode === 'create'
        ? 'New Offline Space · Local encryption'
        : mode === 'restore'
          ? 'Restore Backup · Encrypted archive'
          : mode === 'forgot'
            ? 'Passphrase Recovery · Offline Space'
            : 'Emergency Recovery Key · Save once';

  const pageHeading =
    mode === 'unlock'
      ? 'Open your offline notebook'
      : mode === 'create'
        ? 'Set your private desk lock'
        : mode === 'restore'
          ? 'Bring back an encrypted backup'
          : mode === 'forgot'
            ? 'Recover access to your pages'
            : recoveryKitOrigin === 'recovered'
              ? 'Your notebook is unlocked again'
              : 'Save your emergency Recovery Key';

  const pageSubtitle =
    mode === 'unlock'
      ? 'Your drafts rest safely inside this browser. Enter your passphrase to pick up right where you paused.'
      : mode === 'create'
        ? 'Choose a passphrase only you know. Quillit seals your writing locally and gives you a one-time Recovery Key in case you ever forget it.'
        : mode === 'restore'
          ? 'Select a Quillit backup file (.json) from your device and unlock it with the passphrase you used when saving it.'
          : mode === 'forgot'
            ? 'Because Offline Space never sends your passphrase to a server, recovery happens quietly right here on your device.'
            : 'We show this key only once. Keep it somewhere safe so you can always reset a forgotten passphrase without losing a single sentence.';

  return (
    <div
      data-testid="offline-space-page"
      className="min-h-screen flex flex-col bg-canvas text-ink-primary page-glide-enter"
    >
      {/* Top Bar: Quillit Wordmark + Back to Cloud Sign In + Theme Toggle */}
      <header className="w-full max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="font-display text-xl font-semibold tracking-tight text-ink-primary">
            Quillit
          </span>
          <span
            aria-hidden="true"
            className="h-4 w-px bg-border-subtle hidden sm:inline-block"
          />
          <button
            type="button"
            data-testid="back-to-cloud-signin"
            onClick={onBackToCloud}
            disabled={busy}
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
          >
            <ArrowLeft
              className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            <span>Back to Cloud Sign In</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium shrink-0"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
          )}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      {/* Main Dedicated Offline Desk Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[440px] space-y-5">
          <section
            aria-labelledby="offline-page-title"
            className={`card-surface overflow-hidden ${
              inkActive ? 'ink-active' : ''
            }`}
            onMouseEnter={() => setInkActive(true)}
            onTouchStart={() => setInkActive(true)}
          >
            {/* Interactive Stationery Band with Writing-Themed SVG Artwork */}
            <div
              className="stationery-band relative px-6 pt-5 pb-4 border-b border-border-subtle bg-subtle/45 select-none cursor-pointer"
              onClick={() => setInkActive((v) => !v)}
              title="Tap to replay ink motion"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  {mode === 'unlock' && (
                    <BookOpen className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  )}
                  {mode === 'create' && (
                    <Feather className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  )}
                  {mode === 'restore' && (
                    <Upload className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  )}
                  {mode === 'forgot' && (
                    <KeyRound className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
                  )}
                  {mode === 'recovery-kit' && (
                    <ShieldCheck className="w-3.5 h-3.5 text-status-success" aria-hidden="true" />
                  )}
                  <span>{pageEyebrow}</span>
                </span>
              </div>

              <div className="mt-4 flex justify-center" aria-hidden="true">
                {mode === 'unlock' && (
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
                )}

                {mode === 'create' && (
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
                        <line x1="9" y1="19" x2="14" y2="14" stroke="var(--ink-primary)" strokeWidth="1.2" strokeLinecap="round" />
                        <circle cx="14.5" cy="13.5" r="1.35" fill="var(--ink-primary)" />
                      </g>
                    </g>
                  </svg>
                )}

                {mode === 'restore' && (
                  <svg
                    viewBox="0 0 180 50"
                    className="w-44 h-12 overflow-visible"
                    fill="none"
                  >
                    <rect
                      x="44"
                      y="10"
                      width="92"
                      height="32"
                      rx="4"
                      fill="var(--bg-surface)"
                      stroke="var(--ink-primary)"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M 46 12 L 90 30 L 134 12"
                      stroke="var(--border-strong)"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                    <g className="wax-seal-lift">
                      <circle
                        cx="90"
                        cy="28"
                        r="8"
                        fill="var(--accent)"
                        stroke="var(--bg-surface)"
                        strokeWidth="1.4"
                      />
                      <text
                        x="90"
                        y="31"
                        textAnchor="middle"
                        fill="var(--ink-inverse)"
                        fontSize="8"
                        fontWeight="600"
                      >
                        Q
                      </text>
                    </g>
                  </svg>
                )}

                {mode === 'forgot' && (
                  <svg
                    viewBox="0 0 180 50"
                    className="w-44 h-12 overflow-visible"
                    fill="none"
                  >
                    <path
                      className="ink-stroke-line"
                      d="M 32 34 C 58 38, 72 16, 100 24"
                      stroke="var(--border-strong)"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeDasharray="3 4"
                    />
                    <g className="brass-key-turn">
                      <circle
                        cx="72"
                        cy="25"
                        r="9"
                        fill="var(--bg-surface)"
                        stroke="var(--ink-primary)"
                        strokeWidth="1.5"
                      />
                      <circle cx="72" cy="25" r="3" fill="var(--status-warning)" />
                      <line
                        x1="81"
                        y1="25"
                        x2="132"
                        y2="25"
                        stroke="var(--ink-primary)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <line x1="116" y1="25" x2="116" y2="32" stroke="var(--ink-primary)" strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="125" y1="25" x2="125" y2="30" stroke="var(--ink-primary)" strokeWidth="1.6" strokeLinecap="round" />
                    </g>
                  </svg>
                )}

                {mode === 'recovery-kit' && (
                  <svg
                    viewBox="0 0 180 50"
                    className="w-44 h-12 overflow-visible"
                    fill="none"
                  >
                    <g className="folio-back">
                      <rect
                        x="42"
                        y="10"
                        width="88"
                        height="32"
                        rx="4"
                        fill="var(--bg-subtle)"
                        stroke="var(--border-strong)"
                        strokeWidth="1.2"
                      />
                    </g>
                    <g className="folio-front">
                      <rect
                        x="48"
                        y="8"
                        width="88"
                        height="32"
                        rx="4"
                        fill="var(--bg-surface)"
                        stroke="var(--ink-primary)"
                        strokeWidth="1.4"
                      />
                      <line x1="60" y1="19" x2="104" y2="19" stroke="var(--border-strong)" strokeWidth="1.3" strokeLinecap="round" />
                      <line x1="60" y1="27" x2="94" y2="27" stroke="var(--border-default)" strokeWidth="1.3" strokeLinecap="round" />
                    </g>
                    <g className="wax-seal-lift">
                      <circle cx="122" cy="24" r="7" fill="var(--status-success)" />
                      <path
                        d="M 119 24 L 121.2 26.2 L 125.5 21.8"
                        stroke="var(--bg-surface)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </svg>
                )}
              </div>
            </div>

            {/* Main Card Body */}
            <div className="p-6 sm:p-7 space-y-5">
              <div className="space-y-2">
                <h1
                  id="offline-page-title"
                  className="font-display text-2xl font-medium tracking-tight text-ink-primary leading-snug text-balance"
                >
                  {pageHeading}
                </h1>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  {pageSubtitle}
                </p>
              </div>

              {/* MODE 1, 2, 3: UNLOCK / CREATE / RESTORE */}
              {(mode === 'unlock' || mode === 'create' || mode === 'restore') && (
                <form onSubmit={handleUnlockOrCreateOrRestore} className="space-y-4">
                  {mode === 'restore' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ink-secondary">
                          Encrypted Backup File
                        </span>
                        <button
                          type="button"
                          data-testid="offline-page-exit-restore"
                          onClick={() =>
                            switchMode(hasExistingVault ? 'unlock' : 'create')
                          }
                          className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                        >
                          {hasExistingVault ? 'Back to Unlock' : 'Create new space'}
                        </button>
                      </div>
                      <label
                        htmlFor="offline-page-backup-file"
                        className="tactile-note-row flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border border-dashed border-border-default hover:border-border-strong hover:bg-subtle cursor-pointer text-xs text-ink-secondary"
                      >
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="truncate">
                          {importedFileName || 'Choose .json backup file'}
                        </span>
                      </label>
                      <input
                        id="offline-page-backup-file"
                        type="file"
                        accept="application/json,.json"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="offline-page-passphrase"
                        className="block text-xs font-medium text-ink-secondary"
                      >
                        {mode === 'restore'
                          ? 'Backup Passphrase'
                          : mode === 'create'
                            ? 'Create Passphrase'
                            : 'Saved Passphrase'}
                      </label>

                      {mode === 'unlock' && (
                        <button
                          type="button"
                          data-testid="offline-forgot-passphrase-link"
                          onClick={() => switchMode('forgot')}
                          className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                        >
                          Forgot passphrase?
                        </button>
                      )}

                      {mode === 'create' && (
                        <button
                          type="button"
                          data-testid="offline-create-restore-link"
                          onClick={() => switchMode('restore')}
                          className="inline-link-tactile text-[11px] font-medium cursor-pointer"
                        >
                          Restore from backup?
                        </button>
                      )}
                    </div>
                    <ManuscriptPasswordInput
                      id="offline-page-passphrase"
                      value={passphrase}
                      onChange={(next) => {
                        setPassphrase(next);
                        setInkActive(true);
                        if (error) setError(null);
                      }}
                      placeholder={
                        mode === 'create'
                          ? 'At least 6 characters'
                          : 'Enter your passphrase'
                      }
                      autoComplete={
                        mode === 'create' ? 'new-password' : 'current-password'
                      }
                      showValue={showPassphrase}
                      onToggleShow={() => setShowPassphrase((v) => !v)}
                      autoFocus
                    />
                  </div>

                  {mode === 'create' && (
                    <>
                      <div>
                        <label
                          htmlFor="offline-page-passphrase-confirm"
                          className="block text-xs font-medium text-ink-secondary mb-1.5"
                        >
                          Confirm Passphrase
                        </label>
                        <ManuscriptPasswordInput
                          id="offline-page-passphrase-confirm"
                          value={confirmPassphrase}
                          onChange={(next) => {
                            setConfirmPassphrase(next);
                            if (error) setError(null);
                          }}
                          placeholder="Re-enter your passphrase"
                          autoComplete="new-password"
                          showValue={showPassphrase}
                          showToggleButton={false}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label
                            htmlFor="offline-page-memory-hint"
                            className="block text-xs font-medium text-ink-secondary"
                          >
                            Memory Hint{' '}
                            <span className="text-ink-muted font-normal">
                              (optional)
                            </span>
                          </label>
                        </div>
                        <input
                          id="offline-page-memory-hint"
                          type="text"
                          value={memoryHint}
                          onChange={(e) => {
                            setMemoryHint(e.target.value);
                            if (error) setError(null);
                          }}
                          maxLength={120}
                          placeholder="A quiet clue only you understand"
                          className="input-tactile w-full px-3.5 py-2.5 text-sm"
                        />
                        <p className="mt-1.5 text-[11px] text-ink-muted leading-relaxed">
                          Shown if you ever forget your passphrase. Never type your actual passphrase here.
                        </p>
                      </div>
                    </>
                  )}

                  {error && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger leading-relaxed"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="offline-page-submit"
                    className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {busy
                        ? mode === 'create'
                          ? 'Sealing Offline Space...'
                          : 'Unlocking...'
                        : mode === 'unlock'
                          ? 'Unlock My Notebook'
                          : mode === 'create'
                            ? 'Create Offline Space'
                            : 'Decrypt & Restore'}
                    </span>
                    {!busy && (
                      <ArrowRight
                        className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {mode === 'unlock' && (
                    <div className="pt-2 border-t border-border-subtle flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        data-testid="offline-unlock-restore-link"
                        onClick={() => switchMode('restore')}
                        className="text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                      >
                        Restore from backup?
                      </button>
                      <button
                        type="button"
                        data-testid="offline-unlock-fresh-space"
                        onClick={onRequestFreshSpaceOverwrite}
                        className="inline-link-tactile text-ink-muted hover:text-ink-primary cursor-pointer"
                      >
                        Start a fresh space
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* MODE 4: FORGOT PASSPHRASE (3-PATH REAL CRYPTOGRAPHIC RECOVERY) */}
              {mode === 'forgot' && (
                <div className="space-y-4" data-testid="offline-forgot-panel">
                  {/* Path 1: Saved Memory Hint */}
                  {recoveryLockbox?.hint && (
                    <div
                      data-testid="saved-memory-hint-box"
                      className="p-3.5 rounded-lg border border-border-subtle bg-subtle/60 space-y-2"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
                        <Lightbulb
                          className="w-3.5 h-3.5 text-status-warning"
                          aria-hidden="true"
                        />
                        <span>Your saved memory hint</span>
                      </div>
                      <p className="text-sm text-ink-primary font-medium leading-relaxed">
                        &ldquo;{recoveryLockbox.hint}&rdquo;
                      </p>
                      <button
                        type="button"
                        onClick={() => switchMode('unlock')}
                        className="inline-link-tactile text-xs font-medium cursor-pointer"
                      >
                        That jogged my memory, take me back to Unlock
                      </button>
                    </div>
                  )}

                  {/* Path 2: Cryptographic Recovery Key Unlock & Reset */}
                  {recoveryLockbox ? (
                    <form onSubmit={handleRecoverSubmit} className="space-y-3.5">
                      <div>
                        <label
                          htmlFor="recovery-key-input"
                          className="block text-xs font-medium text-ink-secondary mb-1.5"
                        >
                          Emergency Recovery Key
                        </label>
                        <input
                          id="recovery-key-input"
                          type="text"
                          value={recoveryKeyInput}
                          onChange={(e) => {
                            setRecoveryKeyInput(e.target.value);
                            setInkActive(true);
                            if (error) setError(null);
                          }}
                          placeholder="QUILL-XXXX-XXXX-XXXX-XXXX"
                          autoComplete="off"
                          spellCheck={false}
                          className="input-tactile w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono-tabular uppercase tracking-wide"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="recovery-new-passphrase"
                          className="block text-xs font-medium text-ink-secondary mb-1.5"
                        >
                          Choose a New Passphrase
                        </label>
                        <ManuscriptPasswordInput
                          id="recovery-new-passphrase"
                          value={newRecoveryPass}
                          onChange={(next) => {
                            setNewRecoveryPass(next);
                            if (error) setError(null);
                          }}
                          placeholder="At least 6 characters"
                          autoComplete="new-password"
                          showValue={showNewRecoveryPass}
                          onToggleShow={() => setShowNewRecoveryPass((v) => !v)}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="recovery-confirm-passphrase"
                          className="block text-xs font-medium text-ink-secondary mb-1.5"
                        >
                          Confirm New Passphrase
                        </label>
                        <ManuscriptPasswordInput
                          id="recovery-confirm-passphrase"
                          value={confirmRecoveryPass}
                          onChange={(next) => {
                            setConfirmRecoveryPass(next);
                            if (error) setError(null);
                          }}
                          placeholder="Re-enter new passphrase"
                          autoComplete="new-password"
                          showValue={showNewRecoveryPass}
                          showToggleButton={false}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="recovery-new-hint"
                          className="block text-xs font-medium text-ink-secondary mb-1.5"
                        >
                          Updated Memory Hint{' '}
                          <span className="text-ink-muted font-normal">
                            (optional)
                          </span>
                        </label>
                        <input
                          id="recovery-new-hint"
                          type="text"
                          value={newRecoveryHint}
                          onChange={(e) => {
                            setNewRecoveryHint(e.target.value);
                            if (error) setError(null);
                          }}
                          maxLength={120}
                          placeholder="A fresh clue for your new passphrase"
                          className="input-tactile w-full px-3.5 py-2.5 text-sm"
                        />
                      </div>

                      {error && (
                        <div
                          role="alert"
                          className="p-3 rounded-lg border border-status-danger-border bg-status-danger-soft text-xs text-status-danger leading-relaxed"
                        >
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="recovery-reset-submit"
                        className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                      >
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {busy
                            ? 'Unlocking & re-sealing...'
                            : 'Unlock & Reset Passphrase'}
                        </span>
                        {!busy && (
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="p-3.5 rounded-lg border border-border-subtle bg-subtle/50 text-xs text-ink-secondary leading-relaxed">
                      This Offline Space was created before Recovery Keys were enabled, so no automatic reset key is attached to it.
                    </div>
                  )}

                  {/* Path 3: Honest Zero-Knowledge Safety Net */}
                  <div className="pt-3.5 border-t border-border-subtle space-y-2.5">
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Do not have your Recovery Key handy? You can still protect your encrypted pages now in case your passphrase comes back to you later, restore an older backup, or begin a fresh notebook.
                    </p>

                    <div className="flex flex-col gap-2">
                      {existingLocalEnvelope && (
                        <button
                          type="button"
                          data-testid="forgot-download-encrypted-copy"
                          onClick={handleDownloadEmergencyBackup}
                          className={`w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                            emergencyBackupSaved
                              ? 'border-status-success-border bg-status-success-soft text-status-success'
                              : 'btn-secondary'
                          }`}
                        >
                          {emergencyBackupSaved ? (
                            <>
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Encrypted copy saved (.json)</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Save encrypted copy for later (.json)</span>
                            </>
                          )}
                        </button>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                        <button
                          type="button"
                          onClick={() => switchMode('unlock')}
                          className="text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                        >
                          Back to Unlock
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => switchMode('restore')}
                            className="text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
                          >
                            Restore backup
                          </button>
                          <button
                            type="button"
                            onClick={onRequestFreshSpaceOverwrite}
                            className="inline-link-tactile text-ink-muted hover:text-ink-primary cursor-pointer"
                          >
                            Start fresh
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 5: ONE-TIME RECOVERY KEY KIT */}
              {mode === 'recovery-kit' && generatedRecoveryKey && (
                <div className="space-y-4" data-testid="recovery-kit-panel">
                  <div className="p-4 rounded-lg border border-border-default bg-subtle/60 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span>Your Offline Recovery Key</span>
                      <span className="font-mono-tabular">AES-256-GCM</span>
                    </div>
                    <div
                      data-testid="generated-recovery-key"
                      className="px-3 py-2.5 rounded-md bg-surface border border-border-subtle font-mono-tabular text-sm sm:text-[15px] font-semibold tracking-wider text-ink-primary text-center select-all"
                    >
                      {generatedRecoveryKey}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid="copy-recovery-key"
                        onClick={() => void handleCopyRecoveryKey()}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                          copiedKey
                            ? 'border-status-success-border bg-status-success-soft text-status-success'
                            : 'btn-secondary'
                        }`}
                      >
                        {copiedKey ? (
                          <>
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy Key</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        data-testid="download-recovery-card"
                        onClick={handleDownloadRecoveryCard}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                          downloadedCard
                            ? 'border-status-success-border bg-status-success-soft text-status-success'
                            : 'btn-secondary'
                        }`}
                      >
                        {downloadedCard ? (
                          <>
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Card Saved</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Save Card (.txt)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="recovery-kit-continue"
                    onClick={onCompleteOfflineEntry}
                    className="btn-primary group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap"
                  >
                    <span>
                      {recoveryKitOrigin === 'recovered'
                        ? 'Open My Recovered Notebook'
                        : 'I Saved It, Open My Studio'}
                    </span>
                    <ArrowRight
                      className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Calm Footer Return-to-Cloud Cue */}
          <div className="text-center">
            <button
              type="button"
              data-testid="footer-back-to-cloud"
              onClick={onBackToCloud}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Want sync across devices? Sign in with Cloud instead</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
