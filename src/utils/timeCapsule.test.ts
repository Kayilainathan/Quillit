import test from 'node:test';
import assert from 'node:assert/strict';
import type { WritingSession } from '../types';
import {
  computeTimeCapsuleDelta,
  findTimeCapsuleCandidate,
  getTimeCapsuleStatus,
} from './timeCapsule';

function makeSession(overrides: Partial<WritingSession>): WritingSession {
  return {
    id: 's1',
    date: '2026-10-01',
    daySlot: 'Wednesday',
    mode: 'technical',
    promptCategory: 'Technical',
    tone: 'crisp-direct',
    topicDescription: 'Explain why 4-20 mA beats 0-10 V',
    content: 'A long enough completed writing draft with concrete technical details about sensors and loops.',
    wordCount: 95,
    scores: {
      naturalVoiceFlow: 6,
      claritySimplicity: 7,
      grammarMechanics: 6,
      toneEngagement: 6,
      sentenceVarietyCadence: 6,
      concisenessDirectness: 6,
    },
    totalScore: 37,
    percentage: 61.7,
    cefrLevel: 'B2',
    toneVerdict: 'Clear',
    flowVerdict: 'Steady',
    feedbackImplemented: 'Baseline',
    whatImproved: 'Baseline',
    strictImprovements: 'Trim filler.',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

test('findTimeCapsuleCandidate prioritizes 30+ day sessions and offers preview at >= 3 sessions', () => {
  const sOld = makeSession({ id: 'old-1', date: '2026-10-10' });
  const candidate30 = findTimeCapsuleCandidate([sOld], '2026-11-23');
  assert.ok(candidate30);
  assert.equal(candidate30.isFull30Day, true);
  assert.equal(candidate30.session.id, 'old-1');

  const recent2 = [
    makeSession({ id: 'r1', date: '2026-11-20' }),
    makeSession({ id: 'r2', date: '2026-11-21' }),
  ];
  assert.equal(findTimeCapsuleCandidate(recent2, '2026-11-23'), null);

  const recent3 = [...recent2, makeSession({ id: 'r3', date: '2026-11-22' })];
  const preview = findTimeCapsuleCandidate(recent3, '2026-11-23');
  assert.ok(preview);
  assert.equal(preview.isFull30Day, false);
  assert.equal(preview.session.id, 'r1');
});

test('getTimeCapsuleStatus returns natural-language locked progress for new users and unlocked candidates once ready', () => {
  const emptyStatus = getTimeCapsuleStatus([], '2026-11-23');
  assert.equal(emptyStatus.state, 'locked');
  assert.equal(emptyStatus.completedCount, 0);
  assert.equal(emptyStatus.remainingCount, 3);
  assert.match(emptyStatus.naturalMessage, /Write 3 completed entries/i);

  const twoSessions = [
    makeSession({ id: 'r1', date: '2026-11-20' }),
    makeSession({ id: 'r2', date: '2026-11-21' }),
  ];
  const twoStatus = getTimeCapsuleStatus(twoSessions, '2026-11-23');
  assert.equal(twoStatus.state, 'locked');
  assert.equal(twoStatus.remainingCount, 1);
  assert.match(twoStatus.naturalMessage, /Write 1 more entry/i);

  const threeSessions = [
    ...twoSessions,
    makeSession({ id: 'r3', date: '2026-11-22', topicDescription: 'Clear technical handover' }),
  ];
  const unlocked = getTimeCapsuleStatus(threeSessions, '2026-11-23');
  assert.equal(unlocked.state, 'ready');
  assert.ok(unlocked.candidate);
  assert.equal(unlocked.allEligibleCandidates.length, 3);
  assert.match(unlocked.naturalMessage, /Unlocked/i);
});

test('computeTimeCapsuleDelta calculates exact score and percentage growth', () => {
  const origin = makeSession({ totalScore: 38, percentage: 63.3, wordCount: 110 });
  const delta = computeTimeCapsuleDelta(origin, {
    totalScore: 46,
    percentage: 76.7,
    wordCount: 95,
  });
  assert.equal(delta.scoreDelta, 8);
  assert.equal(delta.percentageDelta, 13.4);
  assert.equal(delta.wordDelta, -15);
  assert.ok(delta.headline.includes('+8 points'));
});
