import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDraftChangedSinceEvaluation,
  isCurrentDraftEvaluatedClean,
  resolveCompressionSprintStageUi,
  resolveStudioFooterAction,
} from './writeStudioLifecycle';

test('hasDraftChangedSinceEvaluation and isCurrentDraftEvaluatedClean detect edits accurately across standard and 3-rooms', () => {
  const snap = {
    topic: '3-wire RTD',
    content: 'A 3-wire RTD cancels lead resistance drift cleanly.',
    roomAText: 'Simple version',
    roomBText: 'Technical version',
  };

  assert.equal(
    hasDraftChangedSinceEvaluation({
      activeDrill: 'compression-432',
      content: '  A 3-wire RTD cancels lead resistance drift cleanly.  ',
      roomAText: '',
      roomBText: '',
      lastEvaluatedSnapshot: snap,
    }),
    false
  );

  assert.equal(
    isCurrentDraftEvaluatedClean({
      activeDrill: 'compression-432',
      content: snap.content,
      roomAText: '',
      roomBText: '',
      lastEvaluatedSnapshot: snap,
      hasCompletedEvaluation: true,
      evaluating: false,
    }),
    true
  );

  assert.equal(
    isCurrentDraftEvaluatedClean({
      activeDrill: 'compression-432',
      content: snap.content + ' Updated.',
      roomAText: '',
      roomBText: '',
      lastEvaluatedSnapshot: snap,
      hasCompletedEvaluation: true,
      evaluating: false,
    }),
    false
  );

  assert.equal(
    hasDraftChangedSinceEvaluation({
      activeDrill: 'three-rooms',
      content: '',
      roomAText: 'Simple version',
      roomBText: 'Technical version revised',
      lastEvaluatedSnapshot: snap,
    }),
    true
  );
});

test('resolveCompressionSprintStageUi transitions cleanly from Pass 1 -> 2 -> 3 -> Evaluating -> Completed -> Edited', () => {
  const pass1 = resolveCompressionSprintStageUi({
    sprintRoundIdx: 0,
    sprintSecondsLeft: 180,
    sprintRunning: false,
    sprintAutoPaused: false,
    sprintAutoArmed: true,
    sprintCompleted: false,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 0,
    isDraftEvaluatedClean: false,
  });
  assert.equal(pass1.primaryAction.kind, 'advance');
  assert.equal(pass1.primaryAction.label, 'Pass 2 · 2m');
  assert.equal(pass1.showTimerControls, true);
  assert.equal(pass1.allPassesCompleted, false);

  // Time's up disables Start button cleanly
  const timeUp = resolveCompressionSprintStageUi({
    sprintRoundIdx: 1,
    sprintSecondsLeft: 0,
    sprintRunning: false,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: false,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 60,
    isDraftEvaluatedClean: false,
  });
  assert.equal(timeUp.disableStartButton, true);
  assert.match(timeUp.statusText, /Time’s up/);

  // Pass 3 below 45 words cannot submit yet
  const pass3Short = resolveCompressionSprintStageUi({
    sprintRoundIdx: 2,
    sprintSecondsLeft: 42,
    sprintRunning: true,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: false,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 30,
    isDraftEvaluatedClean: false,
  });
  assert.equal(pass3Short.primaryAction.kind, 'need-words');
  assert.equal(pass3Short.primaryAction.label, '15w to submit');

  // Pass 3 >= 45 words offers Submit & Evaluate
  const pass3Ready = resolveCompressionSprintStageUi({
    sprintRoundIdx: 2,
    sprintSecondsLeft: 25,
    sprintRunning: true,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: false,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 52,
    isDraftEvaluatedClean: false,
  });
  assert.equal(pass3Ready.primaryAction.kind, 'submit-evaluate');
  assert.equal(pass3Ready.primaryAction.label, 'Submit & Evaluate');

  // After final evaluation: NO Submit & Evaluate, NO Start timer, all passes done -> New Sprint + Revise
  const pass3Done = resolveCompressionSprintStageUi({
    sprintRoundIdx: 2,
    sprintSecondsLeft: 25,
    sprintRunning: false,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: true,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 52,
    isDraftEvaluatedClean: true,
  });
  assert.equal(pass3Done.allPassesCompleted, true);
  assert.equal(pass3Done.showTimerControls, false);
  assert.equal(pass3Done.primaryAction.kind, 'new-sprint');
  assert.equal(pass3Done.primaryAction.label, 'New Sprint');
  assert.equal(pass3Done.secondaryAction?.kind, 'revise');

  // Once user edits Pass 3 after evaluation: flips to Re-evaluate + secondary New Sprint
  const pass3Edited = resolveCompressionSprintStageUi({
    sprintRoundIdx: 2,
    sprintSecondsLeft: 25,
    sprintRunning: false,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: true,
    evaluating: false,
    hasRevisionContext: false,
    currentWordCount: 54,
    isDraftEvaluatedClean: false,
  });
  assert.equal(pass3Edited.primaryAction.kind, 're-evaluate');
  assert.equal(pass3Edited.primaryAction.label, 'Re-evaluate');
  assert.equal(pass3Edited.secondaryAction?.kind, 'new-sprint');

  // Clicking Revise immediately switches completed sprint CTA to Score Revision
  const pass3Revising = resolveCompressionSprintStageUi({
    sprintRoundIdx: 2,
    sprintSecondsLeft: 25,
    sprintRunning: false,
    sprintAutoPaused: false,
    sprintAutoArmed: false,
    sprintCompleted: true,
    evaluating: false,
    hasRevisionContext: true,
    currentWordCount: 52,
    isDraftEvaluatedClean: true,
  });
  assert.equal(pass3Revising.primaryAction.kind, 're-evaluate');
  assert.equal(pass3Revising.primaryAction.label, 'Score Revision');
});

