import test from 'node:test';
import assert from 'node:assert/strict';
import type { WritingSession } from '../types';
import {
  computeErrorPatternAnalytics,
  computeFeedbackAppliedRate,
  computeHeroFluencyPulse,
  computeSkillPillarPlaybooks,
  getSessionTopIssueTag,
} from './errorPatternAnalytics';

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  const id = overrides.id || 'SESSION_TEST_1';
  return {
    id,
    date: overrides.date || '2026-04-10',
    daySlot: 'Studio Session',
    mode: overrides.mode || 'technical',
    promptCategory: 'Technical & Interview',
    tone: overrides.tone || 'academic-technical',
    topicDescription: overrides.topicDescription || 'PID Loop Calibration',
    content:
      overrides.content ||
      'We calibrated the sensor loop and measured stable voltage across the bridge.',
    wordCount: overrides.wordCount || 85,
    scores: overrides.scores || {
      naturalVoiceFlow: 7.5,
      claritySimplicity: 7.5,
      grammarMechanics: 7.0,
      toneEngagement: 8.0,
      sentenceVarietyCadence: 7.2,
      concisenessDirectness: 7.4,
    },
    totalScore: overrides.totalScore ?? 44.6,
    percentage: overrides.percentage ?? 74.3,
    cefrLevel: overrides.cefrLevel || 'B2',
    toneVerdict: 'Clear professional register.',
    flowVerdict: 'Steady rhythm.',
    feedbackImplemented: overrides.feedbackImplemented || 'Yes',
    whatImproved: 'Clearer opening.',
    strictImprovements: 'Watch articles and tense shifts.',
    grammarFixes: overrides.grammarFixes || [],
    vocabUpgrades: overrides.vocabUpgrades || [],
    edits: overrides.edits,
    calqueFixes: overrides.calqueFixes,
    spokenReadinessScore: overrides.spokenReadinessScore ?? 78,
    status: overrides.status || 'Completed',
    createdAt: overrides.createdAt || '2026-04-10T10:00:00.000Z',
  };
}

test('computeErrorPatternAnalytics ranks top bottlenecks across windows and computes trends', () => {
  const sessions: WritingSession[] = [
    makeSession({
      id: 'S1',
      date: '2026-03-22',
      edits: [
        {
          dimension: 'flow',
          errorTag: 'repetition-filler',
          original: 'basically we tested',
          improved: 'we tested',
          rule: 'Cut filler word.',
        },
        {
          dimension: 'flow',
          errorTag: 'repetition-filler',
          original: 'in order to verify',
          improved: 'to verify',
          rule: 'Trim padding.',
        },
      ],
    }),
    makeSession({
      id: 'S2',
      date: '2026-03-26',
      edits: [
        {
          dimension: 'flow',
          errorTag: 'repetition-filler',
          original: 'actually the output',
          improved: 'the output',
          rule: 'Drop hedge.',
        },
        {
          dimension: 'grammar',
          errorTag: 'article-preposition',
          original: 'calibrated sensor',
          improved: 'calibrated the sensor',
          rule: 'Add missing article.',
        },
      ],
    }),
    makeSession({
      id: 'S3',
      date: '2026-04-06',
      edits: [
        {
          dimension: 'grammar',
          errorTag: 'article-preposition',
          original: 'tested amplifier',
          improved: 'tested the amplifier',
          rule: 'Add definite article.',
        },
        {
          dimension: 'calque',
          errorTag: 'regional-calque',
          original: 'revert back with logs',
          improved: 'reply with logs',
          rule: 'Avoid redundant revert back.',
        },
      ],
    }),
    makeSession({
      id: 'S4',
      date: '2026-04-09',
      edits: [
        {
          dimension: 'grammar',
          errorTag: 'article-preposition',
          original: 'connected oscilloscope',
          improved: 'connected an oscilloscope',
          rule: 'Add indefinite article.',
        },
      ],
    }),
  ];

  const report30d = computeErrorPatternAnalytics(sessions, {
    window: '30d',
    referenceDateISO: '2026-04-10',
  });
  assert.equal(report30d.sessionsAnalyzed, 4);
  assert.equal(report30d.totalIssuesTracked, 7);
  assert.equal(report30d.topPatterns.length, 3);

  const filler = report30d.topPatterns.find(
    (p) => p.errorTag === 'repetition-filler'
  );
  const article = report30d.topPatterns.find(
    (p) => p.errorTag === 'article-preposition'
  );
  const calque = report30d.topPatterns.find(
    (p) => p.errorTag === 'regional-calque'
  );
  assert.equal(filler?.trend, 'Improving');
  assert.equal(article?.trend, 'Recurring');
  assert.equal(calque?.trend, 'New');
  assert.equal(article?.examples.length, 3);

  const report7d = computeErrorPatternAnalytics(sessions, {
    window: '7d',
    referenceDateISO: '2026-04-10',
  });
  assert.equal(report7d.sessionsAnalyzed, 2);
  assert.equal(report7d.topPatterns[0].errorTag, 'article-preposition');
  assert.equal(report7d.topPatterns[0].count, 2);
});

