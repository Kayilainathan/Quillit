import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarSlot, VocabEntry, WritingSession } from '../types';
import {
  buildMechanicsCheck,
  buildSessionBrief,
  detectUsedTargetVocab,
  evaluateTargetCheckOffline,
  pickDefaultBriefSlot,
  selectTargetVocab,
} from './sessionBrief';
import { buildInstantLocalEvaluation } from './fastEvaluate';

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: 'SESSION-1',
    date: '2026-11-25',
    daySlot: 'Wednesday · Technical',
    mode: 'technical',
    promptCategory: 'Systems',
    tone: 'academic-technical',
    topicDescription: '4-20 mA Loop Diagnostics',
    content: 'A 4-20 mA transmitter separates live zero from an open circuit fault cleanly.',
    wordCount: 14,
    scores: {
      naturalVoiceFlow: 7,
      claritySimplicity: 7,
      grammarMechanics: 6,
      toneEngagement: 7,
      sentenceVarietyCadence: 7,
      concisenessDirectness: 7,
    },
    totalScore: 41,
    percentage: 68,
    cefrLevel: 'B2',
    toneVerdict: 'Clear',
    flowVerdict: 'Steady',
    feedbackImplemented: 'Baseline',
    whatImproved: 'Good logic',
    strictImprovements: 'Watch subject-verb agreement.',
    grammarFixes: [],
    vocabUpgrades: [],
    status: 'Completed',
    createdAt: '2026-11-25T10:00:00Z',
    ...overrides,
  };
}

function makeVocab(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: 'v-1',
    used: 'cannot see',
    betterAlternative: 'operates blind to',
    explanation: 'Sharpens an operational visibility gap in technical or email pitches.',
    contextSnippet: 'The current setup operates blind to drift.',
    mode: 'email',
    dateAdded: '2026-11-24',
    mastered: false,
    masteryStage: 'emerging',
    ...overrides,
  };
}

test('buildMechanicsCheck returns crisp starter checklist on cold start (0 sessions)', () => {
  const check = buildMechanicsCheck([]);
  assert.ok(check.includes('Capitalize `I`'));
  assert.ok(check.length > 30);
});

test('buildMechanicsCheck synthesizes concrete habits from recurring errorTags across recent sessions', () => {
  const sessions: WritingSession[] = [
    makeSession({
      id: 'S-2',
      date: '2026-11-26',
      edits: [
        {
          original: 'sensor are drifting',
          improved: 'sensor is drifting',
          dimension: 'grammar',
          errorTag: 'subject-verb',
          rule: 'Match singular subjects with singular verbs.',
        },
        {
          original: 'basically we tested it',
          improved: 'we tested it',
          dimension: 'clarity',
          errorTag: 'hedging-passive',
          rule: 'Cut conversational hedges.',
        },
      ],
    }),
    makeSession({
      id: 'S-1',
      date: '2026-11-24',
      grammarFixes: [
        {
          original: 'readings was unstable',
          corrected: 'readings were unstable',
          rule: 'Use plural verb were.',
          category: 'Grammar',
          errorTag: 'subject-verb',
        },
      ],
    }),
  ];

  const check = buildMechanicsCheck(sessions);
  assert.ok(check.toLowerCase().includes('singular/plural verbs'));
  assert.ok(check.toLowerCase().includes('hedges'));
});

test('selectTargetVocab prioritizes unmastered mode-matched entries without duplicates', () => {
  const bank: VocabEntry[] = [
    makeVocab({
      id: 'v-mastered',
      betterAlternative: 'calibrated',
      mode: 'email',
      mastered: true,
      masteryStage: 'mastered',
    }),
    makeVocab({
      id: 'v-email-1',
      betterAlternative: 'operates blind to',
      mode: 'email',
      masteryStage: 'building',
    }),
    makeVocab({
      id: 'v-email-2',
      betterAlternative: 'critical bottleneck',
      mode: 'email',
      masteryStage: 'emerging',
    }),
    makeVocab({
      id: 'v-tech-1',
      betterAlternative: 'pinpoint',
      mode: 'technical',
      masteryStage: 'new',
    }),
  ];

  const { targets, weaveCue } = selectTargetVocab(bank, 'email', 'Pitching Project Value', 3);
  assert.equal(targets.length, 3);
  assert.equal(targets[0].phrase, 'operates blind to');
  assert.equal(targets[1].phrase, 'critical bottleneck');
  assert.equal(targets[2].phrase, 'pinpoint');
  assert.ok(!targets.some((t) => t.phrase === 'calibrated'));
  assert.ok(weaveCue.includes('Pitching Project Value'));
});

