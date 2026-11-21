/**
 * Pure helper mapping Firebase Auth error codes to concise, actionable messages.
 */
export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';

  const message =
    error instanceof Error ? error.message : String(error ?? '');

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing authentication. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup was already open. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain': {
      const hostHint =
        typeof window !== 'undefined' && window.location?.hostname
          ? ` (${window.location.hostname})`
          : '';
      return `This domain${hostHint} is not yet authorized in Firebase Authentication. Add it under Firebase Console → Authentication → Settings → Authorized domains, or continue in Offline Space.`;
    }
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled yet in Firebase Console. Enable Email/Password (or Google) under Firebase Console → Authentication → Sign-in method.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Sign In instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Check your credentials or reset your password.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error while reaching authentication servers. Check your connection and retry.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Try signing in with Google or Email & Password.';
    default:
      if (message.includes('auth/operation-not-allowed')) {
        return 'This sign-in provider is not enabled yet in Firebase Console. Enable Email/Password under Authentication → Sign-in method.';
      }
      if (message.includes('auth/unauthorized-domain')) {
        return 'This domain is not yet authorized in Firebase Authentication → Settings → Authorized domains.';
      }
      if (message.includes('auth/invalid-credential')) {
        return 'Incorrect email or password. Check your credentials or reset your password.';
      }
      return message || 'Authentication could not be completed. Please try again.';
  }
}
