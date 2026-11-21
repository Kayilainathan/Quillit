import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { formatFirebaseAuthError } from './utils/authErrors';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
] as const;

const app = initializeApp(firebaseConfig);

const configWithOptionalDb = firebaseConfig as typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};

export const hasConfiguredFirestoreDatabase = Boolean(
  configWithOptionalDb.firestoreDatabaseId
);

export const db = configWithOptionalDb.firestoreDatabaseId
  ? getFirestore(app, configWithOptionalDb.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

// Standard Google Sign-In provider (no sensitive Workspace scopes that can block basic login)
export const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Extended Google Workspace provider used ONLY when explicitly syncing Sheets / Docs
export const workspaceGoogleProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  workspaceGoogleProvider.addScope(scope);
}
workspaceGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never written to localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;
let isSigningIn = false;

onAuthStateChanged(auth, (user) => {
  if (!user && !isSigningIn) {
    cachedWorkspaceAccessToken = null;
  }
});

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function clearWorkspaceAccessToken(): void {
  cachedWorkspaceAccessToken = null;
}

/**
 * Primary Google Sign-In for authentication & Firestore cross-device sync.
 * Uses clean basic GoogleAuthProvider so Workspace consent scopes never block login.
 */
export async function signInWithGoogleAccount(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, basicGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    return {
      user: result.user,
      accessToken: credential?.accessToken ?? null,
    };
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  } finally {
    isSigningIn = false;
  }
}

/**
 * Explicitly authorizes Google Workspace (Sheets, Docs, Drive file) scopes for Drive/Sheets/Docs sync.
 */
export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, workspaceGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedWorkspaceAccessToken = credential?.accessToken ?? null;
    return {
      user: result.user,
      accessToken: cachedWorkspaceAccessToken,
    };
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  } finally {
    isSigningIn = false;
  }
}

/**
 * Creates a cross-device Email & Password account via Firebase Auth and sends verification email.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: User; verificationSent: boolean }> {
  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    if (displayName?.trim()) {
      await updateProfile(result.user, { displayName: displayName.trim() }).catch(
        () => {}
      );
    }
    let verificationSent = false;
    try {
      await sendEmailVerification(result.user);
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    return { user: result.user, verificationSent };
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Signs into an existing cross-device Email & Password account.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    return result.user;
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Sends a Firebase password reset email.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Re-sends email verification link for the currently signed-in Email/Password user.
 */
export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No signed-in user found.');
  }
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Refreshes the signed-in Firebase user & ID token (picks up newly verified email status).
 */
export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedWorkspaceAccessToken = null;
  await signOut(auth);
}

let connectionTested = false;

export async function testConnection(): Promise<boolean> {
  if (connectionTested) return hasConfiguredFirestoreDatabase;
  connectionTested = true;
  if (!hasConfiguredFirestoreDatabase) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

void testConnection();
