import test from 'node:test';
import assert from 'node:assert/strict';
import type { WritingSession } from '../types';
import {
  buildConverseVsWrittenAnalytics,
  isConverseSession,
} from './converseAnalytics';

function makeSession(overrides: Partial<WritingSession>): WritingSession {
  return {
    id: overrides.id ?? 'SESS_20261120_AAAA',
    date: overrides.date ?? '2026-11-20',
    daySlot: overrides.daySlot ?? 'Mon · Evening',
    mode: overrides.mode ?? 'journal',
    promptCategory: overrides.promptCategory ?? 'Personal Journal',
    tone: overrides.tone ?? 'conversational',
    topicDescription: overrides.topicDescription ?? 'Evening reflection',
    content: overrides.content ?? 'Sample writing session content.',
    wordCount: overrides.wordCount ?? 180,
    scores: overrides.scores ?? {
      naturalVoiceFlow: 8,
      claritySimplicity: 8,
      grammarMechanics: 8,
      toneEngagement: 8,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 8,
    },
    totalScore: overrides.totalScore ?? 47,
    percentage: overrides.percentage ?? 78.3,
    cefrLevel: overrides.cefrLevel ?? 'B2+',
    toneVerdict: 'Consistent tone.',
    flowVerdict: 'Smooth cadence.',
    feedbackImplemented: 'Yes',
    whatImproved: 'Clearer phrasing.',
    strictImprovements: 'Tighten transitions.',
    grammarFixes: [],
    vocabUpgrades: [],
    status: overrides.status ?? 'Completed',
    createdAt: overrides.createdAt ?? '2026-11-20T18:00:00.000Z',
  };
}

test('isConverseSession accurately separates Converse sessions from written sessions', () => {
  const converseById = makeSession({ id: 'CHAT_20261123_AB12' });
  const converseBySlot = makeSession({
    id: 'SESS_CUSTOM_1',
    daySlot: 'Live Chat · Morning Standup',
  });
  const converseByCategory = makeSession({
    id: 'SESS_CUSTOM_2',
    promptCategory: 'Live Conversation · Technical & Interview',
  });
  const written = makeSession({
    id: 'SESS_20261123_CD34',
    daySlot: 'Day 3 · Evening',
    promptCategory: 'Technical & Interview',
  });

  assert.equal(isConverseSession(converseById), true);
  assert.equal(isConverseSession(converseBySlot), true);
  assert.equal(isConverseSession(converseByCategory), true);
  assert.equal(isConverseSession(written), false);
});

test('buildConverseVsWrittenAnalytics computes timeline, averages, fluency gap, trend delta, and pillar deltas', () => {
  const sessions: WritingSession[] = [
    makeSession({
      id: 'SESS_W1',
      date: '2026-11-18',
      totalScore: 45,
      percentage: 75.0,
      cefrLevel: 'B2',
      scores: {
        naturalVoiceFlow: 7,
        claritySimplicity: 8,
        grammarMechanics: 8,
        toneEngagement: 7,
        sentenceVarietyCadence: 7,
        concisenessDirectness: 8,
      },
      createdAt: '2026-11-18T10:00:00.000Z',
    }),
    makeSession({
      id: 'CHAT_20261119_A1',
      date: '2026-11-19',
      daySlot: 'Live Chat · Coffee Catch-Up',
      promptCategory: 'Live Conversation · Friend Exchange',
      topicDescription: 'Live Conversation: Coffee Catch-Up',
      totalScore: 48,
      percentage: 80.0,
      cefrLevel: 'B2+',
      scores: {
        naturalVoiceFlow: 9,
        claritySimplicity: 8,
        grammarMechanics: 7,
        toneEngagement: 9,
        sentenceVarietyCadence: 7,
        concisenessDirectness: 8,
      },
      createdAt: '2026-11-19T14:00:00.000Z',
    }),
    makeSession({
      id: 'SESS_W2',
      date: '2026-11-20',
      totalScore: 48,
      percentage: 80.0,
      cefrLevel: 'B2+',
      scores: {
        naturalVoiceFlow: 8,
        claritySimplicity: 8,
        grammarMechanics: 8,
        toneEngagement: 8,
        sentenceVarietyCadence: 8,
        concisenessDirectness: 8,
      },
      createdAt: '2026-11-20T10:00:00.000Z',
    }),
    makeSession({
      id: 'CHAT_20261120_B2',
      date: '2026-11-20',
      daySlot: 'Live Chat · Tech Interview',
      promptCategory: 'Live Conversation · Technical & Interview',
      topicDescription: 'Live Conversation: Tech Interview',
      totalScore: 54,
      percentage: 90.0,
      cefrLevel: 'C1',
      scores: {
        naturalVoiceFlow: 9,
        claritySimplicity: 9,
        grammarMechanics: 9,
        toneEngagement: 9,
        sentenceVarietyCadence: 9,
        concisenessDirectness: 9,
      },
      createdAt: '2026-11-20T18:00:00.000Z',
    }),
    // Draft sessions must be excluded
    makeSession({
      id: 'CHAT_DRAFT',
      date: '2026-11-21',
      status: 'Draft',
      percentage: 20,
    }),
  ];

  const result = buildConverseVsWrittenAnalytics(sessions);

  assert.equal(result.timeline.length, 4);
  assert.equal(result.converseCount, 2);
  assert.equal(result.writtenCount, 2);
  assert.equal(result.converseAvgPct, 85.0);
  assert.equal(result.writtenAvgPct, 77.5);
  assert.equal(result.fluencyGapPct, 7.5);
  assert.equal(result.converseTrendDelta, 10.0);
  assert.equal(result.latestConverseCefr, 'C1');
  assert.equal(result.bestConverseSession?.id, 'CHAT_20261120_B2');

  // Same-day sessions receive sequential #1 / #2 axis suffixes
  assert.equal(result.timeline[2].axisLabel, 'Nov 20 #1');
  assert.equal(result.timeline[3].axisLabel, 'Nov 20 #2');

  // Series null separation for Recharts connectNulls
  assert.equal(result.timeline[0].writtenScore, 75.0);
  assert.equal(result.timeline[0].converseScore, null);
  assert.equal(result.timeline[1].converseScore, 80.0);
  assert.equal(result.timeline[1].writtenScore, null);

  // Pillar comparison: Natural Voice converse avg = 9.0, written avg = 7.5, delta = +1.5
  const voicePillar = result.pillars.find((p) => p.key === 'naturalVoiceFlow');
  assert.equal(voicePillar?.converseAvg, 9.0);
  assert.equal(voicePillar?.writtenAvg, 7.5);
  assert.equal(voicePillar?.delta, 1.5);
});

test('buildConverseVsWrittenAnalytics handles written-only and empty session arrays cleanly', () => {
  const empty = buildConverseVsWrittenAnalytics([]);
  assert.equal(empty.timeline.length, 0);
  assert.equal(empty.converseAvgPct, null);
  assert.equal(empty.writtenAvgPct, null);
  assert.equal(empty.fluencyGapPct, null);

  const writtenOnly = buildConverseVsWrittenAnalytics([
    makeSession({ id: 'SESS_1', percentage: 82 }),
  ]);
  assert.equal(writtenOnly.writtenCount, 1);
  assert.equal(writtenOnly.converseCount, 0);
  assert.equal(writtenOnly.writtenAvgPct, 82);
  assert.equal(writtenOnly.converseAvgPct, null);
  assert.equal(writtenOnly.fluencyGapPct, null);
});
