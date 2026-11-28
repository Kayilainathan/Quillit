import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CalendarPlus,
  Check,
  Cloud,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CoachPresetId,
  EncryptedEnvelope,
  ThemePreference,
  VaultPayload,
} from '../types';
import type { CloudSyncState } from './Header';
import { exportSessionsToCsv } from '../utils/analytics';
import { isEncryptedEnvelope } from '../utils/crypto';
import { sanitizeCustomCoachPrompt } from '../utils/proseDiagnostics';
import { playTactileClick } from '../utils/tactileSound';
import {
  apiFetch,
  clearRuntimeApiBaseUrl,
  getApiBaseUrl,
  isAiStudioPreviewUrl,
  isStaticHostingEnvironment,
  isStaticHostNoBackendError,
  safeParseJsonResponse,
  setRuntimeApiBaseUrl,
} from '../utils/apiBase';
import { parseHealthAvailability } from '../utils/offlineAiQueue';

const COACH_PRESET_OPTIONS: Array<{
  id: CoachPresetId;
  label: string;
  hint: string;
}> = [
  {
    id: 'brutally-honest',
    label: 'Brutally Honest',
    hint: 'Zero sugarcoating; surface weak reasoning immediately',
  },
  {
    id: 'technical-interview-clarity',
    label: 'Technical Interview Clarity',
    hint: 'Enforce crisp system explanations & concrete trade-offs',
  },
  {
    id: 'ban-corporate-slop',
    label: 'Ban Corporate Slop',
    hint: 'Flag leverage/synergy/delve and thesaurus padding',
  },
  {
    id: 'flag-literal-translations',
    label: 'Flag Literal Translations',
    hint: 'Catch textbook calques like "revert back" or "do the needful"',
  },
  {
    id: 'short-punchy-sentences',
    label: 'Short Punchy Sentences',
    hint: 'Push cadence under ~16 words per sentence on average',
  },
];

interface VaultSettingsViewProps {
  vault: VaultPayload;
  todayISO: string;
  themePreference: ThemePreference;
  onChangeThemePreference: (pref: ThemePreference) => void;
  onSaveCoachPreferences: (params: {
    customCoachPrompt: string;
    coachPresets: CoachPresetId[];
  }) => void;
  onUpdateDeskPreferences: (params: {
    tactileSoundEnabled?: boolean;
  }) => void;
  cloudUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
  } | null;
  cloudSyncStatus: CloudSyncState;
  cloudSyncError: string | null;
  hasFirestoreConfigured: boolean;
  workspaceBusy: boolean;
  workspaceMessage: string | null;
  workspaceError: string | null;
  hasWorkspaceToken: boolean;
  onConnectCloud: () => Promise<void>;
  onForceCloudSync: () => Promise<void>;
  onDisconnectCloud: () => Promise<void>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onRequestSyncSheets: () => void;
  onRequestSyncDocs: () => void;
  onPullFromSheets: () => Promise<void>;
  onEditProfile: () => void;
  onRebuildMonthSchedule: () => void;
  onExportEncryptedBackup: () => Promise<EncryptedEnvelope>;
  onChangePassphrase: (newPassphrase: string) => Promise<string | null>;
  onRestoreBackup: (
    envelope: EncryptedEnvelope,
    passphrase: string
  ) => Promise<void>;
  onResetVault: () => void;
}

