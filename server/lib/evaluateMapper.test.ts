import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSlimEvaluateSchema,
  buildSlimEvaluateSystemInstruction,
  mapSlimEvaluateResponse,
} from './evaluateMapper';
import { computeProseDiagnostics } from '../../src/utils/proseDiagnostics';
import { buildInstantLocalEvaluation } from '../../src/utils/fastEvaluate';
import { VALID_ERROR_TAGS } from '../../src/utils/evaluationCalibration';

test('buildSlimEvaluateSchema emits 9-10 high-signal core fields and adds conditional fields only when requested', () => {
  const base = buildSlimEvaluateSchema({
    includeSuggestedTitle: false,
    includeDrillVerdict: false,
    includeFeedbackNote: false,
  }) as { required: string[]; properties: Record<string, unknown> };

  assert.equal(base.required.length, 9);
  assert.ok(!base.required.includes('suggestedTitle'));
  assert.ok(!base.required.includes('drillVerdict'));
  assert.ok(!base.required.includes('feedbackNote'));
  assert.ok(!('cefrLevel' in base.properties));
  assert.ok(!('ieltsBand' in base.properties));
  assert.ok(!('toeflEquivalent' in base.properties));

  const conditional = buildSlimEvaluateSchema({
    includeSuggestedTitle: true,
    includeDrillVerdict: true,
    includeFeedbackNote: true,
  }) as { required: string[]; properties: Record<string, unknown> };

  assert.ok(conditional.required.includes('suggestedTitle'));
  assert.ok(conditional.required.includes('drillVerdict'));
  assert.ok(conditional.required.includes('feedbackNote'));
});

test('mapSlimEvaluateResponse deterministically derives CEFR/IELTS/TOEFL, filters ungrounded edits & thesaurus-slop, and preserves backwards compatibility', () => {
  const draft =
    'In our 6th semester process control lab, the sensor signals was drifting when we discussed about the thermal loop. Basically, we calibrate the Wheatstone bridge so the ADC reading stay steady.';
  const localDiag = computeProseDiagnostics(draft);

  const mapped = mapSlimEvaluateResponse({
    parsed: {
      scores: {
        naturalVoiceFlow: 7,
        claritySimplicity: 7,
        grammarMechanics: 6,
        toneEngagement: 8,
        sentenceVarietyCadence: 7,
        concisenessDirectness: 7,
      },
      metricNotes: {
        naturalVoiceFlow: 'Clear spoken lab narrative, slightly slowed by filler.',
        claritySimplicity: 'Bridge-to-ADC flow is easy to follow.',
        grammarMechanics: 'Two subject-verb agreement slips need tightening.',
        toneEngagement: 'Confident, interview-ready engineering tone.',
        sentenceVarietyCadence: 'Good rhythm across two distinct sentences.',
        concisenessDirectness: 'Trim "Basically" for sharper authority.',
      },
      spokenReadinessScore: 76,
      toneCheck: {
        match: 'On Target',
        audienceReaction: 'An interviewer hears genuine bench ownership right away.',
        toneFix: 'Drop "Basically" so the calibration step sounds decisive.',
      },
      edits: [
        {
          original: 'the sensor signals was drifting',
          improved: 'the sensor signals were drifting',
          dimension: 'grammar',
          errorTag: 'subject-verb',
          rule: 'Match plural subjects ("signals") with plural verbs ("were").',
        },
        {
          original: 'discussed about the thermal loop',
          improved: 'discussed the thermal loop',
          dimension: 'calque',
          errorTag: 'regional-calque',
          rule: 'Use "discuss" directly without the preposition "about".',
        },
        {
          original: 'hallucinated phrase not in draft at all',
          improved: 'should be filtered out',
          dimension: 'grammar',
          errorTag: 'word-choice',
          rule: 'Should never appear.',
        },
      ],
      vocabUpgrades: [
        {
          used: 'stay steady',
          betterAlternative: 'remain stable',
          explanation: 'Standard engineering phrasing for sensor outputs.',
          contextTag: 'Technical',
        },
        {
          used: 'drifting',
          betterAlternative: 'utilize synergy',
          explanation: 'Banned thesaurus slop should be rejected.',
          contextTag: 'Technical',
        },
      ],
      strengths: [
        { title: 'Concrete Lab Anchor', detail: 'Naming the Wheatstone bridge and ADC grounds the story immediately.' },
        { title: 'Clear Causal Link', detail: 'You connect calibration directly to steady readings.' },
      ],
      nextDraftPriority: 'Audit plural subjects against their verbs before submitting.',
      feedbackStatus: 'Yes',
      feedbackNote: 'Kept sentences well under 30 words as requested.',
      suggestedTitle: 'Stabilizing Drifting Bridge Signals in Lab',
    },
    trimmedContent: draft,
    trimmedTopic: '',
    targetAudience: 'Interviewer',
    previousSessionSummary: 'Previous priority: split long sentences.',
    localDiagnostics: localDiag,
  });

  // Deterministic benchmarks derived without LLM tokens
  assert.equal(mapped.cefrLevel, 'B2');
  assert.ok(mapped.internationalMetrics.ieltsBand >= 4 && mapped.internationalMetrics.ieltsBand <= 9);
  assert.ok(mapped.internationalMetrics.toeflEquivalent >= 8 && mapped.internationalMetrics.toeflEquivalent <= 30);
  assert.ok(mapped.internationalMetrics.lexicalResource >= 1);
  assert.ok(mapped.internationalMetrics.coherenceCohesion >= 1);

  // Grounding & thesaurus slop filter
  assert.equal(mapped.edits.length, 2);
  assert.equal(mapped.edits[0].errorTag, 'subject-verb');
  assert.equal(mapped.edits[1].errorTag, 'regional-calque');
  assert.equal(mapped.vocabUpgrades.length, 1);
  assert.equal(mapped.vocabUpgrades[0].betterAlternative, 'remain stable');

  // Backwards-compatible fields derived cleanly
  assert.equal(mapped.pinpointedRewrites.length, 2);
  assert.equal(mapped.grammarFixes.length, 2);
  assert.equal(mapped.grammarFixes[0].errorTag, 'subject-verb');
  assert.ok(mapped.calqueFixes.some((c) => c.phrase.toLowerCase().includes('discussed about')));
  assert.equal(mapped.rewrittenSample?.original, 'the sensor signals was drifting');
  assert.equal(mapped.nextDraftPriority, 'Audit plural subjects against their verbs before submitting.');
  assert.equal(mapped.strictImprovements, mapped.nextDraftPriority);
  assert.ok(mapped.whatImproved.includes('Concrete Lab Anchor'));
});

