import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDraftIntegrity,
  calibrateEvaluationScores,
  filterGroundedGrammarFixes,
  filterGroundedPinpointedRewrites,
  filterGroundedVocabUpgrades,
  formatDetailedCoachMarkdown,
  sanitizeFeedbackCheck,
  sanitizeMetricNotes,
  sanitizeRewrittenSample,
  sanitizeWhatImprovedPoints,
} from './evaluationCalibration';

test('assessDraftIntegrity detects gibberish and keyboard mash reliably', () => {
  const mash = assessDraftIntegrity(
    'asdfghjkl qwertzuiop zxcvbnm lkjh fghjkl qwrtyp bcdfrt'
  );
  assert.equal(mash.isGibberishOrLowEffort, true);
  assert.ok(mash.realWordRatio < 0.5);

  const spam = assessDraftIntegrity(
    'test test test test test test test test test test'
  );
  assert.equal(spam.isGibberishOrLowEffort, true);

  const realProse = assessDraftIntegrity(
    'When we wired the thermocouple directly into the microcontroller ADC, 50 Hz hum buried the millivolt signal. Adding an instrumentation amplifier with a low-pass filter immediately stabilized our readings on the oscilloscope.'
  );
  assert.equal(realProse.isGibberishOrLowEffort, false);
  assert.equal(realProse.isUltraShort, false);
  assert.ok(realProse.realWordRatio > 0.9);
});

test('calibrateEvaluationScores prevents score inflation on gibberish and ultra-short drafts', () => {
  const gibberishCal = calibrateEvaluationScores({
    content: 'asdfghjkl qweruiop zxcvbnm fghjkl mnbvcx',
    scores: {
      naturalVoiceFlow: 8,
      claritySimplicity: 8,
      grammarMechanics: 8,
      toneEngagement: 8,
      sentenceVarietyCadence: 8,
      concisenessDirectness: 8,
    },
    grammarFixesCount: 0,
    rawIeltsBand: 8.0,
    rawToefl: 28,
  });

  const totalGibberish = Object.values(gibberishCal.scores).reduce((a, b) => a + b, 0);
  assert.ok(totalGibberish <= 12, `Gibberish scored too high: ${totalGibberish}/60`);
  assert.equal(gibberishCal.cefrLevel, 'A1');
  assert.equal(gibberishCal.ieltsBand, 4.0);

  const shortCal = calibrateEvaluationScores({
    content: 'Sensors need conditioning before the ADC reads them.',
    scores: {
      naturalVoiceFlow: 9,
      claritySimplicity: 9,
      grammarMechanics: 9,
      toneEngagement: 9,
      sentenceVarietyCadence: 9,
      concisenessDirectness: 9,
    },
    grammarFixesCount: 0,
  });
  assert.ok(shortCal.scores.sentenceVarietyCadence <= 5);
  assert.ok(shortCal.scores.naturalVoiceFlow <= 6);
});

test('filterGroundedGrammarFixes drops hallucinated or no-op fixes so Apply Fix always works', () => {
  const draft = 'He go to the lab and test the sensor every morning.';
  const filtered = filterGroundedGrammarFixes(draft, [
    {
      original: 'He go',
      corrected: 'He goes',
      rule: 'Subject-verb agreement with third-person singular.',
      category: 'Grammar',
    },
    {
      original: 'She went to the library',
      corrected: 'She walks to the library',
      rule: 'Hallucinated phrase not in draft.',
      category: 'Grammar',
    },
    {
      original: 'the lab',
      corrected: 'the lab',
      rule: 'No-op fix.',
      category: 'Grammar',
    },
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].original, 'He go');
  assert.equal(filtered[0].corrected, 'He goes');
});

test('filterGroundedVocabUpgrades rejects thesaurus-slop buzzwords and ungrounded phrases', () => {
  const draft = 'We used a very good filter to look closely at the noisy signal.';
  const filtered = filterGroundedVocabUpgrades(draft, [
    {
      used: 'used',
      betterAlternative: 'utilized',
      explanation: 'Sounds more formal.',
    },
    {
      used: 'look closely',
      betterAlternative: 'delve into',
      explanation: 'Fancy word.',
    },
    {
      used: 'very good',
      betterAlternative: 'sharp',
      explanation: 'Replaces flat intensifier with a concrete adjective.',
    },
    {
      used: 'not present in text',
      betterAlternative: 'precise',
      explanation: 'Ungrounded.',
    },
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].used, 'very good');
  assert.equal(filtered[0].betterAlternative, 'sharp');
});

