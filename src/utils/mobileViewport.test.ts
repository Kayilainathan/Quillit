import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_BOTTOM_NAV_ITEMS,
  computeStickyViewportRatio,
  formatMobileStudioSummary,
  isVirtualKeyboardLikelyOpen,
  shouldShowMobileBottomNav,
} from './mobileViewport';

test('MOBILE_BOTTOM_NAV_ITEMS defines 5 thumb-zone destinations', () => {
  assert.equal(MOBILE_BOTTOM_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_BOTTOM_NAV_ITEMS.map((item) => item.id),
    ['write', 'converse', 'dashboard', 'calendar', 'vocabulary']
  );
});

test('isVirtualKeyboardLikelyOpen detects mobile keyboard open without desktop false positives', () => {
  // iPhone 14 portrait (390x844) with keyboard reducing visual height to 520px
  assert.equal(isVirtualKeyboardLikelyOpen(844, 520, 390), true);
  // Minor browser address bar collapse (60px) should not trigger
  assert.equal(isVirtualKeyboardLikelyOpen(844, 784, 390), false);
  // Desktop viewport should never report virtual keyboard
  assert.equal(isVirtualKeyboardLikelyOpen(900, 500, 1280), false);
  // Invalid dimensions handled safely
  assert.equal(isVirtualKeyboardLikelyOpen(0, 0, 390), false);
});

test('shouldShowMobileBottomNav hides during focus mode or open keyboard', () => {
  assert.equal(
    shouldShowMobileBottomNav({
      activeView: 'write',
      focusMode: false,
      keyboardOpen: false,
    }),
    true
  );
  assert.equal(
    shouldShowMobileBottomNav({
      activeView: 'write',
      focusMode: true,
      keyboardOpen: false,
    }),
    false
  );
  assert.equal(
    shouldShowMobileBottomNav({
      activeView: 'converse',
      focusMode: false,
      keyboardOpen: true,
    }),
    false
  );
  assert.equal(
    shouldShowMobileBottomNav({
      activeView: 'calendar',
      focusMode: true,
      keyboardOpen: false,
    }),
    true
  );
});

test('computeStickyViewportRatio stays within the 15% mobile sticky cap on standard phones', () => {
  const ratio = computeStickyViewportRatio(48, 58, 844);
  assert.ok(ratio < 0.15, `Expected sticky ratio < 0.15, got ${ratio}`);
});

test('formatMobileStudioSummary produces concise single-line mobile labels', () => {
  assert.equal(
    formatMobileStudioSummary({
      modeLabel: 'Technical',
      drillLabel: 'Standard',
      toneLabel: 'Academic',
    }),
    'Technical · Academic'
  );
  assert.equal(
    formatMobileStudioSummary({
      modeLabel: 'Journal',
      drillLabel: '4/3/2 Sprint',
      toneLabel: 'Conversational',
      constraintShortLabel: 'No Passive',
    }),
    'Journal · 4/3/2 Sprint · No Passive'
  );
  assert.equal(
    formatMobileStudioSummary({
      modeLabel: 'Email',
      drillLabel: 'Standard',
      toneLabel: 'Formal',
      flowLockActive: true,
    }),
    'Email · 3m Flow'
  );
});