export function VaultSettingsView({
  vault,
  todayISO,
  themePreference,
  onChangeThemePreference,
  onSaveCoachPreferences,
  onUpdateDeskPreferences,
  cloudUser,
  cloudSyncStatus,
  cloudSyncError,
  hasFirestoreConfigured,
  workspaceBusy,
  workspaceMessage,
  workspaceError,
  hasWorkspaceToken,
  onConnectCloud,
  onForceCloudSync,
  onDisconnectCloud,
  onResendVerification,
  onRefreshVerification,
  onRequestSyncSheets,
  onRequestSyncDocs,
  onPullFromSheets,
  onEditProfile,
  onRebuildMonthSchedule,
  onExportEncryptedBackup,
  onChangePassphrase,
  onRestoreBackup,
  onResetVault,
}: VaultSettingsViewProps) {
  const [coachPromptDraft, setCoachPromptDraft] = useState(
    vault.settings.customCoachPrompt ?? ''
  );
  const [selectedPresets, setSelectedPresets] = useState<CoachPresetId[]>(
    vault.settings.coachPresets ?? []
  );
  const [coachSavedNotice, setCoachSavedNotice] = useState(false);

  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMessage, setPassMessage] = useState<string | null>(null);
  const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState<string | null>(
    null
  );
  const [passError, setPassError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<EncryptedEnvelope | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);

  const profile = vault.settings.studentProfile;
  const tactileSoundEnabled = Boolean(vault.settings.tactileSoundEnabled);

  function handleTogglePreset(id: CoachPresetId) {
    playTactileClick(tactileSoundEnabled);
    setCoachSavedNotice(false);
    setSelectedPresets((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];
      onSaveCoachPreferences({
        customCoachPrompt: sanitizeCustomCoachPrompt(coachPromptDraft),
        coachPresets: next,
      });
      return next;
    });
  }

  function handleSaveCoachPromptClick() {
    playTactileClick(tactileSoundEnabled);
    const cleaned = sanitizeCustomCoachPrompt(coachPromptDraft);
    setCoachPromptDraft(cleaned);
    onSaveCoachPreferences({
      customCoachPrompt: cleaned,
      coachPresets: selectedPresets,
    });
    setCoachSavedNotice(true);
    window.setTimeout(() => setCoachSavedNotice(false), 2400);
  }

  const [apiServerInput, setApiServerInput] = useState<string>(() => getApiBaseUrl());
  const [apiServerTesting, setApiServerTesting] = useState(false);
  const [apiServerStatus, setApiServerStatus] = useState<{
    tone: 'ok' | 'warn' | 'err';
    message: string;
  } | null>(null);
  const onStaticPages = isStaticHostingEnvironment();

  async function handleSaveAndTestApiServer(e: FormEvent) {
    e.preventDefault();
    setApiServerTesting(true);
    setApiServerStatus(null);
    const trimmed = apiServerInput.trim();
    if (!trimmed) {
      clearRuntimeApiBaseUrl();
      setApiServerInput('');
      setApiServerStatus({
        tone: onStaticPages ? 'warn' : 'ok',
        message: onStaticPages
          ? 'Cleared custom server URL. Static hosting will run in offline-first mode until a public backend URL is configured.'
          : 'Using same-origin API server.',
      });
      setApiServerTesting(false);
      return;
    }

    if (isAiStudioPreviewUrl(trimmed)) {
      setApiServerStatus({
        tone: 'err',
        message:
          'AI Studio preview URLs (ais-pre / ais-dev) sit behind a Google login proxy and block cross-origin GitHub Pages requests. Deploy this repo to a public host (Render via render.yaml, Cloud Run via Dockerfile, or Railway) with GEMINI_API_KEY, then paste that public URL here.',
      });
      setApiServerTesting(false);
      return;
    }

    const saved = setRuntimeApiBaseUrl(trimmed);
    if (!saved) {
      setApiServerStatus({
        tone: 'err',
        message:
          'Enter a valid public Node backend URL (for example, https://quillit-api.onrender.com or https://your-service.a.run.app — not a github.io URL).',
      });
      setApiServerTesting(false);
      return;
    }
    setApiServerInput(saved);

    try {
      const res = await apiFetch('/api/health', { method: 'GET', timeoutMs: 10_000 });
      const json = res.ok
        ? await safeParseJsonResponse<Record<string, unknown>>(res)
        : null;
      const health = parseHealthAvailability(json);
      if (health.reachable && health.aiAvailable) {
        setApiServerStatus({
          tone: 'ok',
          message: `Connected (${health.activeModel || 'Gemini AI'} ready). Queued offline sessions will upgrade automatically.`,
        });
        window.dispatchEvent(new Event('online'));
      } else if (health.reachable) {
        setApiServerStatus({
          tone: 'warn',
          message:
            'Server reached, but GEMINI_API_KEY is missing or AI tiers are briefly cooling down. Queued sessions will retry automatically.',
        });
      } else {
        setApiServerStatus({
          tone: 'err',
          message:
            'Could not reach /api/health on that server URL. Verify the hosted backend is online and publicly accessible.',
        });
      }
    } catch (err) {
      setApiServerStatus({
        tone: 'err',
        message: isStaticHostNoBackendError(err)
          ? err.message
          : 'Connection blocked or unreachable. Verify the backend is publicly reachable over HTTPS with GEMINI_API_KEY configured.',
      });
    } finally {
      setApiServerTesting(false);
    }
  }

  async function handleDownloadEncryptedBackup() {
    const envelope = await onExportEncryptedBackup();
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quillit_encrypted_backup_${todayISO}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadCsv() {
    const csv = exportSessionsToCsv(
      [...vault.sessions].sort((a, b) => a.date.localeCompare(b.date))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quillit_Writing_Tracker_${todayISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePassSubmit(e: FormEvent) {
    e.preventDefault();
    setPassError(null);
    setPassMessage(null);
    if (newPass.length < 6) {
      setPassError('New passphrase must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('Passphrases do not match.');
      return;
    }
    try {
      const nextKey = await onChangePassphrase(newPass);
      setNewPass('');
      setConfirmPass('');
      setRotatedRecoveryKey(nextKey);
      setPassMessage(
        nextKey
          ? 'Offline Space re-encrypted and a fresh Recovery Key was generated below. Save it somewhere safe.'
          : 'Offline Space re-encrypted with your new passphrase.'
      );
    } catch (err) {
      setPassError(
        err instanceof Error ? err.message : 'Failed to update passphrase.'
      );
    }
  }

  function handleSelectRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    setRestoreError(null);
    setRestoreStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isEncryptedEnvelope(parsed)) {
          setRestoreError('Selected file is not a valid Quillit AES-256-GCM backup.');
          return;
        }
        setRestoreFile(parsed);
        setRestoreFileName(file.name);
      } catch {
        setRestoreError('Could not parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  }

  async function handleRestoreSubmit(e: FormEvent) {
    e.preventDefault();
    setRestoreError(null);
    setRestoreStatus(null);
    if (!restoreFile) {
      setRestoreError('Choose an encrypted backup file first.');
      return;
    }
    if (!restorePass) {
      setRestoreError('Enter the passphrase used for that backup.');
      return;
    }
    try {
      await onRestoreBackup(restoreFile, restorePass);
      setRestorePass('');
      setRestoreFile(null);
      setRestoreFileName('');
      setRestoreStatus('Encrypted backup decrypted and restored to local storage.');
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Incorrect passphrase for backup.'
      );
    }
  }

  const lastSyncFormatted = vault.settings.lastWorkspaceSyncAt
    ? new Date(vault.settings.lastWorkspaceSyncAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="editorial-enter max-w-4xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-ink-primary">
          Settings, Profile & Sync
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Private on-device encryption with optional cross-device sync via Google Cloud, Sheets, and Docs.
        </p>
      </div>

      {/* Student Profile & Automated 1-Month Schedule */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <GraduationCap
              className="w-4 h-4 text-ink-secondary"
              aria-hidden="true"
            />
            <span>Student Profile & Automated Month Plan</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRebuildMonthSchedule}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            >
              <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Fill Next 30 Days</span>
            </button>
            <button
              type="button"
              onClick={onEditProfile}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            >
              <span>{profile?.onboardingCompleted ? 'Edit Profile' : 'Set Up Profile'}</span>
            </button>
          </div>
        </div>

        {profile?.onboardingCompleted ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-md border border-border-subtle bg-subtle">
              <div className="text-[11px] text-ink-muted">Name</div>
              <div className="text-xs font-medium text-ink-primary mt-0.5 truncate">
                {profile.displayName || profile.collegeDegree || 'Writer'}
              </div>
            </div>
            <div className="p-3 rounded-md border border-border-subtle bg-subtle">
              <div className="text-[11px] text-ink-muted">Age</div>
              <div className="text-xs font-mono-tabular font-medium text-ink-primary mt-0.5">
                {profile.age} years
              </div>
            </div>
            <div className="p-3 rounded-md border border-border-subtle bg-subtle">
              <div className="text-[11px] text-ink-muted">College</div>
              <div className="text-xs font-medium text-ink-primary mt-0.5 truncate">
                {profile.collegeName}
              </div>
            </div>
            <div className="p-3 rounded-md border border-border-subtle bg-subtle">
              <div className="text-[11px] text-ink-muted">Writing Days</div>
              <div className="text-xs font-mono-tabular font-medium text-ink-primary mt-0.5 truncate">
                {profile.preferredDays && profile.preferredDays.length > 0
                  ? profile.preferredDays
                      .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                      .join(' · ')
                  : 'Wed · Fri · Sun'}
                {profile.reminderTime ? ` · ${profile.reminderTime}` : ''}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-secondary leading-relaxed">
            Set up your name, age, college, and preferred weekly writing rhythm to personalize your calendar and reminders.
          </p>
        )}
      </section>

      {/* Custom Coach Instructions (v3.1) */}
      <section
        data-testid="custom-coach-settings"
        className="card-surface p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <SlidersHorizontal
              className="w-4 h-4 text-ink-secondary"
              aria-hidden="true"
            />
            <span>Custom Coach Instructions</span>
          </div>
          <span className="text-[11px] font-mono-tabular text-ink-muted">
            Applied to Write &amp; Converse
          </span>
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          Shape how your AI coach evaluates drafts and responds in live conversation. Preset toggles save instantly; add custom rules below up to 500 characters.
        </p>

        <div
          role="group"
          aria-label="Coach feedback presets"
          className="flex flex-wrap gap-2"
        >
          {COACH_PRESET_OPTIONS.map((preset) => {
            const active = selectedPresets.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`coach-preset-${preset.id}`}
                data-active={active ? 'true' : 'false'}
                aria-pressed={active}
                title={preset.hint}
                onClick={() => handleTogglePreset(preset.id)}
                className="btn-chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                {active && <Check className="w-3 h-3" aria-hidden="true" />}
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <label
              htmlFor="custom-coach-prompt-input"
              className="font-medium text-ink-secondary"
            >
              Personal Coach Notes (optional)
            </label>
            <span className="font-mono-tabular text-ink-muted">
              {coachPromptDraft.length}/500
            </span>
          </div>
          <textarea
            id="custom-coach-prompt-input"
            data-testid="custom-coach-prompt-input"
            rows={3}
            maxLength={500}
            value={coachPromptDraft}
            onChange={(e) => {
              setCoachPromptDraft(e.target.value.slice(0, 500));
              setCoachSavedNotice(false);
            }}
            placeholder='e.g., "Focus on crisp technical explanations for interviews. Flag passive voice and filler openers immediately."'
            className="input-tactile w-full px-3.5 py-2.5 text-[16px] sm:text-xs leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-muted">
              Injected safely inside fenced preferences — never overrides core rubric fairness.
            </span>
            <div className="flex items-center gap-2.5 shrink-0">
              {coachSavedNotice && (
                <span
                  data-testid="coach-saved-indicator"
                  className="inline-flex items-center gap-1 text-[11px] text-status-success font-medium"
                >
                  <Check className="w-3 h-3" aria-hidden="true" />
                  <span>Saved</span>
                </span>
              )}
              <button
                type="button"
                data-testid="save-coach-instructions-button"
                onClick={handleSaveCoachPromptClick}
                className="btn-primary px-3.5 py-1.5 text-xs font-medium whitespace-nowrap"
              >
                Save Instructions
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Appearance, Tactile Feel & Optional Vault Latch */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <Lock className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
          <span>Appearance, Tactile Feel &amp; Vault Latch</span>
        </div>

        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {/* Theme */}
          <div className="py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-ink-primary">Theme</div>
              <div className="text-[11px] text-ink-muted">
                Cotton Rag Paper (Light), Nocturne Obsidian (Dark), or match OS
              </div>
            </div>
            <div
              role="radiogroup"
              aria-label="Theme mode"
              className="segmented-track inline-flex items-center gap-0.5"
            >
              {(
                [
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'system', label: 'Auto', icon: Laptop },
                ] as Array<{ id: ThemePreference; label: string; icon: typeof Sun }>
              ).map((opt) => {
                const Icon = opt.icon;
                const active = themePreference === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => {
                      playTactileClick(tactileSoundEnabled);
                      onChangeThemePreference(opt.id);
                    }}
                    className="segmented-item inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tactile Click Sound */}
          <div className="py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-ink-primary">
                Tactile Detent Sound
              </div>
              <div className="text-[11px] text-ink-muted">
                Subtle mechanical click on toggle &amp; lock switches (off by default)
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tactileSoundEnabled}
              onClick={() => {
                const next = !tactileSoundEnabled;
                if (next) playTactileClick(true);
                onUpdateDeskPreferences({ tactileSoundEnabled: next });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                tactileSoundEnabled ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {tactileSoundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Muted</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Cross-Device Cloud Sync (Google Sheets, Google Docs & Firestore) */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <Cloud className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
            <span>Cloud Storage — Google Sheets, Google Docs & Firestore</span>
          </div>

          <span
            className={`text-[11px] font-mono-tabular px-2.5 py-0.5 rounded-sm border ${
              cloudSyncStatus === 'synced'
                ? 'border-status-success-border bg-status-success-soft text-status-success'
                : cloudSyncStatus === 'workspace-fallback'
                  ? 'border-status-info-border bg-status-info-soft text-status-info'
                  : 'border-border-subtle bg-subtle text-ink-secondary'
            }`}
          >
            {cloudSyncStatus === 'synced'
              ? 'Live Cloud Sync'
              : cloudSyncStatus === 'workspace-fallback'
                ? 'Google Sheets & Docs Sync'
                : cloudSyncStatus === 'syncing'
                  ? 'Syncing...'
                  : 'Offline Space Only'}
          </span>
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          {!hasFirestoreConfigured || cloudSyncStatus === 'workspace-fallback'
            ? 'Firestore limit or database provisioning is not confirmed on this project — Google Sheets & Google Docs are active as your cross-device cloud store so your profile, evaluations, schedule, and vocabulary remain accessible from any device.'
            : 'Sign in with Google to sync across devices via Firestore and back up your structured tracker to Google Sheets and your writing archive to Google Docs.'}
        </p>

        {cloudSyncError && (
          <div
            role="status"
            className="p-2.5 rounded-md border border-status-warning-border bg-status-warning-soft text-xs text-status-warning"
          >
            {cloudSyncError}
          </div>
        )}

        {workspaceError && (
          <div
            role="alert"
            className="p-2.5 rounded-md border border-status-danger-border bg-status-danger-soft text-xs text-status-danger"
          >
            {workspaceError}
          </div>
        )}

        {workspaceMessage && (
          <div
            role="status"
            className="p-2.5 rounded-md border border-status-success-border bg-status-success-soft text-xs text-status-success"
          >
            {workspaceMessage}
          </div>
        )}

        {cloudUser && !cloudUser.emailVerified && (
          <div
            role="status"
            data-testid="settings-email-confirm-row"
            className="px-3.5 py-2.5 rounded-md border border-border-subtle bg-subtle/45 flex flex-wrap items-center justify-between gap-2.5 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Mail
                className="w-3.5 h-3.5 text-ink-muted shrink-0"
                aria-hidden="true"
              />
              <span className="text-ink-secondary">
                <strong className="font-medium text-ink-primary">
                  Confirm email
                </strong>{' '}
                · {cloudUser.email} to enable cross-device sync
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void onResendVerification()}
                className="px-2 py-1 text-[11px] font-medium text-ink-muted hover:text-ink-primary transition-colors cursor-pointer"
              >
                Resend link
              </button>
              <button
                type="button"
                onClick={() => void onRefreshVerification()}
                className="btn-secondary px-2.5 py-1 text-[11px] font-medium"
              >
                I&apos;ve verified
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {cloudUser ? (
            <>
              <div className="text-xs text-ink-secondary">
                Connected as{' '}
                <span className="font-semibold text-ink-primary">
                  {cloudUser.displayName || cloudUser.email || 'Cloud Account'}
                </span>
                {cloudUser.email && cloudUser.displayName ? ` (${cloudUser.email})` : ''}
                {!hasWorkspaceToken && (
                  <span className="text-[11px] text-ink-muted ml-1.5">
                    · Authorizes Drive on Sheets/Docs sync
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {hasFirestoreConfigured && (
                  <button
                    type="button"
                    onClick={() => void onForceCloudSync()}
                    disabled={cloudSyncStatus === 'syncing'}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>Sync Firestore</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void onDisconnectCloud()}
                  className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onConnectCloud()}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-medium"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign in with Google for Cloud Sync</span>
            </button>
          )}
        </div>

        {/* Google Sheets & Google Docs Integration Controls */}
        <div className="pt-4 border-t border-border-subtle space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-primary">
              Google Workspace Integration (Sheets Tracker & Docs Journal)
            </span>
            {lastSyncFormatted && (
              <span className="text-[11px] font-mono-tabular text-ink-muted">
                Last synced {lastSyncFormatted}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onRequestSyncSheets}
              disabled={workspaceBusy}
              className="btn-primary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sync to Google Sheets</span>
            </button>

            <button
              type="button"
              onClick={() => void onPullFromSheets()}
              disabled={workspaceBusy}
              className="btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${workspaceBusy ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Restore from Sheets</span>
            </button>

            <button
              type="button"
              onClick={onRequestSyncDocs}
              disabled={workspaceBusy}
              className="btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sync to Google Docs</span>
            </button>
          </div>

          {(vault.settings.googleSpreadsheetUrl || vault.settings.googleDocUrl) && (
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              {vault.settings.googleSpreadsheetUrl && (
                <a
                  href={vault.settings.googleSpreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-link-tactile inline-flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-status-success" aria-hidden="true" />
                  <span>Open Tracker Google Sheet</span>
                  <ExternalLink className="w-3 h-3 text-ink-muted" aria-hidden="true" />
                </a>
              )}
              {vault.settings.googleDocUrl && (
                <a
                  href={vault.settings.googleDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-link-tactile inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-status-info" aria-hidden="true" />
                  <span>Open Journal Google Doc</span>
                  <ExternalLink className="w-3 h-3 text-ink-muted" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Encrypted Backup Export & CSV Export */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <ShieldCheck className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
          <span>Encrypted Backups & Portable Exports</span>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          Your encrypted backup file contains only ciphertext, random salt, and IV—unreadable without your passphrase. Currently safeguarding{' '}
          <span className="font-mono-tabular font-semibold text-ink-primary">
            {vault.sessions.length}
          </span>{' '}
          sessions,{' '}
          <span className="font-mono-tabular font-semibold text-ink-primary">
            {vault.vocabulary.length}
          </span>{' '}
          vocabulary upgrades, and{' '}
          <span className="font-mono-tabular font-semibold text-ink-primary">
            {vault.calendarSlots.length}
          </span>{' '}
          calendar tasks.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadEncryptedBackup}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download Encrypted Backup (.json)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Tracker Spreadsheet (.csv)</span>
          </button>
        </div>
      </section>

      {/* Restore Backup */}
      <section className="card-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink-primary">
          Import & Decrypt Backup
        </h2>
        <form onSubmit={handleRestoreSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              htmlFor="settings-restore-file"
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border border-dashed border-border-default bg-subtle/40 text-xs text-ink-secondary cursor-pointer hover:border-border-strong hover:text-ink-primary transition-colors"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{restoreFileName || 'Choose encrypted .json backup'}</span>
            </label>
            <input
              id="settings-restore-file"
              type="file"
              accept="application/json,.json"
              onChange={handleSelectRestoreFile}
              className="sr-only"
            />

            <input
              type="password"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
              placeholder="Backup passphrase"
              aria-label="Backup passphrase"
              className="input-tactile px-3.5 py-2 text-xs"
            />
          </div>

          {restoreError && (
            <div className="text-xs text-status-danger">
              {restoreError}
            </div>
          )}
          {restoreStatus && (
            <div className="text-xs text-status-success">
              {restoreStatus}
            </div>
          )}

          <button
            type="submit"
            className="btn-secondary px-4 py-2 text-xs font-medium"
          >
            Decrypt & Replace Offline Space
          </button>
        </form>
      </section>

      {/* AI Backend Server Connection (for GitHub Pages / remote server setups) */}
      <section className="card-surface p-6 space-y-3" data-testid="settings-api-server-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <Cloud className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
            <span>AI Backend Server</span>
          </div>
          <span className="text-[11px] font-mono-tabular text-ink-muted">
            {apiServerInput ? 'Remote backend' : onStaticPages ? 'Offline static host' : 'Same-origin server'}
          </span>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          GitHub Pages serves only static frontend files and runs offline-first by default. To enable live Gemini AI on your hosted page, deploy this repo&apos;s Node backend once (using <code className="font-mono-tabular">render.yaml</code> on Render or <code className="font-mono-tabular">Dockerfile</code> on Cloud Run / Railway with <code className="font-mono-tabular">GEMINI_API_KEY</code>), then paste that public backend URL below or set <code className="font-mono-tabular">VITE_API_BASE_URL</code> in GitHub Actions.
        </p>
        <form onSubmit={handleSaveAndTestApiServer} className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={apiServerInput}
              onChange={(e) => setApiServerInput(e.target.value)}
              placeholder="https://quillit-api.onrender.com"
              aria-label="Hosted Quillit AI server URL"
              className="input-tactile flex-1 min-w-[220px] px-3.5 py-2 text-xs font-mono-tabular"
            />
            <button
              type="submit"
              disabled={apiServerTesting}
              className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${apiServerTesting ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{apiServerTesting ? 'Testing…' : 'Save & Test'}</span>
            </button>
          </div>
          {apiServerStatus && (
            <div
              className={`text-xs ${
                apiServerStatus.tone === 'ok'
                  ? 'text-status-success'
                  : apiServerStatus.tone === 'warn'
                    ? 'text-status-warning'
                    : 'text-status-danger'
              }`}
            >
              {apiServerStatus.message}
            </div>
          )}
        </form>
      </section>

      {/* Change Passphrase */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <KeyRound className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
          <span>Change Offline Space Passphrase</span>
        </div>
        <form onSubmit={handlePassSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="New passphrase (min 6 chars)"
              aria-label="New passphrase"
              autoComplete="new-password"
              className="input-tactile px-3.5 py-2 text-xs"
            />
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Confirm new passphrase"
              aria-label="Confirm new passphrase"
              autoComplete="new-password"
              className="input-tactile px-3.5 py-2 text-xs"
            />
          </div>

          {passError && (
            <div className="text-xs text-status-danger">{passError}</div>
          )}
          {passMessage && (
            <div className="space-y-2">
              <div className="text-xs text-status-success">{passMessage}</div>
              {rotatedRecoveryKey && (
                <div className="p-3 rounded-md border border-border-default bg-subtle/60 flex items-center justify-between gap-2">
                  <code className="font-mono-tabular text-xs font-semibold text-ink-primary select-all">
                    {rotatedRecoveryKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(rotatedRecoveryKey);
                    }}
                    className="btn-secondary px-2.5 py-1 text-[11px] font-medium shrink-0"
                  >
                    Copy Key
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-secondary px-4 py-2 text-xs font-medium"
          >
            Update Passphrase
          </button>
        </form>
      </section>

      {/* Erase Offline Space */}
      <section className="card-surface border-status-danger-border p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">
            Reset Offline Space
          </h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Permanently wipes saved writing data from this browser. Turn on Cloud Sync or download a backup first.
          </p>
        </div>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-status-danger-border text-status-danger hover:bg-status-danger-soft transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Offline Space</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="btn-secondary px-3 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onResetVault}
              className="px-3.5 py-2 text-xs font-medium rounded-md bg-status-danger text-ink-inverse hover:opacity-90 transition-opacity cursor-pointer"
            >
              Confirm Wipe
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
