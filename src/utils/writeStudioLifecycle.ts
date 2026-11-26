import type { DrillType } from '../types';
import { COMPRESSION_ROUNDS } from './compressionSprint';

export interface EvaluatedDraftSnapshot {
  topic: string;
  content: string;
  roomAText: string;
  roomBText: string;
}

export interface DraftChangeCheckInput {
  activeDrill: DrillType;
  content: string;
  roomAText: string;
  roomBText: string;
  lastEvaluatedSnapshot: EvaluatedDraftSnapshot | null;
}

/**
 * Returns true if the current editor content differs from the last evaluated
 * snapshot (or if no snapshot has been evaluated yet).
 */
export function hasDraftChangedSinceEvaluation(
  input: DraftChangeCheckInput
): boolean {
  const { activeDrill, content, roomAText, roomBText, lastEvaluatedSnapshot } =
    input;
  if (!lastEvaluatedSnapshot) return true;
  if (activeDrill === 'three-rooms') {
    return (
      roomAText.trim() !== lastEvaluatedSnapshot.roomAText.trim() ||
      roomBText.trim() !== lastEvaluatedSnapshot.roomBText.trim()
    );
  }
  return content.trim() !== lastEvaluatedSnapshot.content.trim();
}

/**
 * Returns true when an authoritative evaluation exists and matches the current
 * non-empty draft verbatim without unsaved edits.
 */
export function isCurrentDraftEvaluatedClean(
  input: DraftChangeCheckInput & {
    hasCompletedEvaluation: boolean;
    evaluating: boolean;
  }
): boolean {
  if (!input.hasCompletedEvaluation || input.evaluating) return false;
  if (!input.lastEvaluatedSnapshot) return false;
  const hasCurrentText =
    input.activeDrill === 'three-rooms'
      ? input.roomAText.trim().length > 0 || input.roomBText.trim().length > 0
      : input.content.trim().length > 0;
  if (!hasCurrentText) return false;
  return !hasDraftChangedSinceEvaluation(input);
}

export type SprintStagePrimaryKind =
  | 'evaluating'
  | 'advance'
  | 'need-words'
  | 'submit-evaluate'
  | 're-evaluate'
  | 'new-sprint';

export type SprintStageSecondaryKind = 'revise' | 'new-sprint';

export interface CompressionSprintStageUi {
  allPassesCompleted: boolean;
  showTimerControls: boolean;
  disableStartButton: boolean;
  disableResetButton: boolean;
  statusText: string;
  primaryAction: {
    kind: SprintStagePrimaryKind;
    label: string;
    disabled: boolean;
  };
  secondaryAction: {
    kind: SprintStageSecondaryKind;
    label: string;
  } | null;
}

export interface CompressionSprintStageInput {
  sprintRoundIdx: 0 | 1 | 2;
  sprintSecondsLeft: number;
  sprintRunning: boolean;
  sprintAutoPaused: boolean;
  sprintAutoArmed: boolean;
  sprintCompleted: boolean;
  evaluating: boolean;
  hasRevisionContext: boolean;
  currentWordCount: number;
  minFinalWords?: number;
  isDraftEvaluatedClean: boolean;
}

/**
 * Pure state machine governing the 4/3/2 Compression Sprint stage header,
 * timer controls, stepper completion, and primary/secondary CTAs.
 */
