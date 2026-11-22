import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDraftIntegrity,
  calibrateEvaluationScores,
  filterGroundedGrammarFixes,
  filterGroundedVocabUpgrades,
  sanitizeRewrittenSample,
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
