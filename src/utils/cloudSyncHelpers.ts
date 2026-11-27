import type { UserSettings, WritingMode } from '../types';

export const VALID_CLOUD_MODES: ReadonlyArray<WritingMode | 'converse'> = [
  'journal',
  'linkedin',
  'email',
  'friend',
  'technical',
  'creative',
  'converse',
];

export function normalizeCloudMode(m: unknown): WritingMode | 'converse' {
  const str = typeof m === 'string' ? m.trim().toLowerCase() : '';
  return (VALID_CLOUD_MODES as readonly string[]).includes(str)
    ? (str as WritingMode | 'converse')
    : 'technical';
}

export function parseFirestoreTimestamp(
  raw: unknown,
  fallbackISO?: string
): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const maybeTs = raw as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      const dt = maybeTs.toDate();
      if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
        return dt.toISOString();
      }
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return new Date(maybeTs.seconds * 1000).toISOString();
    }
  }
  return fallbackISO ?? new Date().toISOString();
}

export function mergeHydratedProfileSettings(
  local: UserSettings,
  existing: Record<string, unknown>
): Partial<UserSettings> {
  const hydrated: Partial<UserSettings> = {};
  const isFreshDevice = !local.studentProfile?.onboardingCompleted;

  if (
    isFreshDevice &&
    existing.onboardingCompleted === true &&
    typeof existing.collegeDegree === 'string' &&
    typeof existing.semester === 'string' &&
    typeof existing.collegeName === 'string'
  ) {
    hydrated.studentProfile = {
      collegeDegree: existing.collegeDegree,
      semester: existing.semester,
      collegeName: existing.collegeName,
      age:
        typeof existing.age === 'number' && existing.age >= 14 && existing.age <= 80
          ? existing.age
          : 20,
      onboardingCompleted: true,
    };
  }

  // Hydrate core user settings from cloud on fresh/default devices so local defaults don't clobber cloud values
  if (
    (isFreshDevice || !local.semesterLabel) &&
    typeof existing.semesterLabel === 'string' &&
    existing.semesterLabel.trim().length > 0
  ) {
    hydrated.semesterLabel = existing.semesterLabel.slice(0, 120);
  }
  if (
    (isFreshDevice || local.dailyWordGoal === 200 || local.dailyWordGoal === 250) &&
    typeof existing.dailyWordGoal === 'number' &&
    existing.dailyWordGoal >= 50 &&
    existing.dailyWordGoal <= 5000
  ) {
    hydrated.dailyWordGoal = Math.round(existing.dailyWordGoal);
  }
  if (isFreshDevice && typeof existing.autoSaveVocab === 'boolean') {
    hydrated.autoSaveVocab = existing.autoSaveVocab;
  }
  if (isFreshDevice && typeof existing.focusModeDefault === 'boolean') {
    hydrated.focusModeDefault = existing.focusModeDefault;
  }
  if (isFreshDevice && typeof existing.autoReloadSchedule === 'boolean') {
    hydrated.autoReloadSchedule = existing.autoReloadSchedule;
  }
  if (
    !local.googleSpreadsheetId &&
    typeof existing.googleSpreadsheetId === 'string' &&
    existing.googleSpreadsheetId
  ) {
    hydrated.googleSpreadsheetId = existing.googleSpreadsheetId;
    hydrated.googleSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${existing.googleSpreadsheetId}/edit`;
  }
  if (
    !local.googleDocId &&
    typeof existing.googleDocId === 'string' &&
    existing.googleDocId
  ) {
    hydrated.googleDocId = existing.googleDocId;
    hydrated.googleDocUrl = `https://docs.google.com/document/d/${existing.googleDocId}/edit`;
  }
  if (
    !local.customCoachPrompt &&
    typeof existing.customCoachPrompt === 'string' &&
    existing.customCoachPrompt
  ) {
    hydrated.customCoachPrompt = existing.customCoachPrompt.slice(0, 500);
  }
  if (
    (!local.coachPresets || local.coachPresets.length === 0) &&
    Array.isArray(existing.coachPresets)
  ) {
    hydrated.coachPresets = existing.coachPresets.slice(0, 8) as UserSettings['coachPresets'];
  }
  if (
    typeof local.tactileSoundEnabled !== 'boolean' &&
    typeof existing.tactileSoundEnabled === 'boolean'
  ) {
    hydrated.tactileSoundEnabled = existing.tactileSoundEnabled;
  }
  if (
    typeof local.vaultLatchEnabled !== 'boolean' &&
    typeof existing.vaultLatchEnabled === 'boolean'
  ) {
    hydrated.vaultLatchEnabled = existing.vaultLatchEnabled;
  }

  return hydrated;
}
