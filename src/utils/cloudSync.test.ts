import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserSettings } from '../types';
import {
  mergeHydratedProfileSettings,
  normalizeCloudMode,
  parseFirestoreTimestamp,
} from './cloudSyncHelpers';

test('parseFirestoreTimestamp preserves Firestore Timestamp .toDate(), raw seconds, and ISO strings', () => {
  const expectedIso = '2026-03-14T08:30:00.000Z';
  assert.equal(
    parseFirestoreTimestamp({ toDate: () => new Date(expectedIso) }),
    expectedIso
  );
  assert.equal(
    parseFirestoreTimestamp({ seconds: Math.floor(Date.parse(expectedIso) / 1000) }),
    expectedIso
  );
  assert.equal(parseFirestoreTimestamp(expectedIso), expectedIso);
  assert.equal(
    parseFirestoreTimestamp(undefined, '2026-01-01T00:00:00.000Z'),
    '2026-01-01T00:00:00.000Z'
  );
});

test('normalizeCloudMode preserves converse mode alongside all 6 writing modes', () => {
  assert.equal(normalizeCloudMode('converse'), 'converse');
  assert.equal(normalizeCloudMode('technical'), 'technical');
  assert.equal(normalizeCloudMode('linkedin'), 'linkedin');
  assert.equal(normalizeCloudMode('unknown-mode'), 'technical');
});

test('mergeHydratedProfileSettings hydrates cloud settings on fresh devices without overwriting with local defaults', () => {
  const freshLocal: UserSettings = {
    semesterLabel: '',
    dailyWordGoal: 200,
    autoSaveVocab: true,
    focusModeDefault: false,
    autoReloadSchedule: true,
  };
  const cloudDoc = {
    semesterLabel: '3rd Year · 6th Sem EIE',
    dailyWordGoal: 400,
    autoSaveVocab: false,
    focusModeDefault: true,
    autoReloadSchedule: false,
    onboardingCompleted: true,
    collegeDegree: 'B.E. Electronics & Instrumentation',
    semester: '6th Semester',
    collegeName: 'Anna University',
    age: 20,
    customCoachPrompt: 'Keep explanations crisp for placement panels.',
    coachPresets: ['ban-corporate-slop'],
  };

  const hydrated = mergeHydratedProfileSettings(freshLocal, cloudDoc);
  assert.equal(hydrated.dailyWordGoal, 400);
  assert.equal(hydrated.autoSaveVocab, false);
  assert.equal(hydrated.focusModeDefault, true);
  assert.equal(hydrated.autoReloadSchedule, false);
  assert.equal(hydrated.semesterLabel, '3rd Year · 6th Sem EIE');
  assert.equal(hydrated.studentProfile?.onboardingCompleted, true);
  assert.equal(
    hydrated.customCoachPrompt,
    'Keep explanations crisp for placement panels.'
  );
});