export function resolveCompressionSprintStageUi(
  input: CompressionSprintStageInput
): CompressionSprintStageUi {
  const {
    sprintRoundIdx,
    sprintSecondsLeft,
    sprintRunning,
    sprintAutoPaused,
    sprintAutoArmed,
    sprintCompleted,
    evaluating,
    hasRevisionContext,
    currentWordCount,
    minFinalWords = COMPRESSION_ROUNDS[2].minWords,
    isDraftEvaluatedClean,
  } = input;

  const allPassesCompleted =
    sprintCompleted && sprintRoundIdx === 2 && !evaluating;
  const showTimerControls = !allPassesCompleted;
  const disableStartButton =
    evaluating || (!sprintRunning && sprintSecondsLeft <= 0);
  const disableResetButton = evaluating;

  let statusText: string;
  if (evaluating) {
    statusText = 'Scoring Pass 3 and measuring your compression arc...';
  } else if (allPassesCompleted && hasRevisionContext) {
    statusText =
      'Revising Pass 3 · tighten your draft and click Score Revision';
  } else if (allPassesCompleted && isDraftEvaluatedClean) {
    statusText = 'Sprint complete · All 3 passes scored';
  } else if (allPassesCompleted) {
    statusText =
      'Pass 3 updated · Re-evaluate your tightened draft or start a new sprint';
  } else if (sprintRunning) {
    statusText = `Pass ${sprintRoundIdx + 1} of 3 active · keep writing steadily`;
  } else if (sprintSecondsLeft <= 0) {
    statusText =
      sprintRoundIdx < 2
        ? `Time’s up for Pass ${sprintRoundIdx + 1} — advance to Pass ${sprintRoundIdx + 2} when ready`
        : 'Time’s up — review Pass 3 and submit when ready';
  } else if (sprintAutoPaused) {
    statusText = 'Paused · click Start or resume typing';
  } else if (sprintAutoArmed) {
    statusText = 'Starts automatically on your first keystroke, or click Start';
  } else {
    statusText = 'Timer paused · click Start to resume';
  }

  if (evaluating) {
    return {
      allPassesCompleted,
      showTimerControls,
      disableStartButton,
      disableResetButton,
      statusText,
      primaryAction: {
        kind: 'evaluating',
        label: 'Evaluating...',
        disabled: true,
      },
      secondaryAction: null,
    };
  }

  if (sprintRoundIdx < 2) {
    return {
      allPassesCompleted: false,
      showTimerControls: true,
      disableStartButton,
      disableResetButton,
      statusText,
      primaryAction: {
        kind: 'advance',
        label: sprintRoundIdx === 0 ? 'Pass 2 · 2m' : 'Pass 3 · 1m',
        disabled: false,
      },
      secondaryAction: null,
    };
  }

  const wordsNeeded = Math.max(0, minFinalWords - currentWordCount);

  if (allPassesCompleted && !hasRevisionContext && isDraftEvaluatedClean) {
    return {
      allPassesCompleted: true,
      showTimerControls: false,
      disableStartButton: true,
      disableResetButton: true,
      statusText,
      primaryAction: {
        kind: 'new-sprint',
        label: 'New Sprint',
        disabled: false,
      },
      secondaryAction: {
        kind: 'revise',
        label: 'Revise',
      },
    };
  }

  if (allPassesCompleted && (hasRevisionContext || !isDraftEvaluatedClean)) {
    if (wordsNeeded === 0) {
      return {
        allPassesCompleted: true,
        showTimerControls: false,
        disableStartButton: true,
        disableResetButton: true,
        statusText,
        primaryAction: {
          kind: 're-evaluate',
          label: hasRevisionContext ? 'Score Revision' : 'Re-evaluate',
          disabled: false,
        },
        secondaryAction: {
          kind: 'new-sprint',
          label: 'New Sprint',
        },
      };
    }
    return {
      allPassesCompleted: true,
      showTimerControls: false,
      disableStartButton: true,
      disableResetButton: true,
      statusText,
      primaryAction: {
        kind: 'need-words',
        label: `${wordsNeeded}w to re-score`,
        disabled: true,
      },
      secondaryAction: {
        kind: 'new-sprint',
        label: 'New Sprint',
      },
    };
  }

  if (wordsNeeded === 0) {
    return {
      allPassesCompleted: false,
      showTimerControls: true,
      disableStartButton,
      disableResetButton,
      statusText,
      primaryAction: {
        kind: 'submit-evaluate',
        label: 'Submit & Evaluate',
        disabled: false,
      },
      secondaryAction: null,
    };
  }

  return {
    allPassesCompleted: false,
    showTimerControls: true,
    disableStartButton,
    disableResetButton,
    statusText,
    primaryAction: {
      kind: 'need-words',
      label: `${wordsNeeded}w to submit`,
      disabled: true,
    },
    secondaryAction: null,
  };
}

export type StudioFooterPrimaryKind =
  | 'evaluating'
  | 'advance-sprint'
  | 'need-sprint-words'
  | 'submit-sprint'
  | 'new-sprint'
  | 'new-entry'
  | 're-evaluate'
  | 'score-revision'
  | 'evaluate';

