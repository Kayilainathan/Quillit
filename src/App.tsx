import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type {
  AppView,
  CalendarSlot,
  EncryptedEnvelope,
  StudentProfile,
  ToneSetting,
  VaultPayload,
  VocabEntry,
  WritingMode,
  WritingSession,
} from './types';
import {
  MODE_LABELS,
  TONE_LABELS,
  computePercentage,
  computeTotalScore,
  createEmptyVaultPayload,
  deriveInternationalMetrics,
  detectPracticingVocabUsed,
  formatLocalDateISO,
  formatStudentProfileLabel,
  mergeVaultPayloads,
  stripPredefinedSeedData,
  summarizeCoachContext,
} from './utils/analytics';
import {
  buildAdaptivePromptContext,
  getNextPreferredCycleSpecs,
} from './utils/adaptivePromptProfile';
import {
  buildNonRepeatingMonthFromCurriculum,
  collectUsedTopicInventory,
  curriculumTopicToCalendarSlot,
  evaluatePeriodicAiAdaptation,
  getRemainingMonthPreferredSpecs,
  pickNextUnusedCurriculumTopic,
  shouldAutoRollMonthSchedule,
  shouldShowNewUserWelcomeFlashcard,
  swapSlotWithCurriculum,
} from './utils/curriculumEngine';
import {
  applyAiCategoriesToVocabulary,
  classifyVocabEntryLocally,
} from './utils/vocabCatalog';
import {
  MASTERY_TARGET_USES,
  countCorrectUsesInText,
} from './utils/vocabMastery';
import { formatWritingDaysSummary } from './utils/fastEvaluate';
import { decryptVault, encryptVault, isEncryptedEnvelope } from './utils/crypto';
import { getApiUrl, safeParseJsonResponse } from './utils/apiBase';
import {
  auth,
  getWorkspaceAccessToken,
  hasConfiguredFirestoreDatabase,
  reloadCurrentUser,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogleAccount,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  signUpWithEmailPassword,
} from './firebase';
import {
  clearAllSlotsFromCloud,
  deleteSlotFromCloud,
  deleteVocabFromCloud,
  ensureUserProfileDoc,
  purgePredefinedCloudRecords,
  subscribeToCloudVault,
  syncLocalVaultWithCloud,
  syncSessionToCloud,
  syncSlotToCloud,
  syncVocabToCloud,
} from './utils/cloudSync';
import {
  evaluateDayNotifications,
  fireBrowserDayNotification,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from './utils/notifications';
import {
  pullVaultFromGoogleSheets,
  syncVaultToGoogleDocs,
  syncVaultToGoogleSheets,
} from './utils/workspaceSync';
import { Header, type CloudSyncState } from './components/Header';
import { VaultGate } from './components/VaultGate';
import { WriteStudio } from './components/WriteStudio';
import { ConverseStudio } from './components/ConverseStudio';
import { DashboardView } from './components/DashboardView';
import { CalendarView } from './components/CalendarView';
import { VocabularyView } from './components/VocabularyView';
import { VaultSettingsView } from './components/VaultSettingsView';
import { ScheduledTaskModal } from './components/ScheduledTaskModal';
import { ClearTasksModal } from './components/ClearTasksModal';
import {
  OnboardingProfileModal,
  type OnboardingPreferencesPayload,
} from './components/OnboardingProfileModal';
import {
  WorkspaceSyncConfirmModal,
  type WorkspaceSyncTarget,
} from './components/WorkspaceSyncConfirmModal';
import { OfflineMigrationModal } from './components/OfflineMigrationModal';
import { WelcomeTopicFlashcard } from './components/WelcomeTopicFlashcard';
import {
  loadOfflineMigrationRecord,
  mergeOfflineIntoCloudVault,
  saveOfflineMigrationEntry,
  shouldPromptOfflineMigration,
} from './utils/offlineMigration';
import {
  clearOfflineRecoveryLockbox,
  decryptPassphraseWithRecoveryKey,
  decryptPassphraseWithSecurityAnswer,
  encryptRecoveryLockbox,
  generateRecoveryKey,
  loadOfflineRecoveryLockbox,
  saveOfflineRecoveryLockbox,
  type SecurityQuestionSetup,
} from './utils/offlineRecovery';

const LOCAL_STORAGE_KEY = 'cadence_encrypted_vault_v1';
const THEME_KEY = 'cadence_theme';

function getAccountStorageKey(uid: string): string {
  return `cadence_encrypted_vault_uid_${uid}`;
}

function loadStoredEnvelope(
  storageKey: string = LOCAL_STORAGE_KEY
): EncryptedEnvelope | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isEncryptedEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isAutostartWithoutOnboarding(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' && params.get('onboarding') !== '1';
  } catch {
    return false;
  }
}