test('computeErrorPatternAnalytics supports legacy sessions without unified edits', () => {
  const legacy = makeSession({
    id: 'LEGACY_1',
    date: '2026-04-08',
    edits: undefined,
    grammarFixes: [
      {
        original: 'the sensors reads',
        corrected: 'the sensors read',
        rule: 'Subject-verb agreement with plural noun.',
        category: 'Agreement',
      },
    ],
    calqueFixes: [
      {
        phrase: 'do the needful',
        naturalAlternative: 'handle the next steps',
        reason: 'Use direct natural English.',
      },
    ],
  });

  const result = computeErrorPatternAnalytics([legacy], {
    window: 'all',
    referenceDateISO: '2026-04-10',
  });
  assert.equal(result.totalIssuesTracked, 2);
  const tags = result.topPatterns.map((p) => p.errorTag);
  assert.ok(tags.includes('subject-verb'));
  assert.ok(tags.includes('regional-calque'));
  assert.ok(getSessionTopIssueTag(legacy) !== null);
});

test('computeSkillPillarPlaybooks returns 6 pillars with deltas and practice payloads', () => {
  const sessions: WritingSession[] = [
    makeSession({
      id: 'P1',
      date: '2026-03-01',
      scores: {
        naturalVoiceFlow: 6.5,
        claritySimplicity: 6.5,
        grammarMechanics: 6.0,
        toneEngagement: 7.0,
        sentenceVarietyCadence: 6.5,
        concisenessDirectness: 6.5,
      },
    }),
    makeSession({
      id: 'P2',
      date: '2026-03-05',
      scores: {
        naturalVoiceFlow: 6.8,
        claritySimplicity: 6.7,
        grammarMechanics: 6.2,
        toneEngagement: 7.2,
        sentenceVarietyCadence: 6.8,
        concisenessDirectness: 6.7,
      },
    }),
    makeSession({
      id: 'P3',
      date: '2026-04-04',
      scores: {
        naturalVoiceFlow: 8.0,
        claritySimplicity: 8.2,
        grammarMechanics: 7.8,
        toneEngagement: 8.3,
        sentenceVarietyCadence: 7.9,
        concisenessDirectness: 8.1,
      },
    }),
    makeSession({
      id: 'P4',
      date: '2026-04-09',
      scores: {
        naturalVoiceFlow: 8.2,
        claritySimplicity: 8.4,
        grammarMechanics: 8.0,
        toneEngagement: 8.5,
        sentenceVarietyCadence: 8.1,
        concisenessDirectness: 8.3,
      },
    }),
  ];

  const pillars = computeSkillPillarPlaybooks(sessions, '2026-04-10');
  assert.equal(pillars.length, 6);
  const grammar = pillars.find((p) => p.key === 'grammar');
  assert.ok(grammar);
  assert.ok((grammar.delta30d ?? 0) > 1.0);
  assert.equal(grammar.sparkline.length, 4);
  assert.ok(grammar.practicePayload.topic.length > 10);
  assert.ok(grammar.practicePayload.feedbackReminder.includes('Grammar'));
});

test('computeFeedbackAppliedRate and computeHeroFluencyPulse aggregate closed-loop progress cleanly', () => {
  const sessions: WritingSession[] = [
    makeSession({
      id: 'F1',
      date: '2026-04-09',
      totalScore: 50,
      spokenReadinessScore: 86,
      feedbackImplemented: 'Yes',
    }),
    makeSession({
      id: 'F2',
      date: '2026-04-08',
      totalScore: 48,
      spokenReadinessScore: 82,
      feedbackImplemented: 'Partial',
    }),
    makeSession({
      id: 'F3',
      date: '2026-04-07',
      totalScore: 46,
      spokenReadinessScore: 78,
      feedbackImplemented: 'Yes',
    }),
    makeSession({
      id: 'F4',
      date: '2026-04-06',
      totalScore: 44,
      spokenReadinessScore: 76,
      feedbackImplemented: 'Baseline',
    }),
  ];

  const fb = computeFeedbackAppliedRate(sessions);
  assert.equal(fb.yesCount, 2);
  assert.equal(fb.partialCount, 1);
  assert.equal(fb.baselineCount, 1);
  assert.equal(fb.appliedRatePct, 83);

  const pulse = computeHeroFluencyPulse(sessions, [], '2026-04-09');
  assert.equal(pulse.overallScore, 47);
  assert.equal(pulse.spokenReadiness, 81);
  assert.equal(pulse.weeklyCompleted, 4);
  assert.equal(pulse.weeklyRingPct, 100);
  assert.equal(pulse.latestCefr, 'B2');
  assert.equal(pulse.nextCefrTarget, 'C1');
});
