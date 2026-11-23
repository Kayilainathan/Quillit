import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVocabMastery,
  computeVocabularyMasteryMap,
  extractVocabCandidates,
} from './vocabMastery';
import type { VocabEntry, WritingSession } from '../types';

function makeVocab(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: 'v-1',
    used: 'fix the output',
    betterAlternative: 'stabilize',
    explanation: 'More precise engineering verb.',
    contextSnippet: 'The loop stabilizes the output.',
    mode: 'technical',
    dateAdded: '2026-11-01',
    mastered: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: 's-1',
    date: '2026-11-15',
    daySlot: 'Mon',
    mode: 'technical',
    promptCategory: 'Systems',
    tone: 'academic-technical',
    topicDescription: 'Feedback Control',
    content: '',
    wordCount: 50,
    scores: {
      naturalVoiceFlow: 7,
      claritySimplicity: 8,
      grammarMechanics: 7,
      toneEngagement: 7,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 7,
    },
    totalScore: 43,
    percentage: 71.7,
    cefrLevel: 'B2+',
    toneVerdict: 'Clear',
    flowVerdict: 'Steady',
    feedbackImplemented: 'Baseline',
    whatImproved: 'Clarity',
    strictImprovements: 'None',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

test('extractVocabCandidates splits slash alternatives and trims punctuation', () => {
  const entry = makeVocab({
    betterAlternative: '"stabilize" / refine the output / a',
  });
  assert.deepEqual(extractVocabCandidates(entry), ['stabilize', 'refine the output']);
});

test('computeVocabMastery returns New (0/3) when unused or only present in Draft sessions', () => {
  const entry = makeVocab({ betterAlternative: 'stabilize', mastered: false });
  const sessions = [
    makeSession({
      id: 'draft-1',
      status: 'Draft',
      content: 'The controller stabilized the output quickly.',
    }),
    makeSession({
      id: 'done-1',
      status: 'Completed',
      content: 'The sensor measures the temperature every second.',
    }),
  ];

  const summary = computeVocabMastery(entry, sessions);
  assert.equal(summary.tier, 'new');
  assert.equal(summary.label, 'New');
  assert.equal(summary.correctUses, 0);
  assert.equal(summary.filledSegments, 0);
  assert.equal(summary.manualMastered, false);
});

test('computeVocabMastery counts inflections and multi-word expressions across completed sessions without substring false positives', () => {
  const entry = makeVocab({ betterAlternative: 'resolve / proportional correction' });
  const sessions = [
    makeSession({
      id: 's1',
      date: '2026-11-10',
      content: 'We resolved the sensor drift before running the trial.',
    }),
    makeSession({
      id: 's2',
      date: '2026-11-14',
      content: 'The controller applies a proportional correction automatically.',
    }),
    makeSession({
      id: 's3',
      date: '2026-11-18',
      // "unresolved" must NOT match "resolve"
      content: 'One unresolved question remained in the notes.',
    }),
  ];

  const summary = computeVocabMastery(entry, sessions);
  assert.equal(summary.tier, 'familiar');
  assert.equal(summary.label, 'Familiar');
  assert.equal(summary.correctUses, 2);
  assert.equal(summary.filledSegments, 2);
  assert.deepEqual(summary.matchedSessionDates, ['2026-11-14', '2026-11-10']);
});

test('computeVocabMastery excludes sessions where grammarFixes flagged the word as misused', () => {
  const entry = makeVocab({ betterAlternative: 'improvise' });
  const sessions = [
    makeSession({
      id: 's-misused',
      date: '2026-11-12',
      content: 'We get feedback to improvise the effective outcome.',
      grammarFixes: [
        {
          original: 'improvise the effective outcome',
          corrected: 'improve the effective outcome',
          rule: 'Do not confuse improvise with improve.',
          category: 'Word Choice',
        },
      ],
    }),
    makeSession({
      id: 's-correct',
      date: '2026-11-16',
      content: 'When the slides failed, I had to improvise my demo live.',
      grammarFixes: [
        {
          original: 'the slides failed',
          corrected: 'the slide deck failed',
          rule: 'Optional clarity tweak.',
          category: 'Clarity',
        },
      ],
    }),
  ];

  const summary = computeVocabMastery(entry, sessions);
  assert.equal(summary.tier, 'emerging');
  assert.equal(summary.label, 'Emerging');
  assert.equal(summary.correctUses, 1);
  assert.equal(summary.filledSegments, 1);
  assert.deepEqual(summary.matchedSessionDates, ['2026-11-16']);
});

test('computeVocabMastery reaches Mastered at 3+ correct sessions and preserves exact higher counts', () => {
  const entry = makeVocab({ betterAlternative: 'clarify' });
  const sessions = [
    makeSession({ id: 's1', date: '2026-11-01', content: 'Let me clarify the scope.' }),
    makeSession({ id: 's2', date: '2026-11-05', content: 'She clarified the timeline.' }),
    makeSession({ id: 's3', date: '2026-11-09', content: 'This clarifies our next step.' }),
    makeSession({ id: 's4', date: '2026-11-12', content: 'Clarifying assumptions saves time.' }),
  ];

  const summary = computeVocabMastery(entry, sessions);
  assert.equal(summary.tier, 'mastered');
  assert.equal(summary.label, 'Mastered');
  assert.equal(summary.correctUses, 4);
  assert.equal(summary.filledSegments, 3);
  assert.equal(summary.manualMastered, false);
});

test('computeVocabMastery respects manual mastered override when 0 sessions matched', () => {
  const entry = makeVocab({ betterAlternative: 'calibrate', mastered: true });
  const map = computeVocabularyMasteryMap([entry], []);
  const summary = map.get(entry.id);
  assert.ok(summary);
  assert.equal(summary.tier, 'mastered');
  assert.equal(summary.label, 'Mastered');
  assert.equal(summary.correctUses, 0);
  assert.equal(summary.filledSegments, 3);
  assert.equal(summary.manualMastered, true);
});
