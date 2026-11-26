import test from 'node:test';
import assert from 'node:assert/strict';
import type { VocabEntry } from '../types';
import {
  analyzeWritingSample,
  compareVocabularyWithLibrary,
} from './textAnalysis';

const SAMPLE_VOCAB_LIBRARY: VocabEntry[] = [
  {
    id: 'voc-1',
    used: 'keep stable',
    betterAlternative: 'stabilize',
    explanation: 'Crisp single verb for closed-loop damping.',
    contextSnippet: 'Derivative control helps stabilize the thermal loop.',
    dateAdded: '2026-11-20',
    mode: 'technical',
    mastered: false,
  },
  {
    id: 'voc-2',
    used: 'got worse',
    betterAlternative: 'degraded',
    explanation: 'Standard engineering verb for signal or sensor drop-off.',
    contextSnippet: 'SNR degraded past 30 meters of unshielded wire.',
    dateAdded: '2026-11-21',
    mode: 'technical',
    mastered: true,
  },
  {
    id: 'voc-3',
    used: 'find out',
    betterAlternative: 'diagnose',
    explanation: 'Precise troubleshooting verb.',
    contextSnippet: 'We diagnosed the ground loop on the oscilloscope.',
    dateAdded: '2026-11-22',
    mode: 'linkedin',
    mastered: false,
  },
];

test('analyzeWritingSample awards high scores to crisp EIE technical prose and detects applied library words', () => {
  const strongEieSample =
    'A 4–20 mA current loop resists factory cable drop because a constant current passes through the series wire regardless of resistance. We stabilized the RTD bridge output by placing an instrumentation amplifier directly before a 16-bit ADC. When ambient heat drifted at 35 °C, cold-junction compensation held readings within ±0.2 °C across the bench test.';

  const report = analyzeWritingSample({
    text: strongEieSample,
    vocabulary: SAMPLE_VOCAB_LIBRARY,
    mode: 'technical',
    tone: 'academic-technical',
    topic: '4-20 mA current loop and RTD signal conditioning',
  });

  assert.ok(report.overallScore >= 82, `expected >= 82, got ${report.overallScore}`);
  assert.ok(report.scores.grammar >= 85);
  assert.ok(report.scores.tone >= 85);
  assert.ok(report.scores.clarity >= 80);
  assert.equal(report.vocabularyComparison.appliedFromLibrary.length, 1);
  assert.equal(report.vocabularyComparison.appliedFromLibrary[0].entryId, 'voc-1');
  assert.match(report.vocabularyComparison.appliedFromLibrary[0].usedPhrase, /stabilized/i);
});

test('analyzeWritingSample catches EIE grammar pitfalls, literal calques, and vague phrasing with educational notes', () => {
  const flawedSample =
    'Yesterday we did a mistake while wiring a ADC and a RTD sensor at 50hz. The signal got worse and we could not find out why because there was a lot of noise in the datas and equipments. Kindly note that we will revert back after we fix the problem pls.';

  const report = analyzeWritingSample({
    text: flawedSample,
    vocabulary: SAMPLE_VOCAB_LIBRARY,
    mode: 'email',
    tone: 'formal-executive',
  });

  assert.ok(report.overallScore < 72, `expected flawed sample < 72, got ${report.overallScore}`);
  assert.ok(report.scores.grammar < 85);
  assert.ok(report.scores.tone < 75);

  // Should flag EIE article rule ("a ADC" / "a RTD"), uncountable nouns ("datas"), calques ("revert back"), and informal slang ("pls")
  const titles = report.suggestions.map((s) => s.title.toLowerCase()).join(' | ');
  assert.ok(titles.includes('article'), `expected article suggestion, got: ${titles}`);
  assert.ok(titles.includes('uncountable'), `expected uncountable suggestion, got: ${titles}`);
  assert.ok(
    report.suggestions.every((s) => s.educationalNote.length >= 20),
    'every suggestion must carry an educational note'
  );

  // Missed library opportunities: user wrote "got worse" (voc-2) and "find out" (voc-3)
  assert.ok(
    report.vocabularyComparison.missedLibraryOpportunities.some(
      (opp) => opp.entryId === 'voc-2' && opp.libraryAlternative === 'degraded'
    )
  );
  assert.ok(
    report.vocabularyComparison.missedLibraryOpportunities.some(
      (opp) => opp.entryId === 'voc-3' && opp.libraryAlternative === 'diagnose'
    )
  );

  // New professional alternatives: "fix the problem" -> isolate root cause / resolve the fault
  assert.ok(
    report.vocabularyComparison.professionalAlternatives.some(
      (alt) => /fix the problem/i.test(alt.original) && /isolate|resolve/i.test(alt.professionalAlternative)
    )
  );
});

test('analyzeWritingSample enforces anti-inflation guardrails on gibberish or empty input', () => {
  const empty = analyzeWritingSample({ text: '   ' });
  assert.equal(empty.overallScore, 0);
  assert.equal(empty.gradeLabel, 'Insufficient Sample');

  const gibberish = analyzeWritingSample({
    text: 'asdfgh qwerzx xcvbnm zzzzzz kkkkkk jkluiop',
    mode: 'technical',
    tone: 'academic-technical',
  });
  assert.ok(gibberish.overallScore <= 25, `gibberish must be capped <= 25, got ${gibberish.overallScore}`);
  assert.equal(gibberish.gradeLabel, 'Insufficient Sample');
});

test('compareVocabularyWithLibrary marks suggested alternatives already present in user library', () => {
  const cmp = compareVocabularyWithLibrary(
    'We will make the loop stable once we check the reading on the scope.',
    SAMPLE_VOCAB_LIBRARY
  );

  const stableAlt = cmp.professionalAlternatives.find((a) =>
    /make the loop stable/i.test(a.original)
  );
  assert.ok(stableAlt, 'expected alternative for "make the loop stable"');
  assert.equal(stableAlt.alreadyInLibrary, true);

  const checkAlt = cmp.professionalAlternatives.find((a) =>
    /check the reading/i.test(a.original)
  );
  assert.ok(checkAlt, 'expected alternative for "check the reading"');
  assert.equal(checkAlt.alreadyInLibrary, false);
});
