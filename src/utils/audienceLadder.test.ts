import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRoomAJargon,
  combineThreeRoomsForEvaluation,
  evaluateRegisterShift,
} from './audienceLadder';

test('checkRoomAJargon catches technical jargon and unexplained acronyms in Room A', () => {
  const dirty = checkRoomAJargon(
    'We use an ADC with high impedance and CMRR to avoid aliasing and quantization noise.'
  );
  assert.equal(dirty.isClean, false);
  assert.ok(dirty.jargonHits.includes('impedance'));
  assert.ok(dirty.jargonHits.includes('aliasing'));
  assert.ok(dirty.jargonHits.includes('ADC'));

  const plain = checkRoomAJargon(
    'Imagine listening to a quiet friend across a loud cafeteria. If you cup your hands around your ears, their voice stays clear while the room noise fades away. Our circuit does that exact trick for tiny heat signals traveling along long factory cables so the screen shows the real temperature.'
  );
  assert.equal(plain.isClean, true);
  assert.equal(plain.withinWordRange, true);
});

test('evaluateRegisterShift confirms meaningful contrast between Room A and Room B', () => {
  const roomA =
    'Imagine pouring water through a garden hose with tiny leaks. Pressure drops along the path. Instead, imagine counting drops pushed through at a steady pace from the tap so every drop arrives accurately at the bucket no matter how long the hose stretches.';
  const roomB =
    'A 4-20 mA current loop eliminates series resistance voltage drop across 200-meter factory runs while providing a 4 mA live-zero fault threshold. Compared to 0-10 V signaling, it trades slightly higher loop power draw for deterministic open-circuit detection and strong electromagnetic noise immunity.';

  const res = evaluateRegisterShift(roomA, roomB);
  assert.equal(res.readyToEvaluate, true);
  assert.equal(res.roomAJargonCount, 0);
  assert.ok(res.lexicalShiftPct >= 70);

  const combined = combineThreeRoomsForEvaluation(roomA, roomB);
  assert.ok(combined.includes('[Room A — Curious 10-Year-Old]'));
  assert.ok(combined.includes('[Room B — Skeptical Senior Interviewer]'));
});
