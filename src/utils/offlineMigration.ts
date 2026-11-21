import type { EncryptedEnvelope, VaultPayload } from '../types';
import { mergeVaultPayloads, stripPredefinedSeedData } from './analytics';

const MIGRATION_RECORD_KEY = 'quilit_offline_migration_v1';

export interface OfflineMigrationEntry {
  offlineUpdatedAt: string;
  action: 'merged' | 'dismissed';
  handledAt: string;
}

export type OfflineMigrationRecord = Record<string, OfflineMigrationEntry>;

export function loadOfflineMigrationRecord(): OfflineMigrationRecord {
  try {
    const raw = localStorage.getItem(MIGRATION_RECORD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as OfflineMigrationRecord;
  } catch {
    return {};
  }
}

export function saveOfflineMigrationEntry(
  uid: string,
  offlineUpdatedAt: string,
  action: 'merged' | 'dismissed'
): void {
  try {
    const current = loadOfflineMigrationRecord();
    current[uid] = {
      offlineUpdatedAt,
      action,
      handledAt: new Date().toISOString(),
    };
    localStorage.setItem(MIGRATION_RECORD_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

/**
 * Determines whether we should offer to bring an existing Offline Space
 * into the newly signed-in Cloud account.
 * Returns true only when an offline envelope exists AND has not already been
 * merged or dismissed for this account at the same offline updatedAt timestamp.
 */
export function shouldPromptOfflineMigration(params: {
  uid: string | null | undefined;
  activeStorageKey: string;
  localStorageKey: string;
  offlineEnvelope: EncryptedEnvelope | null;
  record: OfflineMigrationRecord;
}): boolean {
  const { uid, activeStorageKey, localStorageKey, offlineEnvelope, record } =
    params;
  if (!uid || !offlineEnvelope) return false;
  // Already operating directly on the local offline space
  if (activeStorageKey === localStorageKey) return false;

  const existing = record[uid];
  if (!existing) return true;

  // If the user wrote newer offline pages after previously dismissing/merging, offer again
  return existing.offlineUpdatedAt !== offlineEnvelope.updatedAt;
}

/**
 * Safely merges a decrypted Offline Space payload into a signed-in Cloud account payload.
 * Preserves all sessions, drafts, calendar tasks, and vocabulary from both spaces without
 * duplicates, and carries over the offline onboarding profile when the cloud account
 * has not finished onboarding yet.
 */
export function mergeOfflineIntoCloudVault(
  cloudVault: VaultPayload,
  offlineVault: VaultPayload
): {
  merged: VaultPayload;
  addedSessions: number;
  addedVocab: number;
  addedSlots: number;
} {
  const cleanCloud = stripPredefinedSeedData(cloudVault).cleaned;
  const cleanOffline = stripPredefinedSeedData(offlineVault).cleaned;

  const baseMerged = mergeVaultPayloads(cleanCloud, cleanOffline);

  const cloudHasProfile = Boolean(
    cleanCloud.settings.studentProfile?.onboardingCompleted
  );
  const offlineHasProfile = Boolean(
    cleanOffline.settings.studentProfile?.onboardingCompleted
  );

  const mergedSettings = {
    ...cleanOffline.settings,
    ...cleanCloud.settings,
    studentProfile: cloudHasProfile
      ? cleanCloud.settings.studentProfile
      : offlineHasProfile
        ? cleanOffline.settings.studentProfile
        : cleanCloud.settings.studentProfile ??
          cleanOffline.settings.studentProfile,
  };

  const merged: VaultPayload = {
    ...baseMerged,
    settings: mergedSettings,
    updatedAt: new Date().toISOString(),
  };

  return {
    merged,
    addedSessions: Math.max(
      0,
      merged.sessions.length - cleanCloud.sessions.length
    ),
    addedVocab: Math.max(
      0,
      merged.vocabulary.length - cleanCloud.vocabulary.length
    ),
    addedSlots: Math.max(
      0,
      merged.calendarSlots.length - cleanCloud.calendarSlots.length
    ),
  };
}
