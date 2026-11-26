import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_VERIFY_POPUP_DURATION_MS,
  computeEmailVerifyTimerRatio,
  getEmailVerifyDismissKey,
  shouldShowEmailVerifyPopup,
  tickEmailVerifyCountdown,
} from './emailVerifyPopup';

test('shouldShowEmailVerifyPopup only shows for unverified cloud users when active and not dismissed', () => {
  assert.equal(
    shouldShowEmailVerifyPopup({
      hasCloudUser: true,
      emailVerified: false,
      dismissedThisSession: false,
      suppressed: false,
      remainingMs: EMAIL_VERIFY_POPUP_DURATION_MS,
    }),
    true
  );

  // Hidden once verified
  assert.equal(
    shouldShowEmailVerifyPopup({
      hasCloudUser: true,
      emailVerified: true,
      dismissedThisSession: false,
      suppressed: false,
      remainingMs: EMAIL_VERIFY_POPUP_DURATION_MS,
    }),
    false
  );

  // Hidden when dismissed or suppressed or expired
  assert.equal(
    shouldShowEmailVerifyPopup({
      hasCloudUser: true,
      emailVerified: false,
      dismissedThisSession: true,
      suppressed: false,
      remainingMs: EMAIL_VERIFY_POPUP_DURATION_MS,
    }),
    false
  );
  assert.equal(
    shouldShowEmailVerifyPopup({
      hasCloudUser: true,
      emailVerified: false,
      dismissedThisSession: false,
      suppressed: true,
      remainingMs: EMAIL_VERIFY_POPUP_DURATION_MS,
    }),
    false
  );
  assert.equal(
    shouldShowEmailVerifyPopup({
      hasCloudUser: true,
      emailVerified: false,
      dismissedThisSession: false,
      suppressed: false,
      remainingMs: 0,
    }),
    false
  );
});

test('tickEmailVerifyCountdown pauses on hover/busy and expires cleanly at zero', () => {
  const pausedRes = tickEmailVerifyCountdown(4000, 1000, true);
  assert.equal(pausedRes.nextRemainingMs, 4000);
  assert.equal(pausedRes.expired, false);

  const activeRes = tickEmailVerifyCountdown(4000, 1500, false);
  assert.equal(activeRes.nextRemainingMs, 2500);
  assert.equal(activeRes.expired, false);

  const expiredRes = tickEmailVerifyCountdown(300, 500, false);
  assert.equal(expiredRes.nextRemainingMs, 0);
  assert.equal(expiredRes.expired, true);

  assert.equal(computeEmailVerifyTimerRatio(4000, 8000), 0.5);
  assert.equal(computeEmailVerifyTimerRatio(-10, 8000), 0);
  assert.equal(
    getEmailVerifyDismissKey('user-42'),
    'quillit_email_verify_popup_dismissed_user-42'
  );
});