test('resolveStudioFooterAction never shows stale Evaluate & Score during Pass 1/2 or after completed evaluation', () => {
  const sprintPass1 = resolveStudioFooterAction({
    activeDrill: 'compression-432',
    sprintRoundIdx: 0,
    sprintCompleted: false,
    currentWordCount: 20,
    evaluating: false,
    hasRevisionContext: false,
    isDraftEvaluatedClean: false,
    hasCompletedEvaluation: false,
    hasDraftText: true,
  });
  assert.equal(sprintPass1.primaryAction.kind, 'advance-sprint');
  assert.equal(sprintPass1.primaryAction.label, 'Next: Pass 2 · 2m');

  const sprintDone = resolveStudioFooterAction({
    activeDrill: 'compression-432',
    sprintRoundIdx: 2,
    sprintCompleted: true,
    currentWordCount: 51,
    evaluating: false,
    hasRevisionContext: false,
    isDraftEvaluatedClean: true,
    hasCompletedEvaluation: true,
    hasDraftText: true,
  });
  assert.equal(sprintDone.primaryAction.kind, 'new-sprint');
  assert.equal(sprintDone.secondaryMode, 'revise');

  const standardDone = resolveStudioFooterAction({
    activeDrill: 'standard',
    sprintRoundIdx: 0,
    sprintCompleted: false,
    currentWordCount: 120,
    evaluating: false,
    hasRevisionContext: false,
    isDraftEvaluatedClean: true,
    hasCompletedEvaluation: true,
    hasDraftText: true,
  });
  assert.equal(standardDone.primaryAction.kind, 'new-entry');
  assert.equal(standardDone.primaryAction.label, 'New Entry');
  assert.equal(standardDone.secondaryMode, 'revise');

  const standardEdited = resolveStudioFooterAction({
    activeDrill: 'standard',
    sprintRoundIdx: 0,
    sprintCompleted: false,
    currentWordCount: 125,
    evaluating: false,
    hasRevisionContext: false,
    isDraftEvaluatedClean: false,
    hasCompletedEvaluation: true,
    hasDraftText: true,
  });
  assert.equal(standardEdited.primaryAction.kind, 're-evaluate');
  assert.equal(standardEdited.primaryAction.label, 'Re-evaluate');
  assert.equal(standardEdited.secondaryMode, 'save-draft');
});
