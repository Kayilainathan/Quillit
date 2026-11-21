import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyInkProgress, getInkWellCaption } from './inkGoal';
import type { WritingSession } from '../types';

function makeSession(
  id: string,
  date: string,
  wordCount: number,
  isDraft = false
): WritingSession {
  return {
    id,
    date,
    daySlot: 'Free Write',
    mode: 'journal',
    promptCategory: 'General',
    tone: 'conversational',
    topicDescription: 'Sample',
    content: 'word '.repeat(wordCount).trim(),
    wordCount,
    scores: {
      naturalVoiceFlow: 0,
      claritySimplicity: 0,
      grammarMechanics: 0,
      toneEngagement: 0,
      sentenceVarietyCadence: 0,
      concisenessDirectness: 0,
    },
    totalScore: 0,
    percentage: 0,
    cefrLevel: 'B2',
    toneVerdict: '',
    flowVerdict: '',
    feedbackImplemented: 'Baseline',
    whatImproved: '',
    strictImprovements: '',
    grammarFixes: [],
    vocabUpgrades: [],
    status: isDraft ? 'Draft' : 'Completed',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

test('returns empty stage when no words have been written today', () => {
  const result = computeDailyInkProgress({
    todayISO: '2026-11-21',
    sessions: [makeSession('yesterday-1', '2026-11-20', 300)],
    currentWordCount: 0,
    dailyWordGoal: 250,
  });

  assert.equal(result.totalWordsToday, 0);
  assert.equal(result.ratio, 0);
  assert.equal(result.percentage, 0);
  assert.equal(result.remainingWords, 250);
  assert.equal(result.reached, false);
  assert.equal(result.stage, 'empty');
});

test('combines today saved sessions and live draft words without double-counting active draft', () => {
  const sessions = [
    makeSession('completed-today', '2026-11-21', 100, false),
    makeSession('draft-active', '2026-11-21', 45, true),
    makeSession('older-session', '2026-11-19', 400, false),
  ];

  const result = computeDailyInkProgress({
    todayISO: '2026-11-21',
    sessions,
    currentWordCount: 90,
    activeDraftId: 'draft-active',
    dailyWordGoal: 250,
  });

  assert.equal(result.savedWordsToday, 100);
  assert.equal(result.activeDraftWords, 90);
  assert.equal(result.totalWordsToday, 190);
  assert.equal(result.remainingWords, 60);
  assert.equal(result.percentage, 76);
  assert.equal(result.stage, 'nearing');
  assert.equal(result.reached, false);
});

test('clamps ratio and percentage at 100% when exceeding daily goal', () => {
  const result = computeDailyInkProgress({
    todayISO: '2026-11-21',
    sessions: [makeSession('today-1', '2026-11-21', 210)],
    currentWordCount: 120,
    dailyWordGoal: 250,
  });

  assert.equal(result.totalWordsToday, 330);
  assert.equal(result.ratio, 1);
  assert.equal(result.percentage, 100);
  assert.equal(result.remainingWords, 0);
  assert.equal(result.reached, true);
  assert.equal(result.stage, 'full');
  assert.equal(getInkWellCaption(result), 'Daily ink goal reached');
});

test('handles invalid or missing dailyWordGoal safely', () => {
  const result = computeDailyInkProgress({
    todayISO: '2026-11-21',
    sessions: [],
    currentWordCount: 25,
    dailyWordGoal: 0,
  });

  assert.equal(result.goalWords, 250);
  assert.equal(result.percentage, 10);
  assert.equal(result.stage, 'starting');
});
