import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudentProfile, VocabEntry, WritingSession } from '../types';
import {
  buildAdaptivePromptContext,
  getMonthPreferredDaySpecs,
  getNextPreferredCycleSpecs,
} from './adaptivePromptProfile';

const mockVocab: VocabEntry[] = [
  {
    id: 'v1',
    used: 'very clear',
    betterAlternative: 'lucid',
    explanation: 'Clear and easy to understand.',
    contextSnippet: 'A lucid explanation.',
    mode: 'technical',
    dateAdded: '2026-11-20',
    mastered: false,
  },
  {
    id: 'v2',
    used: 'fix fast',
    betterAlternative: 'stabilize',
    explanation: 'Make steady quickly.',
    contextSnippet: 'Stabilize the loop.',
    mode: 'technical',
    dateAdded: '2026-11-20',
    mastered: false,
  },
];

const mockSession: WritingSession = {
  id: 's1',
  date: '2026-11-20',
  daySlot: 'Studio',
  mode: 'technical',
  promptCategory: 'Technical & Interview',
  tone: 'academic-technical',
  topicDescription: 'Explaining Wheatstone bridge thermal drift',
  content: 'A Wheatstone bridge measures small resistance changes accurately.',
  wordCount: 95,
  scores: {
    naturalVoiceFlow: 8,
    claritySimplicity: 8,
    grammarMechanics: 7,
    toneEngagement: 8,
    sentenceVarietyCadence: 7,
    concisenessDirectness: 8,
  },
  totalScore: 46,
  percentage: 76.7,
  cefrLevel: 'B2',
  toneVerdict: 'Clear',
  flowVerdict: 'Smooth',
  feedbackImplemented: 'Baseline',
  whatImproved: 'Good structure',
  strictImprovements: 'Vary sentence openings',
  grammarFixes: [
    {
      original: 'a apple',
      corrected: 'an apple',
      rule: 'Use "an" before vowel sounds',
      category: 'grammar',
    },
  ],
  vocabUpgrades: [],
  status: 'Completed',
  createdAt: '2026-11-20T10:00:00Z',
};

test('buildAdaptivePromptContext recognizes EIE 5th sem transitioning to 6th sem in Nov/Dec', () => {
  const eieProfile: StudentProfile = {
    displayName: 'Karthik',
    age: 20,
    collegeDegree: 'B.E. Electronics and Instrumentation Engineering (EIE)',
    collegeName: 'Engineering College',
    semester: '5th Semester',
    preferredDays: [3, 5, 0],
    targetWordGoal: 250,
    onboardingCompleted: true,
  };

  const ctx = buildAdaptivePromptContext(
    eieProfile,
    [mockSession],
    mockVocab,
    '2026-11-21'
  );

  assert.equal(ctx.domainTrack, 'eie-engineering');
  assert.match(ctx.academicStage, /5th Semester.*6th Semester/i);
  assert.deepEqual(ctx.practicingVocab, ['lucid', 'stabilize']);
  assert.deepEqual(ctx.recurringGrammarRules, ['Use "an" before vowel sounds']);
  assert.ok(ctx.recentTopics.includes('Explaining Wheatstone bridge thermal drift'));
});

test('buildAdaptivePromptContext adapts cleanly for generic non-EIE users by age and writing history', () => {
  const genericProfile: StudentProfile = {
    displayName: 'Ananya',
    age: 27,
    collegeDegree: 'Product Design',
    collegeName: 'Design Studio',
    semester: '',
    preferredDays: [1, 2, 4, 6],
    targetWordGoal: 300,
    onboardingCompleted: true,
  };

  const ctx = buildAdaptivePromptContext(
    genericProfile,
    [],
    [],
    '2026-11-21'
  );

  assert.equal(ctx.domainTrack, 'general-writer');
  assert.equal(ctx.ageBand, 'early-career');
  assert.match(ctx.personaSummary, /Product Design/);
  assert.ok(!ctx.personaSummary.includes('EIE'));
});

test('getMonthPreferredDaySpecs and getNextPreferredCycleSpecs respect arbitrary chosen weekdays', () => {
  // User picks 5 weekdays (Mon-Fri)
  const monthSpecs = getMonthPreferredDaySpecs(2026, 10, [1, 2, 3, 4, 5]);
  assert.ok(monthSpecs.length >= 20 && monthSpecs.length <= 23);
  const uniquePillars = new Set(monthSpecs.map((s) => s.pillar));
  assert.equal(uniquePillars.size, 3);

  const nextThree = getNextPreferredCycleSpecs('2026-11-21', [1, 3, 5, 6], 3);
  assert.equal(nextThree.length, 3);
  // 2026-11-21 is Saturday (6), next are Mon (2026-11-23), Wed (2026-11-25)
  assert.equal(nextThree[0].scheduledDate, '2026-11-21');
  assert.equal(nextThree[1].scheduledDate, '2026-11-23');
  assert.equal(nextThree[2].scheduledDate, '2026-11-25');
});