test('detectUsedTargetVocab matches multi-word phrases and inflections accurately', () => {
  const draft =
    'Right now the warehouse team operates blind to thermal drift, and that manual check became a critical bottleneck while we pinpointed the faulty relay.';
  const used = detectUsedTargetVocab(draft, [
    'operates blind to',
    'critical bottleneck',
    'pinpoint',
    'unravel',
  ]);

  assert.deepEqual(used, ['operates blind to', 'critical bottleneck', 'pinpoint']);
});

test('pickDefaultBriefSlot prefers today pending slot, then nearest upcoming non-converse slot', () => {
  const slots: CalendarSlot[] = [
    {
      id: 'slot-converse',
      dayOfWeek: 'Friday',
      slotLabel: 'Converse',
      scheduledDate: '2026-11-27',
      mode: 'technical',
      tone: 'conversational',
      promptCategory: 'Converse',
      topic: 'Live chat',
      targetWords: 120,
      completed: false,
      isConverseSlot: true,
    },
    {
      id: 'slot-upcoming',
      dayOfWeek: 'Sunday',
      slotLabel: 'Slot 3: Creative',
      scheduledDate: '2026-11-29',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Story',
      topic: 'Late Night Lab Bench',
      targetWords: 180,
      completed: false,
    },
    {
      id: 'slot-today',
      dayOfWeek: 'Friday',
      slotLabel: 'Slot 2: LinkedIn, Email & Soft Skills',
      scheduledDate: '2026-11-27',
      mode: 'email',
      tone: 'professional-warm',
      promptCategory: 'Email',
      topic: 'Pitching Project Value',
      curriculumTopicId: 'S08',
      targetWords: 180,
      completed: false,
    },
  ];

  const picked = pickDefaultBriefSlot(slots, '2026-11-27');
  assert.equal(picked?.id, 'slot-today');

  const brief = buildSessionBrief({
    calendarSlots: slots,
    sessions: [],
    vocabulary: [makeVocab()],
    todayISO: '2026-11-27',
  });
  assert.equal(brief.promptCode, 'S08');
  assert.equal(brief.title, 'Pitching Project Value');
  assert.ok(brief.slotContext.includes('Friday'));
  assert.ok(brief.vocabTargets.some((v) => v.phrase === 'operates blind to'));
});

test('evaluateTargetCheckOffline and buildInstantLocalEvaluation verify targets accurately', () => {
  const draft =
    'Our current lab log operates blind to supply sag, creating a critical bottleneck during peak calibration runs. We built an automated alert to catch voltage drops early.';

  const check = evaluateTargetCheckOffline({
    content: draft,
    activeMechanicsCheck: 'Keep verb tenses consistent.',
    practicingVocab: ['operates blind to', 'critical bottleneck', 'walk you through'],
    grammarFixes: [],
    grammarScore: 8,
  });

  assert.equal(check.mechanicsStatus, 'Cleared');
  assert.deepEqual(check.vocabUsed, ['operates blind to', 'critical bottleneck']);
  assert.deepEqual(check.vocabMissed, ['walk you through']);

  const offlineEval = buildInstantLocalEvaluation(
    draft,
    'email',
    'professional-warm',
    [],
    'Pitching Project Value',
    [makeVocab()],
    {
      activeMechanicsCheck: 'Keep verb tenses consistent.',
      practicingVocab: ['operates blind to', 'critical bottleneck', 'walk you through'],
    }
  );
  assert.ok(offlineEval.targetCheck);
  assert.equal(offlineEval.targetCheck?.mechanicsStatus, 'Cleared');
  assert.deepEqual(offlineEval.targetCheck?.vocabUsed, [
    'operates blind to',
    'critical bottleneck',
  ]);
});
