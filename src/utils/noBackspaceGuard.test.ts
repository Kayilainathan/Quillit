import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldBlockFlowBeforeInput,
  shouldBlockFlowKeydown,
} from './noBackspaceGuard';

test('shouldBlockFlowKeydown blocks Backspace, Delete, Cmd/Ctrl+Z, Cmd/Ctrl+X only when active', () => {
  assert.equal(shouldBlockFlowKeydown(false, { key: 'Backspace' }).blocked, false);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'Backspace' }).blocked, true);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'Delete' }).blocked, true);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'z', ctrlKey: true }).blocked, true);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'X', metaKey: true }).blocked, true);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'a' }).blocked, false);
  assert.equal(shouldBlockFlowKeydown(true, { key: 'Enter' }).blocked, false);
});

test('shouldBlockFlowBeforeInput blocks mobile/IME backward/forward deletion and undo', () => {
  assert.equal(
    shouldBlockFlowBeforeInput(false, { inputType: 'deleteContentBackward' }).blocked,
    false
  );
  assert.equal(
    shouldBlockFlowBeforeInput(true, { inputType: 'deleteContentBackward' }).blocked,
    true
  );
  assert.equal(
    shouldBlockFlowBeforeInput(true, { inputType: 'deleteWordBackward' }).blocked,
    true
  );
  assert.equal(
    shouldBlockFlowBeforeInput(true, { inputType: 'historyUndo' }).blocked,
    true
  );
  assert.equal(
    shouldBlockFlowBeforeInput(true, { inputType: 'insertText' }).blocked,
    false
  );
});
