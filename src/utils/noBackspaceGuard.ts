/**
 * Cross-platform No-Backspace Flow Sprint Guard.
 * Blocks Backspace, Delete, Cut (Ctrl/Cmd+X), and Undo (Ctrl/Cmd+Z) across BOTH
 * desktop keyboard events (`keydown`) AND mobile/IME `beforeinput` events.
 */

export interface KeydownLikeEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface BeforeInputLikeEvent {
  inputType?: string;
}

const BLOCKED_BEFORE_INPUT_TYPES = new Set([
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'deleteByCut',
  'deleteByDrag',
  'deleteContent',
  'historyUndo',
]);

export function shouldBlockFlowKeydown(
  active: boolean,
  event: KeydownLikeEvent
): { blocked: boolean; reason: string } {
  if (!active) return { blocked: false, reason: '' };
  const key = event.key;
  const mod = Boolean(event.ctrlKey || event.metaKey);

  if (key === 'Backspace' || key === 'Delete') {
    return {
      blocked: true,
      reason: 'Keep moving forward — edit after the sprint.',
    };
  }

  if (mod && (key.toLowerCase() === 'z' || key.toLowerCase() === 'x')) {
    return {
      blocked: true,
      reason: 'Keep moving forward — edit after the sprint.',
    };
  }

  return { blocked: false, reason: '' };
}

export function shouldBlockFlowBeforeInput(
  active: boolean,
  event: BeforeInputLikeEvent
): { blocked: boolean; reason: string } {
  if (!active) return { blocked: false, reason: '' };
  const type = event.inputType || '';
  if (BLOCKED_BEFORE_INPUT_TYPES.has(type)) {
    return {
      blocked: true,
      reason: 'Keep moving forward — edit after the sprint.',
    };
  }
  return { blocked: false, reason: '' };
}

export const DEFAULT_FLOW_SPRINT_SECONDS = 180; // 3 minutes