export default function App() {
  const todayISO = formatLocalDateISO(new Date());

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore storage errors
    }
    return 'dark';
  });

  const [activeStorageKey, setActiveStorageKey] =
    useState<string>(LOCAL_STORAGE_KEY);
  const activeStorageKeyRef = useRef<string>(LOCAL_STORAGE_KEY);
  const manuallyLockedRef = useRef<boolean>(false);

  const [storedEnvelope, setStoredEnvelope] = useState<EncryptedEnvelope | null>(
    () => loadStoredEnvelope(LOCAL_STORAGE_KEY)
  );
  const [vault, setVault] = useState<VaultPayload | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return createEmptyVaultPayload();
      }
    } catch {
      // ignore URL error
    }
    return null;
  });
  const [activePassphrase, setActivePassphrase] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 'demo-autostart-pass';
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [activeView, setActiveView] = useState<AppView>('write');
  const [focusMode, setFocusMode] = useState(false);
  const [activePopupSlot, setActivePopupSlot] = useState<CalendarSlot | null>(
    null
  );
  const [showClearTasksModal, setShowClearTasksModal] = useState(false);

  // Student Profile Onboarding modal state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  // New-User Aesthetic Writing-Animation Welcome Flashcard state
  const [showWelcomeFlashcard, setShowWelcomeFlashcard] = useState(false);
  const [welcomeFlashcardBusy, setWelcomeFlashcardBusy] = useState(false);

  // Notifications state
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getBrowserNotificationPermission());

  const [refreshingSchedule, setRefreshingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [activeAiModelLabel, setActiveAiModelLabel] =
    useState<string>('gemini-4-hydrogen');

  // Firebase Cloud Auth + Firestore / Google Workspace fallback state
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authRefreshTick, setAuthRefreshTick] = useState(0);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncState>('local');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const initialCloudSyncedUidRef = useRef<string | null>(null);

  // Offline Space -> Cloud Account merge prompt state
  const [showOfflineMigrationModal, setShowOfflineMigrationModal] =
    useState(false);
  const justMergedOfflineRef = useRef(false);
  // Holds a freshly created or recovered Offline Space while user saves their one-time Recovery Key
  const pendingOfflineEntryRef = useRef<{
    payload: VaultPayload;
    passphrase: string;
  } | null>(null);

  // Google Sheets & Google Docs explicit-confirmation sync state
  const [workspaceTokenReady, setWorkspaceTokenReady] = useState<boolean>(() =>
    Boolean(getWorkspaceAccessToken())
  );
  const [pendingWorkspaceTarget, setPendingWorkspaceTarget] =
    useState<WorkspaceSyncTarget | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Studio prefill state (when launching from Calendar, Notifications, or Today Queue)
  const [studioKey, setStudioKey] = useState(0);
  const [studioInitialMode, setStudioInitialMode] =
    useState<WritingMode>('technical');
  const [studioInitialTone, setStudioInitialTone] =
    useState<ToneSetting>('academic-technical');
  const [studioInitialTopic, setStudioInitialTopic] = useState('');
  const [studioInitialSlot, setStudioInitialSlot] = useState('Slot 1');
  const [linkedSlotId, setLinkedSlotId] = useState<string | undefined>(undefined);
  const [writeEvalInProgress, setWriteEvalInProgress] = useState(false);
  const [writeEvalHasUnreadResult, setWriteEvalHasUnreadResult] = useState(false);
  const [converseInProgress, setConverseInProgress] = useState(false);
  const [converseHasUnreadResult, setConverseHasUnreadResult] = useState(false);
  const [converseHasActiveChat, setConverseHasActiveChat] = useState(false);
  const activeViewRef = useRef<AppView>(activeView);
  activeViewRef.current = activeView;
  const prevWriteEvalInProgressRef = useRef(false);
  const prevConverseInProgressRef = useRef(false);

  const handleWriteEvaluationStateChange = useCallback(
    ({
      inProgress,
      hasCompletedResult,
    }: {
      inProgress: boolean;
      hasCompletedResult: boolean;
    }) => {
      const wasRunning = prevWriteEvalInProgressRef.current;
      prevWriteEvalInProgressRef.current = inProgress;
      setWriteEvalInProgress(inProgress);
      if (
        wasRunning &&
        !inProgress &&
        hasCompletedResult &&
        activeViewRef.current !== 'write'
      ) {
        setWriteEvalHasUnreadResult(true);
      }
      if (!hasCompletedResult && !inProgress) {
        setWriteEvalHasUnreadResult(false);
      }
    },
    []
  );

  const handleConverseStatusChange = useCallback(
    ({
      inProgress,
      hasCompletedResult,
      hasActiveChat,
    }: {
      inProgress: boolean;
      hasCompletedResult: boolean;
      hasActiveChat: boolean;
    }) => {
      const wasRunning = prevConverseInProgressRef.current;
      prevConverseInProgressRef.current = inProgress;
      setConverseInProgress(inProgress);
      setConverseHasActiveChat(hasActiveChat);
      if (
        wasRunning &&
        !inProgress &&
        hasCompletedResult &&
        activeViewRef.current !== 'converse'
      ) {
        setConverseHasUnreadResult(true);
      }
      if (!hasCompletedResult && !inProgress) {
        setConverseHasUnreadResult(false);
      }
    },
    []
  );

  const coachContext = useMemo(
    () =>
      vault
        ? summarizeCoachContext(vault.sessions, vault.vocabulary)
        : {
            previousSessionSummary: '',
            avgPercentage: 0,
            weakestPillarLabel: 'Grammar & Mechanics',
            weakestPillarScore: 7.5,
            recentStrictFixes: [],
            practicingWords: [],
            activeReminder: '',
          },
    [vault]
  );

  const pendingEvalSessions = useMemo(
    () => (vault ? vault.sessions.filter((s) => s.evaluationPending) : []),
    [vault]
  );

  const notificationSummary = useMemo(
    () => evaluateDayNotifications(vault?.calendarSlots ?? [], todayISO),
    [vault?.calendarSlots, todayISO]
  );

  const periodicAiStatus = useMemo(
    () =>
      evaluatePeriodicAiAdaptation({
        sessions: vault?.sessions ?? [],
        lastPeriodicAiSessionCount: vault?.settings.lastPeriodicAiSessionCount,
      }),
    [vault?.sessions, vault?.settings.lastPeriodicAiSessionCount]
  );

  const canUseFirestore = Boolean(
    hasConfiguredFirestoreDatabase &&
      cloudUser &&
      cloudUser.emailVerified &&
      cloudSyncStatus !== 'workspace-fallback'
  );

  const handleCloudSoftFailure = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Firestore unavailable; using Google Sheets & Docs fallback:', msg);
    setCloudSyncStatus('workspace-fallback');
    setCloudSyncError(
      'Firestore limit or database is not confirmed — Google Sheets & Google Docs cloud sync is active in Vault settings.'
    );
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!auth) {
      setCloudUser(null);
      setAuthReady(true);
      setCloudSyncStatus('local');
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
      setAuthReady(true);
      setWorkspaceTokenReady(Boolean(getWorkspaceAccessToken()));
      if (!user) {
        initialCloudSyncedUidRef.current = null;
        setCloudSyncStatus('local');
        setVerificationNotice(null);
      } else if (!hasConfiguredFirestoreDatabase) {
        setCloudSyncStatus('workspace-fallback');
      }
    });
    return () => unsub();
  }, []);

  const persistVault = useCallback(
    async (
      nextVault: VaultPayload,
      passphrase: string,
      storageKeyOverride?: string
    ) => {
      const targetKey = storageKeyOverride ?? activeStorageKeyRef.current;
      const updated: VaultPayload = {
        ...nextVault,
        updatedAt: new Date().toISOString(),
      };
      const envelope = await encryptVault(updated, passphrase);
      localStorage.setItem(targetKey, JSON.stringify(envelope));
      setStoredEnvelope(envelope);
      setVault(updated);
    },
    []
  );

  const updateVaultState = useCallback(
    async (updater: (prev: VaultPayload) => VaultPayload | null) => {
      setVault((prevVault) => {
        if (!prevVault || !activePassphrase) return prevVault;
        const next = updater(prevVault);
        if (!next) return prevVault;
        void persistVault(next, activePassphrase);
        return next;
      });
    },
    [activePassphrase, persistVault]
  );

  // Silent internal 18:19 day-of reminder scheduler (never displays clock time on screen)
  useEffect(() => {
    if (!vault || !activePassphrase) return;
    if (!vault.settings.notificationsEnabled) return;
    if (browserPermission !== 'granted') return;
    if (notificationSummary.dueTodayPending.length === 0) return;
    if (vault.settings.lastNotifiedDate === todayISO) return;

    const delayMs = notificationSummary.msUntilScheduledTrigger;
    if (delayMs === null) return;

    const timer = window.setTimeout(() => {
      const fired = fireBrowserDayNotification(
        `Quillit · ${notificationSummary.headline}`,
        notificationSummary.body
      );
      if (fired) {
        void updateVaultState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            lastNotifiedDate: todayISO,
          },
        }));
      }
    }, Math.min(delayMs, 2_147_483_647));

    return () => window.clearTimeout(timer);
  }, [
    vault,
    activePassphrase,
    browserPermission,
    notificationSummary,
    todayISO,
    updateVaultState,
  ]);

  // Attach Firestore cloud sync ONLY when configured & verified; fall back cleanly to Google Sheets & Docs otherwise
  useEffect(() => {
    if (!authReady || !cloudUser || !cloudUser.emailVerified || !vault || !activePassphrase) {
      return;
    }

    if (!hasConfiguredFirestoreDatabase) {
      setCloudSyncStatus('workspace-fallback');
      return;
    }

    let cancelled = false;
    const uid = cloudUser.uid;

    if (initialCloudSyncedUidRef.current !== uid) {
      initialCloudSyncedUidRef.current = uid;
      setCloudSyncStatus('syncing');
      setCloudSyncError(null);
      void syncLocalVaultWithCloud(cloudUser, vault)
        .then((merged) => {
          if (cancelled) return;
          const {
            cleaned,
            removedSessionIds,
            removedSlotIds,
            removedVocabIds,
            changed,
          } = stripPredefinedSeedData(merged);
          if (
            removedSessionIds.length > 0 ||
            removedSlotIds.length > 0 ||
            removedVocabIds.length > 0
          ) {
            void purgePredefinedCloudRecords(uid, {
              sessionIds: removedSessionIds,
              slotIds: removedSlotIds,
              vocabIds: removedVocabIds,
            }).catch(handleCloudSoftFailure);
          }
          void persistVault(changed ? cleaned : merged, activePassphrase);
          setCloudSyncStatus('synced');
        })
        .catch((err) => {
          if (cancelled) return;
          handleCloudSoftFailure(err);
        });
    }

    const unsubCloud = subscribeToCloudVault(uid, {
      onSessions: (remoteSessions) => {
        if (cancelled) return;
        void updateVaultState((prev) => {
          const merged = mergeVaultPayloads(prev, { sessions: remoteSessions });
          const { cleaned } = stripPredefinedSeedData(merged);
          const unchanged =
            cleaned.sessions.length === prev.sessions.length &&
            cleaned.sessions.every(
              (s, i) =>
                s.id === prev.sessions[i]?.id &&
                s.evaluationPending === prev.sessions[i]?.evaluationPending &&
                s.totalScore === prev.sessions[i]?.totalScore
            );
          return unchanged ? null : cleaned;
        });
        setCloudSyncStatus('synced');
      },
      onSlots: (remoteSlots) => {
        if (cancelled) return;
        void updateVaultState((prev) => {
          const merged = mergeVaultPayloads(prev, { calendarSlots: remoteSlots });
          const { cleaned } = stripPredefinedSeedData(merged);
          const unchanged =
            cleaned.calendarSlots.length === prev.calendarSlots.length &&
            cleaned.calendarSlots.every(
              (s, i) =>
                s.id === prev.calendarSlots[i]?.id &&
                s.completed === prev.calendarSlots[i]?.completed &&
                s.topic === prev.calendarSlots[i]?.topic
            );
          return unchanged ? null : cleaned;
        });
        setCloudSyncStatus('synced');
      },
      onVocab: (remoteVocab) => {
        if (cancelled) return;
        void updateVaultState((prev) => {
          const merged = mergeVaultPayloads(prev, { vocabulary: remoteVocab });
          const { cleaned } = stripPredefinedSeedData(merged);
          const unchanged =
            cleaned.vocabulary.length === prev.vocabulary.length &&
            cleaned.vocabulary.every(
              (v, i) =>
                v.id === prev.vocabulary[i]?.id &&
                v.mastered === prev.vocabulary[i]?.mastered
            );
          return unchanged ? null : cleaned;
        });
        setCloudSyncStatus('synced');
      },
      onError: (err) => {
        if (cancelled) return;
        handleCloudSoftFailure(err);
      },
    });

    return () => {
      cancelled = true;
      unsubCloud();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authReady,
    cloudUser,
    cloudUser?.emailVerified,
    authRefreshTick,
    Boolean(vault),
    activePassphrase,
  ]);

  const unlockCloudAccountVault = useCallback(
    async (user: User) => {
      manuallyLockedRef.current = false;
      const storageKey = getAccountStorageKey(user.uid);
      const accountPass = `quilit-account-${user.uid}`;
      activeStorageKeyRef.current = storageKey;
      setActiveStorageKey(storageKey);

      if (hasConfiguredFirestoreDatabase && user.emailVerified) {
        setCloudSyncStatus('syncing');
      } else if (!hasConfiguredFirestoreDatabase) {
        setCloudSyncStatus('workspace-fallback');
      } else {
        setCloudSyncStatus('local');
      }

      const existingAccountEnvelope = loadStoredEnvelope(storageKey);
      if (existingAccountEnvelope) {
        try {
          const decrypted = await decryptVault(existingAccountEnvelope, accountPass);
          const { cleaned, changed } = stripPredefinedSeedData(decrypted);
          if (changed) {
            await persistVault(cleaned, accountPass, storageKey);
          } else {
            setVault(decrypted);
            setStoredEnvelope(existingAccountEnvelope);
          }
          setActivePassphrase(accountPass);
          return;
        } catch {
          // Fall through and recreate fresh per-account encrypted cache
        }
      }

      // Migrate any legacy single-key Google vault created on this browser earlier
      const legacyEnvelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
      if (legacyEnvelope) {
        try {
          const legacyPass = `quilit-google-${user.uid}`;
          const decrypted = await decryptVault(legacyEnvelope, legacyPass);
          const { cleaned } = stripPredefinedSeedData(decrypted);
          await persistVault(cleaned, accountPass, storageKey);
          setActivePassphrase(accountPass);
          return;
        } catch {
          // Legacy local vault belongs to a manual offline passphrase — leave untouched
        }
      }

      // Fresh device or first sign-in: initialize empty account cache; Firestore sync hydrates remote data
      const initialPayload = createEmptyVaultPayload();
      await persistVault(initialPayload, accountPass, storageKey);
      setActivePassphrase(accountPass);
      setActiveView('write');
    },
    [persistVault]
  );

  // Seamless session restore on page reload for signed-in Google or Email accounts
  useEffect(() => {
    if (!authReady || !cloudUser || vault || manuallyLockedRef.current) {
      return;
    }
    void unlockCloudAccountVault(cloudUser);
  }, [authReady, cloudUser, vault, unlockCloudAccountVault]);

  async function handleGoogleSignInFromGate() {
    setCloudSyncError(null);
    setWorkspaceError(null);
    setVerificationNotice(null);
    const { user } = await signInWithGoogleAccount();
    setCloudUser(user);
    await unlockCloudAccountVault(user);
  }

  async function handleEmailSignInFromGate(email: string, password: string) {
    setCloudSyncError(null);
    setWorkspaceError(null);
    setVerificationNotice(null);
    const user = await signInWithEmailPassword(email, password);
    setCloudUser(user);
    await unlockCloudAccountVault(user);
  }

  async function handleEmailSignUpFromGate(email: string, password: string) {
    setCloudSyncError(null);
    setWorkspaceError(null);
    const { user, verificationSent } = await signUpWithEmailPassword(
      email,
      password
    );
    setCloudUser(user);
    if (!user.emailVerified) {
      setVerificationNotice(
        verificationSent
          ? `Verification link sent to ${user.email || email}. Verify your email to activate live cross-device cloud sync.`
          : 'Account created. Verify your email address to activate live cross-device cloud sync.'
      );
    }
    await unlockCloudAccountVault(user);
  }

  async function handleSendPasswordReset(email: string) {
    await sendPasswordReset(email);
  }

  async function handleResendVerification() {
    setVerificationBusy(true);
    setCloudSyncError(null);
    try {
      await resendVerificationEmail();
      setVerificationNotice(
        `Verification email sent to ${cloudUser?.email || 'your inbox'}. Open the link, then click "I've Verified".`
      );
    } catch (err) {
      setCloudSyncError(
        err instanceof Error
          ? err.message
          : 'Unable to resend verification email.'
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleRefreshVerification() {
    setVerificationBusy(true);
    setCloudSyncError(null);
    try {
      const refreshed = await reloadCurrentUser();
      setCloudUser(refreshed);
      setAuthRefreshTick((t) => t + 1);
      if (refreshed?.emailVerified) {
        setVerificationNotice(null);
        initialCloudSyncedUidRef.current = null;
      } else {
        setVerificationNotice(
          'Email is not verified yet. Open the verification link in your inbox, then click "I\'ve Verified" again.'
        );
      }
    } catch (err) {
      setCloudSyncError(
        err instanceof Error
          ? err.message
          : 'Unable to refresh verification status.'
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleConnectCloud() {
    setCloudSyncError(null);
    setWorkspaceError(null);
    try {
      setCloudSyncStatus('syncing');
      const { user } = await signInWithGoogleAccount();
      setCloudUser(user);
      if (!hasConfiguredFirestoreDatabase) {
        setCloudSyncStatus('workspace-fallback');
      }
    } catch (err) {
      setCloudSyncStatus(hasConfiguredFirestoreDatabase ? 'error' : 'workspace-fallback');
      setCloudSyncError(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled.'
      );
    }
  }

  async function handleForceCloudSync() {
    if (!cloudUser || !vault || !activePassphrase) return;
    if (!hasConfiguredFirestoreDatabase) {
      setCloudSyncStatus('workspace-fallback');
      setCloudSyncError(
        'Firestore is not provisioned on this project. Use Google Sheets or Google Docs sync below.'
      );
      return;
    }
    if (!cloudUser.emailVerified) {
      setCloudSyncError(
        'Verify your email address first to activate live Firestore sync.'
      );
      return;
    }
    setCloudSyncError(null);
    setCloudSyncStatus('syncing');
    try {
      const merged = await syncLocalVaultWithCloud(cloudUser, vault);
      await persistVault(merged, activePassphrase);
      setCloudSyncStatus('synced');
    } catch (err) {
      handleCloudSoftFailure(err);
    }
  }

  async function handleDisconnectCloud() {
    setCloudSyncError(null);
    setWorkspaceMessage(null);
    setWorkspaceError(null);
    setVerificationNotice(null);
    await signOutGoogleWorkspace();
    setWorkspaceTokenReady(false);
    initialCloudSyncedUidRef.current = null;
    setCloudSyncStatus('local');
    if (activeStorageKeyRef.current !== LOCAL_STORAGE_KEY) {
      manuallyLockedRef.current = true;
      setVault(null);
      setActivePassphrase(null);
      setFocusMode(false);
      setShowEditProfileModal(false);
      setPendingWorkspaceTarget(null);
    }
  }

  async function ensureFreshWorkspaceToken(): Promise<string> {
    const existing = getWorkspaceAccessToken();
    if (existing) {
      setWorkspaceTokenReady(true);
      return existing;
    }
    const { accessToken } = await signInWithGoogleWorkspace();
    setWorkspaceTokenReady(Boolean(accessToken));
    if (!accessToken) {
      throw new Error(
        'Google Workspace permission token was not granted. Please sign in with Google and allow Sheets/Docs access.'
      );
    }
    return accessToken;
  }

  async function handleRequestWorkspaceSync(target: WorkspaceSyncTarget) {
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      await ensureFreshWorkspaceToken();
      setPendingWorkspaceTarget(target);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Sign in with Google to authorize Google Sheets & Docs sync.'
      );
    }
  }

  async function handleConfirmWorkspaceSync() {
    if (!pendingWorkspaceTarget || !vault || !activePassphrase) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      const token = await ensureFreshWorkspaceToken();
      if (pendingWorkspaceTarget === 'sheets') {
        const result = await syncVaultToGoogleSheets(token, vault);
        await updateVaultState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            googleSpreadsheetId: result.spreadsheetId ?? prev.settings.googleSpreadsheetId,
            googleSpreadsheetUrl:
              result.spreadsheetUrl ?? prev.settings.googleSpreadsheetUrl,
            lastWorkspaceSyncAt: result.syncedAt,
          },
        }));
        setWorkspaceMessage(result.summary);
      } else {
        const result = await syncVaultToGoogleDocs(token, vault);
        await updateVaultState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            googleDocId: result.docId ?? prev.settings.googleDocId,
            googleDocUrl: result.docUrl ?? prev.settings.googleDocUrl,
            lastWorkspaceSyncAt: result.syncedAt,
          },
        }));
        setWorkspaceMessage(result.summary);
      }
      setPendingWorkspaceTarget(null);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Failed to sync with Google Workspace.'
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handlePullFromSheets() {
    if (!vault || !activePassphrase) return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setWorkspaceMessage(null);
    try {
      const token = await ensureFreshWorkspaceToken();
      const pulled = await pullVaultFromGoogleSheets(
        token,
        vault.settings.googleSpreadsheetId
      );
      if (!pulled) {
        setWorkspaceMessage(
          'No Quillit Google Sheet found yet in your Google Drive. Click "Sync to Google Sheets" to create one.'
        );
        return;
      }

      await updateVaultState((prev) => {
        const merged = mergeVaultPayloads(prev, {
          sessions: pulled.sessions,
          calendarSlots: pulled.calendarSlots,
          vocabulary: pulled.vocabulary,
        });
        const nextProfile = pulled.profile ?? prev.settings.studentProfile;
        return {
          ...merged,
          settings: {
            ...merged.settings,
            studentProfile: nextProfile,
            semesterLabel: nextProfile
              ? formatStudentProfileLabel(nextProfile)
              : merged.settings.semesterLabel,
            googleSpreadsheetId: pulled.spreadsheetId,
            googleSpreadsheetUrl: pulled.spreadsheetUrl,
            lastWorkspaceSyncAt: new Date().toISOString(),
          },
        };
      });

      setWorkspaceMessage(
        `Restored ${pulled.sessions.length} session${pulled.sessions.length === 1 ? '' : 's'}, ${pulled.calendarSlots.length} scheduled task${pulled.calendarSlots.length === 1 ? '' : 's'}, and ${pulled.vocabulary.length} vocabulary item${pulled.vocabulary.length === 1 ? '' : 's'} from Google Sheets.`
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? err.message
          : 'Unable to restore data from Google Sheets.'
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleToggleNotifications() {
    if (!vault || !activePassphrase) return;
    const currentlyEnabled = Boolean(vault.settings.notificationsEnabled);
    if (currentlyEnabled) {
      await updateVaultState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          notificationsEnabled: false,
        },
      }));
      return;
    }

    const perm = await requestBrowserNotificationPermission();
    setBrowserPermission(perm);
    await updateVaultState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        notificationsEnabled: perm === 'granted' || perm === 'unsupported',
      },
    }));
  }

  const handleSaveStudentProfile = useCallback(
    (payload: OnboardingPreferencesPayload) => {
      if (!vault || !activePassphrase) return;
      const {
        profile,
        rebuildMonthSchedule,
        notificationsEnabled: nextNotif,
        dailyWordGoal: nextWordGoal,
        liveOfflineCheck: nextLiveCheck,
      } = payload;

      if (profile.defaultMode) {
        setStudioInitialMode(profile.defaultMode);
      }

      void updateVaultState((prev) => {
        const nextSettings = {
          ...prev.settings,
          studentProfile: profile,
          semesterLabel: formatStudentProfileLabel(profile),
          notificationsEnabled: nextNotif,
          dailyWordGoal: nextWordGoal,
          liveOfflineCheck: nextLiveCheck,
        };

        // When rebuilding schedule with updated weekday preferences, preserve completed/past slots
        // and replace uncompleted future auto-generated plan slots using the 52-week zero-repeat roadmap
        const preservedSlots = rebuildMonthSchedule
          ? prev.calendarSlots.filter(
              (s) =>
                s.completed ||
                s.scheduledDate < todayISO ||
                !s.id.startsWith('plan-')
            )
          : prev.calendarSlots;

        const [ty, tm] = todayISO.split('-').map(Number);
        const curriculumBuild = rebuildMonthSchedule
          ? buildNonRepeatingMonthFromCurriculum({
              year: ty || new Date().getFullYear(),
              monthIndex0: (tm || 1) - 1,
              todayISO,
              profile,
              existingSlots: preservedSlots,
              sessions: prev.sessions,
              usedCurriculumIds: prev.settings.usedCurriculumIds,
              coachContext,
            })
          : { addedSlots: [], newlyUsedCurriculumIds: [], catalogExhausted: false };

        const addedSlots = curriculumBuild.addedSlots;
        const mergedUsedIds = Array.from(
          new Set([
            ...(prev.settings.usedCurriculumIds ?? []),
            ...curriculumBuild.newlyUsedCurriculumIds,
          ])
        );

        const finalSettings = {
          ...nextSettings,
          usedCurriculumIds: mergedUsedIds,
        };

        const nextCalendarSlots = rebuildMonthSchedule
          ? [...preservedSlots, ...addedSlots]
          : prev.calendarSlots;

        if (canUseFirestore && cloudUser) {
          void ensureUserProfileDoc(cloudUser, finalSettings).catch(
            handleCloudSoftFailure
          );
          for (const slot of addedSlots) {
            void syncSlotToCloud(cloudUser.uid, slot).catch(handleCloudSoftFailure);
          }
        }

        return {
          ...prev,
          settings: finalSettings,
          calendarSlots: nextCalendarSlots,
        };
      });
      setShowEditProfileModal(false);
    },
    [
      vault,
      activePassphrase,
      todayISO,
      coachContext,
      updateVaultState,
      canUseFirestore,
      cloudUser,
      handleCloudSoftFailure,
    ]
  );

  const handleRebuildRollingMonth = useCallback(() => {
    if (!vault || !activePassphrase) return;
    const [ty, tm] = todayISO.split('-').map(Number);
    const targetYear = ty || new Date().getFullYear();
    const targetMonth0 = (tm || 1) - 1;
    void updateVaultState((prev) => {
      const { addedSlots, newlyUsedCurriculumIds } =
        buildNonRepeatingMonthFromCurriculum({
          year: targetYear,
          monthIndex0: targetMonth0,
          todayISO,
          profile: prev.settings.studentProfile,
          existingSlots: prev.calendarSlots,
          sessions: prev.sessions,
          usedCurriculumIds: prev.settings.usedCurriculumIds,
          coachContext,
        });
      if (addedSlots.length === 0) return null;
      if (canUseFirestore && cloudUser) {
        for (const slot of addedSlots) {
          void syncSlotToCloud(cloudUser.uid, slot).catch(handleCloudSoftFailure);
        }
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          usedCurriculumIds: Array.from(
            new Set([
              ...(prev.settings.usedCurriculumIds ?? []),
              ...newlyUsedCurriculumIds,
            ])
          ),
        },
        calendarSlots: [...prev.calendarSlots, ...addedSlots],
      };
    });
  }, [
    vault,
    activePassphrase,
    todayISO,
    coachContext,
    updateVaultState,
    canUseFirestore,
    cloudUser,
    handleCloudSoftFailure,
  ]);

  const handleRefreshTriWeeklySchedule = useCallback(
    async (focusNote?: string) => {
      if (!vault || !activePassphrase) return;
      setScheduleError(null);
      setRefreshingSchedule(true);
      try {
        const preferredDays = vault.settings.studentProfile?.preferredDays;
        const upcomingSpecs = getNextPreferredCycleSpecs(todayISO, preferredDays, 3);
        const adaptiveWritingProfile = buildAdaptivePromptContext(
          vault.settings.studentProfile,
          vault.sessions,
          vault.vocabulary,
          todayISO
        );
        const res = await fetch(getApiUrl('/api/schedule-triweekly'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customDates: upcomingSpecs,
            todayISO,
            existingTopics: [
              ...vault.calendarSlots.map((s) => s.topic),
              ...vault.sessions.map((s) => s.topicDescription),
            ],
            focusNote,
            studentProfile: vault.settings.studentProfile,
            adaptiveWritingProfile,
            performanceContext: {
              avgPercentage: coachContext.avgPercentage,
              weakestPillarLabel: coachContext.weakestPillarLabel,
              weakestPillarScore: coachContext.weakestPillarScore,
              recentStrictFixes: coachContext.recentStrictFixes,
              practicingWords: coachContext.practicingWords.map(
                (v) => v.betterAlternative
              ),
            },
          }),
        });
        const data = await safeParseJsonResponse<Record<string, unknown>>(res);
        if (!res.ok || !data) {
          throw new Error(
            (typeof data?.error === 'string' && data.error) ||
              'AI schedule refresh requires an active API server.'
          );
        }

        if (typeof data.modelUsed === 'string') {
          setActiveAiModelLabel(data.modelUsed);
        }

        const freshSlots: CalendarSlot[] = (
          Array.isArray(data.slots) ? (data.slots as CalendarSlot[]) : []
        ).filter((s) => s.scheduledDate >= todayISO);
        if (freshSlots.length > 0) {
          const cycleDateSet = new Set(upcomingSpecs.map((d) => d.scheduledDate));
          const completedSessionCount = vault.sessions.filter(
            (s) => s.status === 'Completed'
          ).length;
          await updateVaultState((prev) => {
            const preserved = prev.calendarSlots.filter(
              (s) =>
                !cycleDateSet.has(s.scheduledDate) ||
                !s.isTriWeekly ||
                s.completed
            );
            const completedCycleDates = new Set(
              preserved
                .filter((s) => s.isTriWeekly && s.completed)
                .map((s) => s.scheduledDate)
            );
            const toInsert = freshSlots.filter(
              (s) => !completedCycleDates.has(s.scheduledDate)
            );
            if (canUseFirestore && cloudUser) {
              for (const s of toInsert) {
                void syncSlotToCloud(cloudUser.uid, s).catch(
                  handleCloudSoftFailure
                );
              }
            }
            return {
              ...prev,
              settings: {
                ...prev.settings,
                lastPeriodicAiSessionCount: completedSessionCount,
              },
              calendarSlots: [...preserved, ...toInsert],
            };
          });
        }
      } catch (err) {
        setScheduleError(
          err instanceof Error
            ? err.message
            : 'Unable to refresh AI writing schedule.'
        );
      } finally {
        setRefreshingSchedule(false);
      }
    },
    [
      vault,
      activePassphrase,
      todayISO,
      coachContext,
      updateVaultState,
      canUseFirestore,
      cloudUser,
      handleCloudSoftFailure,
    ]
  );

  const handleRegenerateMonthWithAI = useCallback(
    async (year: number, monthIndex0: number, focusNote?: string) => {
      if (!vault || !activePassphrase) return;
      setScheduleError(null);
      setRefreshingSchedule(true);
      try {
        const preferredDays = vault.settings.studentProfile?.preferredDays;
        const monthDates = getRemainingMonthPreferredSpecs(
          year,
          monthIndex0,
          todayISO,
          preferredDays
        );
        if (monthDates.length === 0) {
          setScheduleError(
            'No upcoming preferred writing days remain in this month. Switch to the next month to plan ahead.'
          );
          return;
        }
        const adaptiveWritingProfile = buildAdaptivePromptContext(
          vault.settings.studentProfile,
          vault.sessions,
          vault.vocabulary,
          todayISO
        );

        const res = await fetch(getApiUrl('/api/schedule-triweekly'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customDates: monthDates,
            todayISO,
            existingTopics: [
              ...vault.calendarSlots.map((s) => s.topic),
              ...vault.sessions.map((s) => s.topicDescription),
            ],
            studentProfile: vault.settings.studentProfile,
            adaptiveWritingProfile,
            focusNote:
              focusNote ||
              `Adaptive monthly spoken-first curriculum targeting ${coachContext.weakestPillarLabel}`,
            performanceContext: {
              avgPercentage: coachContext.avgPercentage,
              weakestPillarLabel: coachContext.weakestPillarLabel,
              weakestPillarScore: coachContext.weakestPillarScore,
              recentStrictFixes: coachContext.recentStrictFixes,
              practicingWords: coachContext.practicingWords.map(
                (v) => v.betterAlternative
              ),
            },
          }),
        });
        const data = await safeParseJsonResponse<Record<string, unknown>>(res);
        if (!res.ok || !data) {
          throw new Error(
            (typeof data?.error === 'string' && data.error) ||
              'AI monthly plan requires an active API server. Use Auto-Fill Month for instant offline scheduling.'
          );
        }

        if (typeof data.modelUsed === 'string') {
          setActiveAiModelLabel(data.modelUsed);
        }

        const generated: CalendarSlot[] = (
          Array.isArray(data.slots) ? (data.slots as CalendarSlot[]) : []
        ).filter((s) => s.scheduledDate >= todayISO);
        if (generated.length > 0) {
          const monthDateSet = new Set(monthDates.map((d) => d.scheduledDate));
          const completedSessionCount = vault.sessions.filter(
            (s) => s.status === 'Completed'
          ).length;
          await updateVaultState((prev) => {
            const preserved = prev.calendarSlots.filter(
              (s) =>
                !monthDateSet.has(s.scheduledDate) ||
                !s.isTriWeekly ||
                s.completed
            );
            const completedDates = new Set(
              preserved
                .filter((s) => s.isTriWeekly && s.completed)
                .map((s) => s.scheduledDate)
            );
            const toInsert = generated.filter(
              (s) => !completedDates.has(s.scheduledDate)
            );
            if (canUseFirestore && cloudUser) {
              for (const s of toInsert) {
                void syncSlotToCloud(cloudUser.uid, s).catch(
                  handleCloudSoftFailure
                );
              }
            }
            return {
              ...prev,
              settings: {
                ...prev.settings,
                lastPeriodicAiSessionCount: completedSessionCount,
              },
              calendarSlots: [...preserved, ...toInsert],
            };
          });
        }
      } catch (err) {
        setScheduleError(
          err instanceof Error ? err.message : 'Unable to refresh monthly AI plan.'
        );
      } finally {
        setRefreshingSchedule(false);
      }
    },
    [
      vault,
      activePassphrase,
      todayISO,
      coachContext,
      updateVaultState,
      canUseFirestore,
      cloudUser,
      handleCloudSoftFailure,
    ]
  );

  const handleLoadMonthTriWeekly = useCallback(
    (year: number, monthIndex0: number) => {
      if (!vault || !activePassphrase) return;
      setScheduleError(null);
      let exhausted = false;
      void updateVaultState((prev) => {
        const { addedSlots, newlyUsedCurriculumIds, catalogExhausted } =
          buildNonRepeatingMonthFromCurriculum({
            year,
            monthIndex0,
            todayISO,
            profile: prev.settings.studentProfile,
            existingSlots: prev.calendarSlots,
            sessions: prev.sessions,
            usedCurriculumIds: prev.settings.usedCurriculumIds,
            coachContext,
          });
        exhausted = catalogExhausted && addedSlots.length === 0;
        if (addedSlots.length === 0) return null;
        if (canUseFirestore && cloudUser) {
          for (const slot of addedSlots) {
            void syncSlotToCloud(cloudUser.uid, slot).catch(
              handleCloudSoftFailure
            );
          }
        }
        return {
          ...prev,
          settings: {
            ...prev.settings,
            usedCurriculumIds: Array.from(
              new Set([
                ...(prev.settings.usedCurriculumIds ?? []),
                ...newlyUsedCurriculumIds,
              ])
            ),
          },
          calendarSlots: [...prev.calendarSlots, ...addedSlots],
        };
      });
      if (exhausted) {
        void handleRegenerateMonthWithAI(
          year,
          monthIndex0,
          'Fresh next-month AI topics after completing the 52-week roadmap'
        );
      }
    },
    [
      vault,
      activePassphrase,
      todayISO,
      coachContext,
      updateVaultState,
      canUseFirestore,
      cloudUser,
      handleCloudSoftFailure,
      handleRegenerateMonthWithAI,
    ]
  );

  // Automatic month roll-on: when Auto-Reload is active and an established user has
  // zero upcoming uncompleted slots left, quietly roll in remaining current-month
  // dates (or next month) from the 52-week database without repeating topics or
  // touching past dates (and fall back to AI automatically once all 156 topics finish).
  const autoRolledMonthKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vault || !activePassphrase || showWelcomeFlashcard) return;
    if (!vault.settings.studentProfile?.onboardingCompleted) return;
    const decision = shouldAutoRollMonthSchedule({
      autoReloadSchedule: vault.settings.autoReloadSchedule !== false,
      welcomeFlashcardShown: vault.settings.welcomeFlashcardShown,
      sessions: vault.sessions,
      calendarSlots: vault.calendarSlots,
      todayISO,
      preferredDays: vault.settings.studentProfile?.preferredDays,
    });
    if (!decision.shouldRoll) return;
    if (autoRolledMonthKeyRef.current === decision.targetKey) return;
    autoRolledMonthKeyRef.current = decision.targetKey;
    handleLoadMonthTriWeekly(decision.year, decision.monthIndex0);
  }, [
    vault,
    activePassphrase,
    showWelcomeFlashcard,
    todayISO,
    handleLoadMonthTriWeekly,
  ]);

  // Background auto-evaluator for any writing session accepted while API quota limits were exhausted
  useEffect(() => {
    if (!vault || !activePassphrase || pendingEvalSessions.length === 0) {
      return;
    }
    const targetSession = pendingEvalSessions[0];
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(getApiUrl('/api/evaluate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: targetSession.content,
            mode: MODE_LABELS[targetSession.mode],
            tone: TONE_LABELS[targetSession.tone],
            topic: targetSession.topicDescription,
            studentProfile: vault.settings.studentProfile,
            previousSessionSummary: coachContext.previousSessionSummary,
            practicingVocab: coachContext.practicingWords.map(
              (v) => v.betterAlternative
            ),
          }),
        });
        if (!res.ok) return;
        const data = await safeParseJsonResponse<{
          evaluationStatus?: string;
          modelUsed?: string;
          scores?: WritingSession['scores'];
          cefrLevel?: string;
          internationalMetrics?: WritingSession['internationalMetrics'];
          toneVerdict?: string;
          flowVerdict?: string;
          feedbackImplemented?: WritingSession['feedbackImplemented'];
          whatImproved?: string;
          strictImprovements?: string;
          grammarFixes?: WritingSession['grammarFixes'];
          vocabUpgrades?: WritingSession['vocabUpgrades'];
        }>(res);
        if (!data || data.evaluationStatus !== 'completed' || !data.scores) {
          return;
        }
        const resolvedScores = data.scores;
        if (typeof data.modelUsed === 'string') {
          setActiveAiModelLabel(data.modelUsed);
        }
        const totalScore = computeTotalScore(resolvedScores);
        const percentage = computePercentage(totalScore);
        const intl = deriveInternationalMetrics({
          scores: resolvedScores,
          content: targetSession.content,
          internationalMetrics: data.internationalMetrics,
        });

        await updateVaultState((prev) => ({
          ...prev,
          sessions: prev.sessions.map((s) => {
            if (s.id !== targetSession.id) return s;
            const finalized: WritingSession = {
              ...s,
              scores: resolvedScores,
              totalScore,
              percentage,
              cefrLevel: data.cefrLevel || s.cefrLevel,
              internationalMetrics: intl,
              toneVerdict: data.toneVerdict || s.toneVerdict,
              flowVerdict: data.flowVerdict || s.flowVerdict,
              feedbackImplemented:
                data.feedbackImplemented || s.feedbackImplemented,
              whatImproved: data.whatImproved || s.whatImproved,
              strictImprovements:
                data.strictImprovements || s.strictImprovements,
              grammarFixes: Array.isArray(data.grammarFixes)
                ? data.grammarFixes
                : s.grammarFixes,
              vocabUpgrades: Array.isArray(data.vocabUpgrades)
                ? data.vocabUpgrades
                : s.vocabUpgrades,
              evaluationPending: false,
              modelUsed: data.modelUsed || 'gemini-3.1-flash-lite',
            };
            if (canUseFirestore && cloudUser) {
              void syncSessionToCloud(cloudUser.uid, finalized).catch(
                handleCloudSoftFailure
              );
            }
            return finalized;
          }),
        }));
      } catch {
        // Silent background retry on next quota window
      }
    }, 22_000);

    return () => window.clearTimeout(timer);
  }, [
    vault,
    activePassphrase,
    pendingEvalSessions,
    coachContext,
    updateVaultState,
    canUseFirestore,
    cloudUser,
    handleCloudSoftFailure,
  ]);

  async function handleCreateOfflineSpace(
    passphrase: string,
    securitySetup?: SecurityQuestionSetup
  ): Promise<{ recoveryKey: string }> {
    const initialPayload = createEmptyVaultPayload();
    const envelope = await encryptVault(initialPayload, passphrase);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(envelope));
    setStoredEnvelope(envelope);

    const recoveryKey = generateRecoveryKey();
    const lockbox = await encryptRecoveryLockbox(
      passphrase,
      recoveryKey,
      securitySetup
    );
    saveOfflineRecoveryLockbox(lockbox);

    pendingOfflineEntryRef.current = {
      payload: initialPayload,
      passphrase,
    };
    return { recoveryKey };
  }

  function handleCompleteOfflineEntry() {
    const pending = pendingOfflineEntryRef.current;
    if (!pending) return;
    pendingOfflineEntryRef.current = null;
    manuallyLockedRef.current = false;
    activeStorageKeyRef.current = LOCAL_STORAGE_KEY;
    setActiveStorageKey(LOCAL_STORAGE_KEY);
    setVault(pending.payload);
    setActivePassphrase(pending.passphrase);
    setActiveView('write');
  }

  async function finalizeOfflineRecoveryWithOriginalPassphrase(
    originalPassphrase: string,
    newPassphrase: string,
    securitySetup?: SecurityQuestionSetup
  ): Promise<{ recoveryKey: string }> {
    const envelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
    if (!envelope) {
      throw new Error('No saved Offline Space was found on this browser.');
    }

    const decrypted = await decryptVault(envelope, originalPassphrase);
    const { cleaned } = stripPredefinedSeedData(decrypted);

    const reEncrypted = await encryptVault(cleaned, newPassphrase);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reEncrypted));
    setStoredEnvelope(reEncrypted);

    const nextRecoveryKey = generateRecoveryKey();
    const nextLockbox = await encryptRecoveryLockbox(
      newPassphrase,
      nextRecoveryKey,
      securitySetup
    );
    saveOfflineRecoveryLockbox(nextLockbox);

    pendingOfflineEntryRef.current = {
      payload: cleaned,
      passphrase: newPassphrase,
    };
    return { recoveryKey: nextRecoveryKey };
  }

  async function handleRecoverOfflineWithKey(
    recoveryKey: string,
    newPassphrase: string,
    securitySetup?: SecurityQuestionSetup
  ): Promise<{ recoveryKey: string }> {
    const lockbox = loadOfflineRecoveryLockbox();
    if (!lockbox) {
      throw new Error(
        'No Recovery Key lockbox is attached to this Offline Space.'
      );
    }

    const originalPassphrase = await decryptPassphraseWithRecoveryKey(
      lockbox,
      recoveryKey
    );
    return finalizeOfflineRecoveryWithOriginalPassphrase(
      originalPassphrase,
      newPassphrase,
      securitySetup
    );
  }

  async function handleRecoverOfflineWithSecurityAnswer(
    securityAnswer: string,
    newPassphrase: string,
    securitySetup?: SecurityQuestionSetup
  ): Promise<{ recoveryKey: string }> {
    const lockbox = loadOfflineRecoveryLockbox();
    if (!lockbox) {
      throw new Error(
        'No local recovery lockbox is attached to this Offline Space.'
      );
    }

    const originalPassphrase = await decryptPassphraseWithSecurityAnswer(
      lockbox,
      securityAnswer
    );
    return finalizeOfflineRecoveryWithOriginalPassphrase(
      originalPassphrase,
      newPassphrase,
      securitySetup
    );
  }

  async function handleUnlockVault(passphrase: string) {
    manuallyLockedRef.current = false;
    activeStorageKeyRef.current = LOCAL_STORAGE_KEY;
    setActiveStorageKey(LOCAL_STORAGE_KEY);
    const envelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
    if (!envelope) {
      throw new Error('No encrypted vault found on this browser.');
    }
    const decrypted = await decryptVault(envelope, passphrase);
    const { cleaned, changed } = stripPredefinedSeedData(decrypted);
    if (changed) {
      await persistVault(cleaned, passphrase, LOCAL_STORAGE_KEY);
    } else {
      setVault(decrypted);
      setStoredEnvelope(envelope);
    }
    setActivePassphrase(passphrase);
  }

  async function handleImportEncryptedBackup(
    envelope: EncryptedEnvelope,
    passphrase: string
  ) {
    manuallyLockedRef.current = false;
    const targetKey = vault ? activeStorageKeyRef.current : LOCAL_STORAGE_KEY;
    activeStorageKeyRef.current = targetKey;
    setActiveStorageKey(targetKey);
    const decrypted = await decryptVault(envelope, passphrase);
    const { cleaned, changed } = stripPredefinedSeedData(decrypted);
    if (changed) {
      await persistVault(cleaned, passphrase, targetKey);
    } else {
      localStorage.setItem(targetKey, JSON.stringify(envelope));
      setStoredEnvelope(envelope);
      setVault(decrypted);
    }
    setActivePassphrase(passphrase);
    setActiveView('dashboard');
  }

  function handleLockVault() {
    manuallyLockedRef.current = true;
    setVault(null);
    setActivePassphrase(null);
    setFocusMode(false);
    setShowEditProfileModal(false);
    setPendingWorkspaceTarget(null);
  }

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function handleToggleAutoReloadSchedule() {
    void updateVaultState((prev) => {
      const nextSettings = {
        ...prev.settings,
        autoReloadSchedule: prev.settings.autoReloadSchedule === false,
      };
      if (canUseFirestore && cloudUser) {
        void ensureUserProfileDoc(cloudUser, nextSettings).catch(
          handleCloudSoftFailure
        );
      }
      return {
        ...prev,
        settings: nextSettings,
      };
    });
  }

  function handleSaveSession(
    newSession: WritingSession,
    newVocabEntries: VocabEntry[],
    slotIdToComplete?: string,
    aiMasteredWords?: string[]
  ): string[] {
    let promotedWords: string[] = [];

    void updateVaultState((prev) => {
      const matchedSlotId =
        slotIdToComplete ??
        prev.calendarSlots.find(
          (slot) =>
            !slot.completed &&
            slot.scheduledDate === newSession.date &&
            slot.mode === newSession.mode
        )?.id;

      const updatedSlots = matchedSlotId
        ? prev.calendarSlots.map((slot) =>
            slot.id === matchedSlotId
              ? { ...slot, completed: true, linkedSessionId: newSession.id }
              : slot
          )
        : prev.calendarSlots;

      const deterministicIds = new Set(
        detectPracticingVocabUsed(newSession.content, prev.vocabulary)
      );
      const aiPhraseSet = new Set(
        (aiMasteredWords ?? []).map((w) => w.trim().toLowerCase())
      );
      const promotedIdSet = new Set<string>();

      const updatedVocab = prev.vocabulary.map((v) => {
        const textUses =
          newSession.status === 'Draft'
            ? 0
            : countCorrectUsesInText(
                v,
                newSession.content,
                newSession.grammarFixes
              );
        const aiCredited = aiPhraseSet.has(v.betterAlternative.toLowerCase());
        const matchedThisSession =
          textUses > 0 || aiCredited || deterministicIds.has(v.id);

        if (!matchedThisSession) return v;

        const addedUses = Math.max(textUses, aiCredited || deterministicIds.has(v.id) ? 1 : 0);
        const nextCount = (v.correctUseCount ?? 0) + addedUses;
        const shouldMarkMastered =
          v.mastered || aiCredited || nextCount >= MASTERY_TARGET_USES;

        if (shouldMarkMastered && !v.mastered) {
          promotedWords.push(v.betterAlternative);
          promotedIdSet.add(v.id);
        }

        return {
          ...v,
          mastered: shouldMarkMastered,
          correctUseCount: nextCount,
        };
      });

      if (canUseFirestore && cloudUser) {
        const uid = cloudUser.uid;
        void syncSessionToCloud(uid, newSession).catch(handleCloudSoftFailure);
        for (const v of newVocabEntries) {
          void syncVocabToCloud(uid, v).catch(handleCloudSoftFailure);
        }
        for (const v of updatedVocab) {
          if (promotedIdSet.has(v.id)) {
            void syncVocabToCloud(uid, v).catch(handleCloudSoftFailure);
          }
        }
        if (matchedSlotId) {
          const completedSlot = updatedSlots.find((s) => s.id === matchedSlotId);
          if (completedSlot) {
            void syncSlotToCloud(uid, completedSlot).catch(
              handleCloudSoftFailure
            );
          }
        }
      }

      const sessionExists = prev.sessions.some((s) => s.id === newSession.id);
      const nextSessions = sessionExists
        ? prev.sessions.map((s) => (s.id === newSession.id ? newSession : s))
        : [...prev.sessions, newSession];

      return {
        ...prev,
        sessions: nextSessions,
        vocabulary: [...updatedVocab, ...newVocabEntries],
        calendarSlots: updatedSlots,
      };
    });

    if (promotedWords.length === 0 && vault) {
      const ids = detectPracticingVocabUsed(newSession.content, vault.vocabulary);
      promotedWords = vault.vocabulary
        .filter((v) => ids.includes(v.id))
        .map((v) => v.betterAlternative);
    }

    return promotedWords;
  }

  function handleSaveDraft(draftSession: WritingSession) {
    if (canUseFirestore && cloudUser) {
      void syncSessionToCloud(cloudUser.uid, draftSession).catch(
        handleCloudSoftFailure
      );
    }
    void updateVaultState((prev) => {
      const exists = prev.sessions.some((s) => s.id === draftSession.id);
      const nextSessions = exists
        ? prev.sessions.map((s) => (s.id === draftSession.id ? draftSession : s))
        : [draftSession, ...prev.sessions];
      return {
        ...prev,
        sessions: nextSessions,
      };
    });
  }

  function handleDeleteDraft(draftId: string) {
    void updateVaultState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter(
        (s) => !(s.id === draftId && s.status === 'Draft')
      ),
    }));
  }

  function handleToggleLiveOfflineCheck() {
    void updateVaultState((prev) => {
      const nextSettings = {
        ...prev.settings,
        liveOfflineCheck: prev.settings.liveOfflineCheck === false,
      };
      if (canUseFirestore && cloudUser) {
        void ensureUserProfileDoc(cloudUser, nextSettings).catch(
          handleCloudSoftFailure
        );
      }
      return {
        ...prev,
        settings: nextSettings,
      };
    });
  }

  function handleAddVocabEntry(entry: VocabEntry) {
    if (canUseFirestore && cloudUser) {
      void syncVocabToCloud(cloudUser.uid, entry).catch(handleCloudSoftFailure);
    }
    void updateVaultState((prev) => ({
      ...prev,
      vocabulary: [entry, ...prev.vocabulary],
    }));
  }

  function handleToggleVocabMastered(id: string) {
    void updateVaultState((prev) => {
      const nextVocab = prev.vocabulary.map((v) =>
        v.id === id ? { ...v, mastered: !v.mastered } : v
      );
      if (canUseFirestore && cloudUser) {
        const updated = nextVocab.find((v) => v.id === id);
        if (updated) {
          void syncVocabToCloud(cloudUser.uid, updated).catch(
            handleCloudSoftFailure
          );
        }
      }
      return {
        ...prev,
        vocabulary: nextVocab,
      };
    });
  }

  function handleDeleteVocab(id: string) {
    if (canUseFirestore && cloudUser) {
      void deleteVocabFromCloud(cloudUser.uid, id).catch(handleCloudSoftFailure);
    }
    void updateVaultState((prev) => ({
      ...prev,
      vocabulary: prev.vocabulary.filter((v) => v.id !== id),
    }));
  }

  async function handleCategorizeVocabularyWithAI(): Promise<{
    updatedCount: number;
    usedAI: boolean;
  }> {
    if (!vault || vault.vocabulary.length === 0) {
      return { updatedCount: 0, usedAI: false };
    }

    let aiCategoryMap: Record<string, string> = {};
    let usedAI = false;

    try {
      const res = await fetch(getApiUrl('/api/categorize-vocab'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: vault.vocabulary.map((v) => ({
            id: v.id,
            used: v.used,
            betterAlternative: v.betterAlternative,
            explanation: v.explanation,
            mode: v.mode,
          })),
        }),
      });
      const data = await safeParseJsonResponse<{
        categories?: Record<string, string>;
      }>(res);
      if (res.ok && data?.categories && Object.keys(data.categories).length > 0) {
        aiCategoryMap = data.categories;
        usedAI = true;
      }
    } catch {
      // Fall back cleanly to instant semantic classification offline / on static pages
    }

    if (!usedAI) {
      for (const entry of vault.vocabulary) {
        aiCategoryMap[entry.id] = classifyVocabEntryLocally(entry);
      }
    }

    const updatedEntries = applyAiCategoriesToVocabulary(
      vault.vocabulary,
      aiCategoryMap
    );
    await updateVaultState((prev) => ({
      ...prev,
      vocabulary: applyAiCategoriesToVocabulary(prev.vocabulary, aiCategoryMap),
    }));

    return {
      updatedCount: updatedEntries.length,
      usedAI,
    };
  }

  function handleRecordUsedCurriculumId(curriculumId: string) {
    if (!curriculumId) return;
    void updateVaultState((prev) => {
      const current = prev.settings.usedCurriculumIds ?? [];
      if (current.includes(curriculumId)) return null;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          usedCurriculumIds: [...current, curriculumId],
        },
      };
    });
  }

  function handleAddCalendarSlot(slot: CalendarSlot) {
    if (canUseFirestore && cloudUser) {
      void syncSlotToCloud(cloudUser.uid, slot).catch(handleCloudSoftFailure);
    }
    void updateVaultState((prev) => ({
      ...prev,
      calendarSlots: [...prev.calendarSlots, slot],
    }));
  }

  function handleUpdateCalendarSlot(updatedSlot: CalendarSlot) {
    if (canUseFirestore && cloudUser) {
      void syncSlotToCloud(cloudUser.uid, updatedSlot).catch(
        handleCloudSoftFailure
      );
    }
    void updateVaultState((prev) => ({
      ...prev,
      calendarSlots: prev.calendarSlots.map((s) =>
        s.id === updatedSlot.id ? updatedSlot : s
      ),
    }));
  }

  function handleToggleSlotComplete(slotId: string) {
    void updateVaultState((prev) => {
      const nextSlots = prev.calendarSlots.map((s) =>
        s.id === slotId ? { ...s, completed: !s.completed } : s
      );
      if (canUseFirestore && cloudUser) {
        const updated = nextSlots.find((s) => s.id === slotId);
        if (updated) {
          void syncSlotToCloud(cloudUser.uid, updated).catch(
            handleCloudSoftFailure
          );
        }
      }
      return {
        ...prev,
        calendarSlots: nextSlots,
      };
    });
  }

  function handleDeleteSlot(slotId: string) {
    if (canUseFirestore && cloudUser) {
      void deleteSlotFromCloud(cloudUser.uid, slotId).catch(
        handleCloudSoftFailure
      );
    }
    void updateVaultState((prev) => ({
      ...prev,
      calendarSlots: prev.calendarSlots.filter((s) => s.id !== slotId),
    }));
  }

  async function handleVerifyVaultPassphrase(candidate: string): Promise<boolean> {
    if (!candidate) return false;
    if (
      cloudUser?.email &&
      activeStorageKey !== LOCAL_STORAGE_KEY &&
      activePassphrase === `quilit-account-${cloudUser.uid}` &&
      candidate.trim().toLowerCase() === cloudUser.email.trim().toLowerCase()
    ) {
      return true;
    }
    if (storedEnvelope) {
      try {
        await decryptVault(storedEnvelope, candidate);
        return true;
      } catch {
        return false;
      }
    }
    return Boolean(activePassphrase && candidate === activePassphrase);
  }

  function handleClearAllSlotsConfirmed() {
    if (!vault || vault.calendarSlots.length === 0) return;
    const slotIds = vault.calendarSlots.map((s) => s.id);
    if (canUseFirestore && cloudUser) {
      void clearAllSlotsFromCloud(cloudUser.uid, slotIds).catch(
        handleCloudSoftFailure
      );
    }
    setLinkedSlotId(undefined);
    void updateVaultState((prev) => ({
      ...prev,
      calendarSlots: [],
    }));
  }

  function handleSwapSingleSlot(slotId: string) {
    void updateVaultState((prev) => {
      let pickedId: string | null = null;
      const nextSlots = prev.calendarSlots.map((s) => {
        if (s.id !== slotId) return s;
        const swapped = swapSlotWithCurriculum({
          slot: s,
          existingSlots: prev.calendarSlots,
          sessions: prev.sessions,
          usedCurriculumIds: prev.settings.usedCurriculumIds,
          coachContext,
        });
        pickedId = swapped.pickedCurriculumId;
        return swapped.updatedSlot;
      });
      if (canUseFirestore && cloudUser) {
        const updated = nextSlots.find((s) => s.id === slotId);
        if (updated) {
          void syncSlotToCloud(cloudUser.uid, updated).catch(
            handleCloudSoftFailure
          );
        }
      }
      const nextUsedIds = pickedId
        ? Array.from(
            new Set([...(prev.settings.usedCurriculumIds ?? []), pickedId])
          )
        : prev.settings.usedCurriculumIds;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          usedCurriculumIds: nextUsedIds,
        },
        calendarSlots: nextSlots,
      };
    });
  }

  function handleLaunchSlotInStudio(slot: CalendarSlot) {
    setStudioInitialMode(slot.mode);
    setStudioInitialTone(slot.tone);
    setStudioInitialTopic(slot.topic);
    setStudioInitialSlot(`${slot.dayOfWeek} · ${slot.slotLabel}`);
    setLinkedSlotId(slot.id);
    setStudioKey((k) => k + 1);
    setActiveView('write');
  }

  async function handleChangePassphrase(
    newPassphrase: string
  ): Promise<string | null> {
    if (!vault) return null;
    await persistVault(vault, newPassphrase);
    setActivePassphrase(newPassphrase);
    if (activeStorageKeyRef.current === LOCAL_STORAGE_KEY) {
      const nextRecoveryKey = generateRecoveryKey();
      const nextLockbox = await encryptRecoveryLockbox(
        newPassphrase,
        nextRecoveryKey
      );
      saveOfflineRecoveryLockbox(nextLockbox);
      return nextRecoveryKey;
    }
    return null;
  }

  function handleResetVault() {
    localStorage.removeItem(activeStorageKeyRef.current);
    if (activeStorageKeyRef.current === LOCAL_STORAGE_KEY) {
      clearOfflineRecoveryLockbox();
    }
    manuallyLockedRef.current = true;
    setStoredEnvelope(loadStoredEnvelope(LOCAL_STORAGE_KEY));
    setVault(null);
    setActivePassphrase(null);
    setFocusMode(false);
    setShowEditProfileModal(false);
    setPendingWorkspaceTarget(null);
  }

  // Detect if a signed-in Cloud user also has a saved Offline Space on this browser
  const awaitingInitialCloudHydration = Boolean(
    vault &&
      canUseFirestore &&
      cloudUser &&
      (cloudSyncStatus === 'syncing' ||
        initialCloudSyncedUidRef.current !== cloudUser.uid)
  );

  useEffect(() => {
    if (!vault || !cloudUser || awaitingInitialCloudHydration) {
      setShowOfflineMigrationModal(false);
      return;
    }
    const localEnvelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
    const shouldPrompt = shouldPromptOfflineMigration({
      uid: cloudUser.uid,
      activeStorageKey,
      localStorageKey: LOCAL_STORAGE_KEY,
      offlineEnvelope: localEnvelope,
      record: loadOfflineMigrationRecord(),
    });
    if (shouldPrompt) {
      justMergedOfflineRef.current = false;
      setShowOfflineMigrationModal(true);
    }
  }, [vault, cloudUser, activeStorageKey, awaitingInitialCloudHydration]);

  async function handleMergeOfflineIntoCloud(
    offlinePassphrase: string,
    clearLocalAfterMerge: boolean
  ): Promise<{
    addedSessions: number;
    addedVocab: number;
    addedSlots: number;
  }> {
    if (!vault || !activePassphrase || !cloudUser) {
      throw new Error('Your cloud studio must be open before merging offline pages.');
    }
    const localEnvelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
    if (!localEnvelope) {
      throw new Error('No saved Offline Space was found on this browser.');
    }
    const offlineVault = await decryptVault(localEnvelope, offlinePassphrase);
    const { merged, addedSessions, addedVocab, addedSlots } =
      mergeOfflineIntoCloudVault(vault, offlineVault);

    await persistVault(merged, activePassphrase, activeStorageKeyRef.current);

    if (canUseFirestore) {
      try {
        await syncLocalVaultWithCloud(cloudUser, merged);
      } catch (err) {
        handleCloudSoftFailure(err);
      }
    }

    if (clearLocalAfterMerge) {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        clearOfflineRecoveryLockbox();
      } catch {
        // Ignore storage removal errors
      }
    }

    saveOfflineMigrationEntry(cloudUser.uid, localEnvelope.updatedAt, 'merged');
    justMergedOfflineRef.current = true;
    return { addedSessions, addedVocab, addedSlots };
  }

  function handleDismissOfflineMigration() {
    if (cloudUser && !justMergedOfflineRef.current) {
      const localEnvelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
      if (localEnvelope) {
        saveOfflineMigrationEntry(
          cloudUser.uid,
          localEnvelope.updatedAt,
          'dismissed'
        );
      }
    }
    justMergedOfflineRef.current = false;
    setShowOfflineMigrationModal(false);
  }

  // Trigger brief New-User Welcome Flashcard popup (~2.4s after studio opens) for Local & Cloud accounts
  useEffect(() => {
    if (!vault || !activePassphrase || showOfflineMigrationModal || activeView !== 'write') {
      setShowWelcomeFlashcard(false);
      return;
    }

    let forceWelcomeFromQuery = false;
    try {
      const params = new URLSearchParams(window.location.search);
      forceWelcomeFromQuery = params.get('welcome') === '1';
    } catch {
      // ignore
    }

    const onboardingDone =
      Boolean(vault.settings.studentProfile?.onboardingCompleted) ||
      isAutostartWithoutOnboarding();

    if (!onboardingDone && !forceWelcomeFromQuery) {
      setShowWelcomeFlashcard(false);
      return;
    }

    const eligible = shouldShowNewUserWelcomeFlashcard({
      welcomeFlashcardShown: vault.settings.welcomeFlashcardShown,
      sessionsCount: vault.sessions.length,
      calendarSlotsCount: vault.calendarSlots.length,
      onboardingCompleted: true,
    });

    if (!eligible) {
      return;
    }

    const delayMs = forceWelcomeFromQuery ? 600 : 2400;
    const timer = window.setTimeout(() => {
      setShowWelcomeFlashcard(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    vault,
    activePassphrase,
    showOfflineMigrationModal,
    activeView,
  ]);

  const handleDismissWelcomeFlashcard = useCallback(() => {
    setShowWelcomeFlashcard(false);
    void updateVaultState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        welcomeFlashcardShown: true,
      },
    }));
  }, [updateVaultState]);

  const handleAcceptWelcomeFlashcard = useCallback(async () => {
    if (!vault || !activePassphrase || welcomeFlashcardBusy) return;
    setWelcomeFlashcardBusy(true);
    try {
      const [ty, tm] = todayISO.split('-').map(Number);
      const targetYear = ty || new Date().getFullYear();
      const targetMonth0 = (tm || 1) - 1;
      const preferredDays = vault.settings.studentProfile?.preferredDays;

      let remainingSpecs = getRemainingMonthPreferredSpecs(
        targetYear,
        targetMonth0,
        todayISO,
        preferredDays
      );

      // If today is near month-end and no preferred weekdays remain in this month,
      // guarantee at least todayISO gets a starter topic so Write Studio opens ready to write.
      if (remainingSpecs.length === 0) {
        const dt = new Date(
          targetYear,
          targetMonth0,
          Number(todayISO.split('-')[2] || 1)
        );
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        remainingSpecs = [
          {
            scheduledDate: todayISO,
            dayOfWeek: dayNames[dt.getDay()] ?? 'Today',
            pillar: 'technical-concept',
          },
        ];
      }

      let createdSlots: CalendarSlot[] = [];
      let newlyUsedIds: string[] = [];

      // Attempt AI first-month suggestion first; fall back cleanly to 52-week curriculum offline/static
      try {
        const adaptiveWritingProfile = buildAdaptivePromptContext(
          vault.settings.studentProfile,
          vault.sessions,
          vault.vocabulary,
          todayISO
        );
        const res = await fetch(getApiUrl('/api/suggest-first-month'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            todayISO,
            targetSpecs: remainingSpecs,
            studentProfile: vault.settings.studentProfile,
            adaptiveWritingProfile,
            existingTopics: [
              ...vault.calendarSlots.map((s) => s.topic),
              ...vault.sessions.map((s) => s.topicDescription),
            ],
          }),
        });
        const data = await safeParseJsonResponse<{ slots?: CalendarSlot[] }>(res);
        if (res.ok && Array.isArray(data?.slots) && data.slots.length > 0) {
          createdSlots = data.slots.filter((s) => s.scheduledDate >= todayISO);
        }
      } catch {
        // Fallback below handles offline / GitHub Pages cleanly
      }

      if (createdSlots.length === 0) {
        const fallbackBuild = buildNonRepeatingMonthFromCurriculum({
          year: targetYear,
          monthIndex0: targetMonth0,
          todayISO,
          profile: vault.settings.studentProfile,
          existingSlots: vault.calendarSlots,
          sessions: vault.sessions,
          usedCurriculumIds: vault.settings.usedCurriculumIds,
          coachContext,
        });
        createdSlots = fallbackBuild.addedSlots;
        newlyUsedIds = fallbackBuild.newlyUsedCurriculumIds;

        // If month-end left 0 preferred days, pick 1 fresh curriculum topic for todayISO
        if (createdSlots.length === 0) {
          const { usedIds, usedTopicKeys } = collectUsedTopicInventory({
            slots: vault.calendarSlots,
            sessions: vault.sessions,
            usedCurriculumIds: vault.settings.usedCurriculumIds,
          });
          const picked = pickNextUnusedCurriculumTopic({
            usedIds,
            usedTopicKeys,
            pillar: remainingSpecs[0].pillar,
          });
          if (picked) {
            newlyUsedIds = [picked.id];
            createdSlots = [
              curriculumTopicToCalendarSlot({
                topic: picked,
                scheduledDate: remainingSpecs[0].scheduledDate,
                dayOfWeek: remainingSpecs[0].dayOfWeek,
                targetWordGoal: vault.settings.studentProfile?.targetWordGoal,
                coachContext,
                source: 'curriculum-52w',
              }),
            ];
          }
        }
      }

      const occupiedDates = new Set(vault.calendarSlots.map((s) => s.scheduledDate));
      const slotsToPersist = createdSlots.filter(
        (s) => s.scheduledDate >= todayISO && !occupiedDates.has(s.scheduledDate)
      );

      await updateVaultState((prev) => {
        if (canUseFirestore && cloudUser) {
          for (const s of slotsToPersist) {
            void syncSlotToCloud(cloudUser.uid, s).catch(handleCloudSoftFailure);
          }
        }
        return {
          ...prev,
          settings: {
            ...prev.settings,
            welcomeFlashcardShown: true,
            usedCurriculumIds: Array.from(
              new Set([
                ...(prev.settings.usedCurriculumIds ?? []),
                ...newlyUsedIds,
              ])
            ),
          },
          calendarSlots: [...prev.calendarSlots, ...slotsToPersist],
        };
      });

      setShowWelcomeFlashcard(false);

      const firstTopicSlot = slotsToPersist[0] ?? createdSlots[0];
      if (firstTopicSlot) {
        handleLaunchSlotInStudio(firstTopicSlot);
      }
    } finally {
      setWelcomeFlashcardBusy(false);
    }
  }, [
    vault,
    activePassphrase,
    welcomeFlashcardBusy,
    todayISO,
    coachContext,
    updateVaultState,
    canUseFirestore,
    cloudUser,
    handleCloudSoftFailure,
  ]);

  if (!vault) {
    const existingLocalEnvelope = loadStoredEnvelope(LOCAL_STORAGE_KEY);
    return (
      <VaultGate
        hasExistingVault={Boolean(existingLocalEnvelope)}
        existingLocalEnvelope={existingLocalEnvelope}
        theme={theme}
        onToggleTheme={toggleTheme}
        onGoogleSignIn={handleGoogleSignInFromGate}
        onEmailSignIn={handleEmailSignInFromGate}
        onEmailSignUp={handleEmailSignUpFromGate}
        onSendPasswordReset={handleSendPasswordReset}
        onCreateOfflineSpace={handleCreateOfflineSpace}
        onCompleteOfflineEntry={handleCompleteOfflineEntry}
        onUnlockVault={handleUnlockVault}
        onRecoverWithKey={handleRecoverOfflineWithKey}
        onRecoverWithSecurityAnswer={handleRecoverOfflineWithSecurityAnswer}
        onImportEncryptedBackup={handleImportEncryptedBackup}
      />
    );
  }

  const needsInitialOnboarding =
    !vault.settings.studentProfile?.onboardingCompleted &&
    !isAutostartWithoutOnboarding() &&
    !awaitingInitialCloudHydration;

  // Initial onboarding renders standalone as a distraction-free ink-filling flashcard flow
  // If an existing Offline Space can be merged into this brand-new Cloud account, offer it right away
  if (needsInitialOnboarding) {
    return (
      <>
        <OnboardingProfileModal
          initialProfile={vault.settings.studentProfile}
          initialNotificationsEnabled={vault.settings.notificationsEnabled !== false}
          initialLiveOfflineCheck={vault.settings.liveOfflineCheck !== false}
          isEditingExisting={false}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSave={handleSaveStudentProfile}
        />
        <OfflineMigrationModal
          open={showOfflineMigrationModal}
          accountEmail={cloudUser?.email ?? null}
          onMergeOfflineSpace={handleMergeOfflineIntoCloud}
          onKeepSeparate={handleDismissOfflineMigration}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-primary">
      {!(activeView === 'write' && focusMode) && (
        <Header
          activeView={activeView}
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={(view) => {
            setFocusMode(false);
            if (view === 'write') {
              setWriteEvalHasUnreadResult(false);
            }
            if (view === 'converse') {
              setConverseHasUnreadResult(false);
            }
            setActiveView(view);
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }}
          onLockVault={handleLockVault}
          cloudUserEmail={cloudUser?.email}
          cloudSyncStatus={cloudSyncStatus}
          onConnectCloud={() => {
            if (cloudSyncStatus === 'workspace-fallback' || cloudUser) {
              setActiveView('vault');
            } else {
              void handleConnectCloud();
            }
          }}
          notificationSummary={notificationSummary}
          notificationsEnabled={Boolean(vault.settings.notificationsEnabled)}
          browserPermission={browserPermission}
          onToggleNotifications={() => void handleToggleNotifications()}
          onOpenTaskFromNotification={(slot) => {
            handleLaunchSlotInStudio(slot);
          }}
          writeEvaluationState={{
            inProgress: writeEvalInProgress,
            hasUnreadResult: writeEvalHasUnreadResult,
          }}
          converseStatus={{
            inProgress: converseInProgress,
            hasUnreadResult: converseHasUnreadResult,
            hasActiveChat: converseHasActiveChat,
          }}
        />
      )}

      {cloudUser && !cloudUser.emailVerified && !(activeView === 'write' && focusMode) && (
        <div
          role="status"
          className="border-b border-status-warning-border bg-status-warning-soft px-4 sm:px-6 py-2.5"
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs text-status-warning">
            <span>
              {verificationNotice ||
                `Verify ${cloudUser.email || 'your email'} to activate live cross-device Firestore sync.`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={verificationBusy}
                onClick={() => void handleResendVerification()}
                className="btn-secondary px-2.5 py-1 text-xs font-medium"
              >
                Resend Email
              </button>
              <button
                type="button"
                disabled={verificationBusy}
                onClick={() => void handleRefreshVerification()}
                className="btn-primary px-2.5 py-1 text-xs font-medium"
              >
                {verificationBusy ? 'Checking...' : "I've Verified — Sync Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* Keep WriteStudio persistently mounted so active drafts, cursor context, and in-progress AI evaluations survive tab switches */}
        <div
          className={activeView === 'write' ? 'block' : 'hidden'}
          aria-hidden={activeView !== 'write'}
        >
          <WriteStudio
            key={studioKey}
            todayISO={todayISO}
            theme={theme}
            focusMode={focusMode}
            onToggleTheme={toggleTheme}
            onToggleFocusMode={() => setFocusMode((f) => !f)}
            sessions={vault.sessions}
            vocabulary={vault.vocabulary}
            calendarSlots={vault.calendarSlots}
            studentProfile={vault.settings.studentProfile}
            coachContext={coachContext}
            autoReloadSchedule={vault.settings.autoReloadSchedule !== false}
            refreshingSchedule={refreshingSchedule}
            scheduleError={scheduleError}
            activeAiModelLabel={activeAiModelLabel}
            pendingEvalSessionsCount={pendingEvalSessions.length}
            onRefreshTriWeeklySchedule={() => handleRefreshTriWeeklySchedule()}
            onToggleAutoReloadSchedule={handleToggleAutoReloadSchedule}
            onSwapSingleSlot={handleSwapSingleSlot}
            onClearAllSlots={() => setShowClearTasksModal(true)}
            onUpdateSlot={handleUpdateCalendarSlot}
            onOpenCalendar={() => setActiveView('calendar')}
            initialMode={studioInitialMode}
            initialTone={studioInitialTone}
            initialTopic={studioInitialTopic}
            initialDaySlot={studioInitialSlot}
            linkedCalendarSlotId={linkedSlotId}
            dailyWordGoal={
              vault.settings.dailyWordGoal ||
              vault.settings.studentProfile?.targetWordGoal ||
              250
            }
            liveOfflineCheckEnabled={vault.settings.liveOfflineCheck !== false}
            onToggleLiveOfflineCheck={handleToggleLiveOfflineCheck}
            onSaveSession={handleSaveSession}
            onSaveDraft={handleSaveDraft}
            onDeleteDraft={handleDeleteDraft}
            usedCurriculumIds={vault.settings.usedCurriculumIds}
            onRecordUsedCurriculumId={handleRecordUsedCurriculumId}
            onAddVocabEntry={handleAddVocabEntry}
            onOpenScheduledPopup={(slot) => setActivePopupSlot(slot)}
            onEvaluationStateChange={handleWriteEvaluationStateChange}
          />
        </div>

        {/* Keep ConverseStudio persistently mounted so live chats and evaluations stay intact across tab switches */}
        <div
          className={activeView === 'converse' ? 'block' : 'hidden'}
          aria-hidden={activeView !== 'converse'}
        >
          <ConverseStudio
            todayISO={todayISO}
            studentProfile={vault.settings.studentProfile}
            vocabulary={vault.vocabulary}
            coachContext={coachContext}
            onSaveSession={handleSaveSession}
            onAddVocabEntry={handleAddVocabEntry}
            onConverseStatusChange={handleConverseStatusChange}
          />
        </div>

        {activeView === 'dashboard' && (
          <DashboardView
            sessions={vault.sessions}
            vocabulary={vault.vocabulary}
            calendarSlots={vault.calendarSlots}
            todayISO={todayISO}
            theme={theme}
            onStartWriting={() => setActiveView('write')}
          />
        )}

        {activeView === 'calendar' && (
          <CalendarView
            slots={vault.calendarSlots}
            sessions={vault.sessions}
            todayISO={todayISO}
            preferredDays={vault.settings.studentProfile?.preferredDays}
            autoReloadSchedule={vault.settings.autoReloadSchedule !== false}
            refreshingSchedule={refreshingSchedule}
            scheduleError={scheduleError}
            periodicAiStatus={periodicAiStatus}
            onToggleAutoReloadSchedule={handleToggleAutoReloadSchedule}
            onRefreshTriWeeklySchedule={() => handleRefreshTriWeeklySchedule()}
            onLoadMonthTriWeekly={handleLoadMonthTriWeekly}
            onRegenerateMonthWithAI={handleRegenerateMonthWithAI}
            onAddSlot={handleAddCalendarSlot}
            onUpdateSlot={handleUpdateCalendarSlot}
            onSwapSingleSlot={handleSwapSingleSlot}
            onToggleSlotComplete={handleToggleSlotComplete}
            onDeleteSlot={handleDeleteSlot}
            onClearAllSlots={() => setShowClearTasksModal(true)}
            onLaunchSlotInStudio={handleLaunchSlotInStudio}
            onOpenScheduledPopup={(slot) => setActivePopupSlot(slot)}
          />
        )}

        {activeView === 'vocabulary' && (
          <VocabularyView
            vocabulary={vault.vocabulary}
            sessions={vault.sessions}
            todayISO={todayISO}
            onAddVocab={handleAddVocabEntry}
            onToggleMastered={handleToggleVocabMastered}
            onDeleteVocab={handleDeleteVocab}
            onCategorizeWithAI={handleCategorizeVocabularyWithAI}
          />
        )}

        {activeView === 'vault' && (
          <VaultSettingsView
            vault={vault}
            todayISO={todayISO}
            cloudUser={
              cloudUser
                ? {
                    uid: cloudUser.uid,
                    email: cloudUser.email,
                    displayName: cloudUser.displayName,
                    emailVerified: cloudUser.emailVerified,
                  }
                : null
            }
            cloudSyncStatus={cloudSyncStatus}
            cloudSyncError={cloudSyncError}
            hasFirestoreConfigured={hasConfiguredFirestoreDatabase}
            workspaceBusy={workspaceBusy}
            workspaceMessage={workspaceMessage}
            workspaceError={workspaceError}
            hasWorkspaceToken={workspaceTokenReady}
            onConnectCloud={handleConnectCloud}
            onForceCloudSync={handleForceCloudSync}
            onDisconnectCloud={handleDisconnectCloud}
            onResendVerification={handleResendVerification}
            onRefreshVerification={handleRefreshVerification}
            onRequestSyncSheets={() => void handleRequestWorkspaceSync('sheets')}
            onRequestSyncDocs={() => void handleRequestWorkspaceSync('docs')}
            onPullFromSheets={handlePullFromSheets}
            onEditProfile={() => setShowEditProfileModal(true)}
            onRebuildMonthSchedule={handleRebuildRollingMonth}
            onExportEncryptedBackup={async () => {
              if (storedEnvelope) return storedEnvelope;
              const pass = activePassphrase || 'demo-autostart-pass';
              const envelope = await encryptVault(vault, pass);
              setStoredEnvelope(envelope);
              return envelope;
            }}
            onChangePassphrase={handleChangePassphrase}
            onRestoreBackup={handleImportEncryptedBackup}
            onResetVault={handleResetVault}
          />
        )}
      </main>

      {showEditProfileModal && (
        <OnboardingProfileModal
          initialProfile={vault.settings.studentProfile}
          initialNotificationsEnabled={Boolean(vault.settings.notificationsEnabled)}
          initialLiveOfflineCheck={vault.settings.liveOfflineCheck !== false}
          isEditingExisting={true}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSave={handleSaveStudentProfile}
          onClose={() => setShowEditProfileModal(false)}
        />
      )}

      {pendingWorkspaceTarget && (
        <WorkspaceSyncConfirmModal
          target={pendingWorkspaceTarget}
          sessionsCount={vault.sessions.length}
          slotsCount={vault.calendarSlots.length}
          vocabCount={vault.vocabulary.length}
          hasExistingFile={
            pendingWorkspaceTarget === 'sheets'
              ? Boolean(vault.settings.googleSpreadsheetId)
              : Boolean(vault.settings.googleDocId)
          }
          busy={workspaceBusy}
          onConfirm={() => void handleConfirmWorkspaceSync()}
          onCancel={() => {
            if (!workspaceBusy) setPendingWorkspaceTarget(null);
          }}
        />
      )}

      {activePopupSlot && (
        <ScheduledTaskModal
          slot={activePopupSlot}
          todayISO={todayISO}
          studentProfile={vault.settings.studentProfile}
          coachContext={coachContext}
          onClose={() => setActivePopupSlot(null)}
          onUpdateSlot={handleUpdateCalendarSlot}
          onCompleteTask={(session, newVocab, slotId, aiMasteredWords) =>
            handleSaveSession(session, newVocab, slotId, aiMasteredWords)
          }
        />
      )}

      {showClearTasksModal && vault.calendarSlots.length > 0 && (
        <ClearTasksModal
          totalCount={vault.calendarSlots.length}
          pendingCount={vault.calendarSlots.filter((s) => !s.completed).length}
          completedCount={vault.calendarSlots.filter((s) => s.completed).length}
          cloudConnected={canUseFirestore}
          onVerifyPassphrase={handleVerifyVaultPassphrase}
          onConfirmedClear={handleClearAllSlotsConfirmed}
          onClose={() => setShowClearTasksModal(false)}
        />
      )}

      <OfflineMigrationModal
        open={showOfflineMigrationModal}
        accountEmail={cloudUser?.email ?? null}
        onMergeOfflineSpace={handleMergeOfflineIntoCloud}
        onKeepSeparate={handleDismissOfflineMigration}
      />

      <WelcomeTopicFlashcard
        open={showWelcomeFlashcard}
        monthLabel={new Date(
          Number(todayISO.split('-')[0] || 2026),
          Number(todayISO.split('-')[1] || 1) - 1,
          1
        ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        rhythmShortList={
          formatWritingDaysSummary(vault.settings.studentProfile?.preferredDays)
            .shortList
        }
        busy={welcomeFlashcardBusy}
        onAccept={handleAcceptWelcomeFlashcard}
        onDismiss={handleDismissWelcomeFlashcard}
      />
    </div>
  );
}