test('buildSlimEvaluateSystemInstruction stays compact and enforces zero-slop contract', () => {
  const instr = buildSlimEvaluateSystemInstruction({
    studentDescriptor: '6th sem EIE student',
    mode: 'technical',
    tone: 'academic-technical',
    targetAudience: 'Interviewer',
    shouldInferTitle: true,
    hasPreviousSummary: true,
    drillInstructionBlock: '',
    fencedPreferences: '',
  });
  assert.ok(instr.length < 2200, `Expected compressed prompt < 2200 chars, got ${instr.length}`);
  assert.ok(instr.includes('utilize'));
  assert.ok(instr.includes('errorTag'));
});

test('fastEvaluate offline output emits standardized errorTag values and unified edits', () => {
  const draft =
    'Basically we tested a PID loop and we will revert back with the result. Basically the sensor reading was very good and we make sure the output is clean.';
  const res = buildInstantLocalEvaluation(
    draft,
    'technical',
    'academic-technical',
    [
      {
        id: 'off-1',
        original: 'was very good',
        replacement: 'was stable',
        rule: 'Replace weak vague phrasing.',
        category: 'grammar',
        start: draft.indexOf('was very good'),
        end: draft.indexOf('was very good') + 13,
      },
    ],
    'PID Loop Calibration'
  );
  assert.ok(Array.isArray(res.edits) && res.edits.length >= 1);
  for (const edit of res.edits ?? []) {
    assert.ok(VALID_ERROR_TAGS.includes(edit.errorTag), `Invalid errorTag: ${edit.errorTag}`);
  }
  assert.ok(res.nextDraftPriority && res.nextDraftPriority.length > 5);
  assert.ok(res.toneCheck?.audienceReaction);
});
