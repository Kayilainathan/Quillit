/**
 * Post-Evaluation Workspace Clear State Machine (Pure Logic)
 *
 * Manages the non-destructive 3-second countdown popup shown after a successful
 * Writing or Conversation evaluation so users can seamlessly move to a fresh
 * page or chat—while pausing on hover/focus, preserving the evaluation report,
 * and offering an instant 1-click Undo restore window.
 */

export type PostEvalClearPhase =
  | 'idle'
  | 'countdown' // Waiting for 3s auto-clear (or manual confirmation when autoClearEnabled is false)
  | 'cleared-undo'; // Workspace cleared cleanly; undo snapshot available

export interface PostEvalClearState {
  phase: PostEvalClearPhase;
  autoClearEnabled: boolean;
  paused: boolean;
  totalMs: number;
  remainingMs: number;
  undoTotalMs: number;
  undoRemainingMs: number;
  surfaceLabel: 'editor' | 'chat';
}

export const DEFAULT_POST_EVAL_CLEAR_MS = 3000;
export const DEFAULT_POST_EVAL_UNDO_MS = 7000;
export const POST_EVAL_AUTOCLEAR_STORAGE_KEY = 'quillit_post_eval_autoclear';

export function readAutoClearPreference(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    const raw = window.localStorage.getItem(POST_EVAL_AUTOCLEAR_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeAutoClearPreference(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      POST_EVAL_AUTOCLEAR_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
}

export function createIdlePostEvalClearState(
  surfaceLabel: 'editor' | 'chat',
  autoClearEnabled = true
): PostEvalClearState {
  return {
    phase: 'idle',
    autoClearEnabled,
    paused: false,
    totalMs: DEFAULT_POST_EVAL_CLEAR_MS,
    remainingMs: DEFAULT_POST_EVAL_CLEAR_MS,
    undoTotalMs: DEFAULT_POST_EVAL_UNDO_MS,
    undoRemainingMs: DEFAULT_POST_EVAL_UNDO_MS,
    surfaceLabel,
  };
}

export function startPostEvalClearPrompt(
  state: PostEvalClearState,
  durationMs = DEFAULT_POST_EVAL_CLEAR_MS
): PostEvalClearState {
  const safeDuration = Math.max(1000, Math.round(durationMs));
  return {
    ...state,
    phase: 'countdown',
    paused: false,
    totalMs: safeDuration,
    remainingMs: safeDuration,
  };
}

export function setPostEvalClearPaused(
  state: PostEvalClearState,
  paused: boolean
): PostEvalClearState {
  if (state.phase === 'idle') return state;
  return { ...state, paused };
}

export function togglePostEvalAutoClear(
  state: PostEvalClearState,
  enabled?: boolean
): PostEvalClearState {
  const nextEnabled =
    typeof enabled === 'boolean' ? enabled : !state.autoClearEnabled;
  return {
    ...state,
    autoClearEnabled: nextEnabled,
    // Reset countdown cleanly if user flips auto-clear back on during prompt
    remainingMs:
      state.phase === 'countdown' && nextEnabled ? state.totalMs : state.remainingMs,
  };
}

export interface PostEvalTickResult {
  nextState: PostEvalClearState;
  shouldExecuteClear: boolean;
  shouldExpireUndo: boolean;
}

/**
 * Advances the active countdown or undo timer by `deltaMs`.
 * Returns explicit side-effect triggers so React components stay predictable.
 */
export function tickPostEvalClear(
  state: PostEvalClearState,
  deltaMs: number
): PostEvalTickResult {
  const dt = Math.max(0, deltaMs);

  if (state.phase === 'idle' || state.paused || dt === 0) {
    return {
      nextState: state,
      shouldExecuteClear: false,
      shouldExpireUndo: false,
    };
  }

  if (state.phase === 'countdown') {
    if (!state.autoClearEnabled) {
      // Manual ask-only mode: stays quietly open until user clicks Clear or Keep
      return {
        nextState: state,
        shouldExecuteClear: false,
        shouldExpireUndo: false,
      };
    }

    const nextRemaining = Math.max(0, state.remainingMs - dt);
    if (nextRemaining === 0) {
      return {
        nextState: {
          ...state,
          phase: 'cleared-undo',
          paused: false,
          remainingMs: 0,
          undoRemainingMs: state.undoTotalMs,
        },
        shouldExecuteClear: true,
        shouldExpireUndo: false,
      };
    }

    return {
      nextState: {
        ...state,
        remainingMs: nextRemaining,
      },
      shouldExecuteClear: false,
      shouldExpireUndo: false,
    };
  }

  // phase === 'cleared-undo'
  const nextUndoRemaining = Math.max(0, state.undoRemainingMs - dt);
  if (nextUndoRemaining === 0) {
    return {
      nextState: {
        ...state,
        phase: 'idle',
        paused: false,
        undoRemainingMs: 0,
      },
      shouldExecuteClear: false,
      shouldExpireUndo: true,
    };
  }

  return {
    nextState: {
      ...state,
      undoRemainingMs: nextUndoRemaining,
    },
    shouldExecuteClear: false,
    shouldExpireUndo: false,
  };
}

export function transitionToClearedUndo(
  state: PostEvalClearState
): PostEvalClearState {
  return {
    ...state,
    phase: 'cleared-undo',
    paused: false,
    remainingMs: 0,
    undoRemainingMs: state.undoTotalMs,
  };
}

export function dismissPostEvalClear(
  state: PostEvalClearState
): PostEvalClearState {
  return {
    ...state,
    phase: 'idle',
    paused: false,
    remainingMs: state.totalMs,
    undoRemainingMs: state.undoTotalMs,
  };
}

export function computeCountdownProgress(state: PostEvalClearState): number {
  if (state.phase === 'countdown') {
    if (state.totalMs <= 0) return 0;
    return Math.max(0, Math.min(1, state.remainingMs / state.totalMs));
  }
  if (state.phase === 'cleared-undo') {
    if (state.undoTotalMs <= 0) return 0;
    return Math.max(0, Math.min(1, state.undoRemainingMs / state.undoTotalMs));
  }
  return 0;
}

export function formatRemainingSeconds(ms: number): number {
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}