export interface StudioFooterActionUi {
  secondaryMode: 'save-draft' | 'revise';
  primaryAction: {
    kind: StudioFooterPrimaryKind;
    label: string;
    disabled: boolean;
  };
}

export interface StudioFooterActionInput {
  activeDrill: DrillType;
  sprintRoundIdx: 0 | 1 | 2;
  sprintCompleted: boolean;
  currentWordCount: number;
  minFinalWords?: number;
  evaluating: boolean;
  hasRevisionContext: boolean;
  isDraftEvaluatedClean: boolean;
  hasCompletedEvaluation: boolean;
  hasDraftText: boolean;
}

/**
 * Pure state machine governing the WriteStudio bottom footer buttons so
 * primary/secondary actions never contradict the active sprint stage or
 * remain stuck on "Evaluate & Score" after an evaluation completes.
 */
export function resolveStudioFooterAction(
  input: StudioFooterActionInput
): StudioFooterActionUi {
  const {
    activeDrill,
    sprintRoundIdx,
    sprintCompleted,
    currentWordCount,
    minFinalWords = COMPRESSION_ROUNDS[2].minWords,
    evaluating,
    hasRevisionContext,
    isDraftEvaluatedClean,
    hasCompletedEvaluation,
    hasDraftText,
  } = input;

  const secondaryMode: 'save-draft' | 'revise' =
    isDraftEvaluatedClean &&
    hasCompletedEvaluation &&
    !hasRevisionContext &&
    !evaluating
      ? 'revise'
      : 'save-draft';

  if (evaluating) {
    return {
      secondaryMode: 'save-draft',
      primaryAction: {
        kind: 'evaluating',
        label: 'Evaluating...',
        disabled: true,
      },
    };
  }

  if (activeDrill === 'compression-432') {
    if (sprintRoundIdx < 2) {
      return {
        secondaryMode: 'save-draft',
        primaryAction: {
          kind: 'advance-sprint',
          label:
            sprintRoundIdx === 0 ? 'Next: Pass 2 · 2m' : 'Next: Pass 3 · 1m',
          disabled: false,
        },
      };
    }

    if (sprintCompleted && !hasRevisionContext && isDraftEvaluatedClean) {
      return {
        secondaryMode: 'revise',
        primaryAction: {
          kind: 'new-sprint',
          label: 'New Sprint',
          disabled: false,
        },
      };
    }

    const wordsNeeded = Math.max(0, minFinalWords - currentWordCount);
    if (sprintCompleted && (hasRevisionContext || !isDraftEvaluatedClean)) {
      if (wordsNeeded === 0) {
        return {
          secondaryMode: 'save-draft',
          primaryAction: {
            kind: 're-evaluate',
            label: hasRevisionContext ? 'Score Revision' : 'Re-evaluate',
            disabled: false,
          },
        };
      }
      return {
        secondaryMode: 'save-draft',
        primaryAction: {
          kind: 'need-sprint-words',
          label: `${wordsNeeded}w more to re-score`,
          disabled: true,
        },
      };
    }

    if (wordsNeeded === 0) {
      return {
        secondaryMode: 'save-draft',
        primaryAction: {
          kind: 'submit-sprint',
          label: 'Submit & Evaluate',
          disabled: false,
        },
      };
    }

    return {
      secondaryMode: 'save-draft',
      primaryAction: {
        kind: 'need-sprint-words',
        label: `${wordsNeeded}w more to submit`,
        disabled: true,
      },
    };
  }

  if (hasRevisionContext) {
    return {
      secondaryMode: 'save-draft',
      primaryAction: {
        kind: 'score-revision',
        label: 'Score Revision',
        disabled: false,
      },
    };
  }

  if (isDraftEvaluatedClean && hasCompletedEvaluation) {
    return {
      secondaryMode: 'revise',
      primaryAction: {
        kind: 'new-entry',
        label: 'New Entry',
        disabled: false,
      },
    };
  }

  if (hasCompletedEvaluation && hasDraftText && !isDraftEvaluatedClean) {
    return {
      secondaryMode: 'save-draft',
      primaryAction: {
        kind: 're-evaluate',
        label: 'Re-evaluate',
        disabled: false,
      },
    };
  }

  return {
    secondaryMode: 'save-draft',
    primaryAction: {
      kind: 'evaluate',
      label: 'Evaluate & Score',
      disabled: false,
    },
  };
}
