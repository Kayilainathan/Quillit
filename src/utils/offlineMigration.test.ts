import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeOfflineIntoCloudVault,
  shouldPromptOfflineMigration,
} from './offlineMigration';
import { createEmptyVaultPayload } from './analytics';
import type { EncryptedEnvelope, WritingSession } from '../types';

const sampleEnvelope: EncryptedEnvelope = {
  format: 'cadence-aes-gcm-v1',
  iterations: 250_000,
  salt: 'abc',
  iv: 'def',
  ciphertext: 'ghi',
  updatedAt: '2026-11-20T12:00:00.000Z',
};

function makeSession(id: string, topic: string): WritingSession {
  return {
    id,
    date: '2026-11-20',
    daySlot: 'Studio Session',
    mode: 'journal',
    promptCategory: 'Personal Journal',
    tone: 'conversational',
    topicDescription: topic,
    content: 'A quiet reflection written on a rainy evening.',
    wordCount: 8,
    scores: {
      naturalVoiceFlow: 8,
      claritySimplicity: 8,
      grammarMechanics: 8,
      toneEngagement: 8,
      sentenceVarietyCadence: 8,
      concisenessDirectness: 8,
    },
    totalScore: 48,
    percentage: 80,
    cefrLevel: 'B2',
    toneVerdict: 'Warm',
    flowVerdict: 'Smooth',
    feedbackImplemented: 'Baseline',
    whatImproved: '',
    strictImprovements: '',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: '2026-11-20T12:00:00.000Z',
  };
}

test('shouldPromptOfflineMigration triggers once per offline envelope timestamp and re-prompts if newer offline writes occur', () => {
  assert.equal(
    shouldPromptOfflineMigration({
      uid: 'user-1',
      activeStorageKey: 'quilit_vault_account_user-1',
      localStorageKey: 'quilit_vault_v1',
      offlineEnvelope: sampleEnvelope,
      record: {},
    }),
    true
  );

  // Already dismissed for this exact envelope timestamp -> do not nag
  assert.equal(
    shouldPromptOfflineMigration({
      uid: 'user-1',
      activeStorageKey: 'quilit_vault_account_user-1',
      localStorageKey: 'quilit_vault_v1',
      offlineEnvelope: sampleEnvelope,
      record: {
        'user-1': {
          offlineUpdatedAt: sampleEnvelope.updatedAt,
          action: 'dismissed',
          handledAt: '2026-11-20T12:05:00.000Z',
        },
      },
    }),
    false
  );

  // Newer offline edit later -> offer again
  assert.equal(
    shouldPromptOfflineMigration({
      uid: 'user-1',
      activeStorageKey: 'quilit_vault_account_user-1',
      localStorageKey: 'quilit_vault_v1',
      offlineEnvelope: {
        ...sampleEnvelope,
        updatedAt: '2026-11-21T09:00:00.000Z',
      },
      record: {
        'user-1': {
          offlineUpdatedAt: sampleEnvelope.updatedAt,
          action: 'dismissed',
          handledAt: '2026-11-20T12:05:00.000Z',
        },
      },
    }),
    true
  );

  // Operating directly on local offline space -> never prompt
  assert.equal(
    shouldPromptOfflineMigration({
      uid: 'user-1',
      activeStorageKey: 'quilit_vault_v1',
      localStorageKey: 'quilit_vault_v1',
      offlineEnvelope: sampleEnvelope,
      record: {},
    }),
    false
  );
});

test('mergeOfflineIntoCloudVault carries offline profile & drafts into a new cloud account without duplicates', () => {
  const newCloud = createEmptyVaultPayload();
  const offline = createEmptyVaultPayload();
  offline.settings.studentProfile = {
    displayName: 'Aarav',
    age: 21,
    collegeName: 'PSG College of Technology',
    collegeDegree: '',
    semester: '',
    onboardingCompleted: true,
    preferredDays: [1, 3, 5],
    reminderTime: '18:30',
  };
  offline.sessions = [makeSession('s-offline-1', 'Evening notebook draft')];

  const result = mergeOfflineIntoCloudVault(newCloud, offline);
  assert.equal(result.addedSessions, 1);
  assert.equal(result.merged.sessions.length, 1);
  assert.equal(result.merged.settings.studentProfile?.displayName, 'Aarav');
  assert.equal(result.merged.settings.studentProfile?.onboardingCompleted, true);
});

test('mergeOfflineIntoCloudVault preserves existing cloud profile while merging offline and cloud sessions cleanly', () => {
  const existingCloud = createEmptyVaultPayload();
  existingCloud.settings.studentProfile = {
    displayName: 'Meera',
    age: 22,
    collegeName: 'IIT Madras',
    collegeDegree: '',
    semester: '',
    onboardingCompleted: true,
  };
  existingCloud.sessions = [makeSession('s-cloud-1', 'Morning essay')];

  const offline = createEmptyVaultPayload();
  offline.settings.studentProfile = {
    displayName: 'Offline Alias',
    age: 20,
    collegeName: 'Local College',
    collegeDegree: '',
    semester: '',
    onboardingCompleted: true,
  };
  offline.sessions = [
    makeSession('s-cloud-1', 'Morning essay'),
    makeSession('s-offline-2', 'Train window notes'),
  ];

  const result = mergeOfflineIntoCloudVault(existingCloud, offline);
  assert.equal(result.addedSessions, 1);
  assert.equal(result.merged.sessions.length, 2);
  assert.equal(result.merged.settings.studentProfile?.displayName, 'Meera');
});