test('sanitizeRewrittenSample keeps only draft-grounded rewrites', () => {
  const draft =
    'Basically, I really think the sensor signal was very noisy so we just added a filter.';
  const valid = sanitizeRewrittenSample(draft, {
    original:
      'Basically, I really think the sensor signal was very noisy so we just added a filter.',
    improved: 'The raw sensor signal was noisy, so we added a low-pass filter.',
    why: 'Cuts four filler words so the technical cause and fix land cleanly.',
  });
  assert.ok(valid);
  assert.match(valid!.improved, /low-pass filter/);

  const hallucinated = sanitizeRewrittenSample(draft, {
    original: 'The medieval castle stood silently above the valley.',
    improved: 'Above the valley, the castle stood silent.',
    why: 'Unrelated text.',
  });
  assert.equal(hallucinated, undefined);
});

test('filterGroundedPinpointedRewrites keeps verbatim draft sentences and drops invented ones', () => {
  const draft =
    'The feedback control is one of the most important part of a system that is constantly experiences disturbances. Mean while in the closed loop system the output is measured.';
  const out = filterGroundedPinpointedRewrites(draft, [
    {
      original:
        'The feedback control is one of the most important part of a system that is constantly experiences disturbances.',
      rewrite:
        'Feedback control is essential for any system facing constant external disturbances.',
      rule: 'Use plural noun after "one of the" and drop "is" before "constantly experiences".',
      category: 'Agreement & Verb Tense',
    },
    {
      original: 'This sentence does not appear anywhere in the draft.',
      rewrite: 'Fabricated rewrite.',
      rule: 'Hallucinated.',
    },
  ]);

  assert.equal(out.length, 1);
  assert.match(out[0].rewrite, /constant external disturbances/);
  assert.equal(out[0].category, 'Agreement & Verb Tense');
});

test('detailed report sanitizers and markdown formatter match the structured coach scorecard layout', () => {
  const notes = sanitizeMetricNotes({
    naturalVoiceFlow: 'Clear logic — great imagery.',
    claritySimplicity: 'Accurate open-loop vs closed-loop contrast.',
  });
  assert.equal(notes.naturalVoiceFlow, 'Clear logic, great imagery.');

  const points = sanitizeWhatImprovedPoints([
    { title: 'Interview Structure', detail: 'Strong open-loop vs closed-loop framing.' },
    { title: '', detail: 'Ignored empty title' },
  ]);
  assert.equal(points.length, 1);

  const check = sanitizeFeedbackCheck({
    status: 'Partial',
    raw: {
      implemented: 'Clean apostrophes and zero typos.',
      missed: 'Still had subject-verb agreement slips.',
    },
  });
  assert.equal(check.status, 'Partial');

  const md = formatDetailedCoachMarkdown({
    topic: 'Closed-Loop Feedback Control',
    modeLabel: 'Technical & Interview',
    scores: {
      naturalVoiceFlow: 6,
      claritySimplicity: 8,
      grammarMechanics: 6,
      toneEngagement: 7,
      sentenceVarietyCadence: 6,
      concisenessDirectness: 6,
    },
    metricNotes: notes,
    totalScore: 39,
    percentage: 65,
    cefrLevel: 'B2',
    ieltsBand: 6.5,
    toeflEquivalent: 20,
    feedbackImplemented: 'Partial',
    feedbackCheck: check,
    whatImproved: 'Strong contrast.',
    whatImprovedPoints: points,
    pinpointedRewrites: [
      {
        original: 'one of the most important part',
        rewrite: 'one of the most important parts',
        rule: 'Always use a plural noun after "one of the".',
      },
    ],
    grammarFixes: [],
    vocabUpgrades: [
      {
        used: "doesn't have a sense of",
        betterAlternative: 'operates blind to',
        explanation: 'Tighter interview phrasing.',
        contextTag: 'Interview / Technical',
      },
    ],
  });

  assert.match(md, /Scorecard: 39 \/ 60 \(65\.0%\)/);
  assert.match(md, /1\. Feedback Implementation Check: Partial/);
  assert.match(md, /2\. What Changed for the Better/);
  assert.match(md, /3\. Strict Improvements & Pinpointed Fixes/);
  assert.match(md, /4\. Vocabulary & Phrasing Upgrades/);
  assert.match(md, /\(Interview \/ Technical\)/);
});

