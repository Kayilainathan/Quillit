import { initializeApp, type FirebaseApp } from 'firebase/app';
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
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { formatFirebaseAuthError } from './utils/authErrors';
import {
  resolveFirebaseConfig,
  type ResolvedFirebaseConfig,
} from './utils/firebaseConfig';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
] as const;

// Load firebase-applet-config.json optionally via Vite glob so production/GitHub Pages
// builds still succeed cleanly even if the JSON file is omitted or configured via env vars.
const configModules = import.meta.glob<{
  default?: Partial<ResolvedFirebaseConfig>;
}>('../firebase-applet-config.json', { eager: true });

const fileFirebaseConfig =
  Object.values(configModules)[0]?.default ??
  (Object.values(configModules)[0] as Partial<ResolvedFirebaseConfig> | undefined);

const resolvedConfig = resolveFirebaseConfig(fileFirebaseConfig, {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_DATABASE_ID: import.meta.env.VITE_FIREBASE_DATABASE_ID,
  VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

let app: FirebaseApp | null = null;
let initializedAuth: Auth | null = null;
let initializedDb: Firestore | null = null;

function createResilientFirestore(
  firebaseApp: FirebaseApp,
  databaseId?: string
): Firestore {
  // Force HTTP long-polling and disable fetch streams so Firestore never stalls
  // for 10 seconds on blocked WebChannel streams inside preview iframes or proxies.
  const settings = {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  };
  try {
    return databaseId
      ? initializeFirestore(firebaseApp, settings, databaseId)
      : initializeFirestore(firebaseApp, settings);
  } catch {
    return databaseId
      ? getFirestore(firebaseApp, databaseId)
      : getFirestore(firebaseApp);
  }
}

if (resolvedConfig) {
  try {
    app = initializeApp(resolvedConfig);
    initializedDb = createResilientFirestore(
      app,
      resolvedConfig.firestoreDatabaseId
    );
    initializedAuth = getAuth(app);
  } catch (err) {
    console.warn('Firebase initialization skipped; running in Offline Space mode.', err);
    app = null;
    initializedAuth = null;
    initializedDb = null;
  }
}

export const isFirebaseConfigured = Boolean(app && initializedAuth);
export const hasConfiguredFirestoreDatabase = Boolean(
  initializedDb && resolvedConfig?.firestoreDatabaseId
);
export const db: Firestore | null = initializedDb;
export const auth: Auth | null = initializedAuth;

function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Cloud Sign-In is not configured on this static deployment. Use Continue in Offline Space, or add your Firebase config.'
    );
  }
  return auth;
}

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

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedWorkspaceAccessToken = null;
    }
  });
}

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
  const activeAuth = requireAuth();
  isSigningIn = true;
  try {
    const result = await signInWithPopup(activeAuth, basicGoogleProvider);
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
  const activeAuth = requireAuth();
  isSigningIn = true;
  try {
    const result = await signInWithPopup(activeAuth, workspaceGoogleProvider);
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
  const activeAuth = requireAuth();
  try {
    const result = await createUserWithEmailAndPassword(
      activeAuth,
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
  const activeAuth = requireAuth();
  try {
    const result = await signInWithEmailAndPassword(
      activeAuth,
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
  const activeAuth = requireAuth();
  try {
    await sendPasswordResetEmail(activeAuth, email.trim());
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Re-sends email verification link for the currently signed-in Email/Password user.
 */
export async function resendVerificationEmail(): Promise<void> {
  const activeAuth = requireAuth();
  if (!activeAuth.currentUser) {
    throw new Error('No signed-in user found.');
  }
  try {
    await sendEmailVerification(activeAuth.currentUser);
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

/**
 * Refreshes the signed-in Firebase user & ID token (picks up newly verified email status).
 */
export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth?.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedWorkspaceAccessToken = null;
  if (!auth) return;
  await signOut(auth);
}

let connectionTested = false;

export async function testConnection(): Promise<boolean> {
  if (connectionTested) return hasConfiguredFirestoreDatabase;
  connectionTested = true;
  if (!db || !hasConfiguredFirestoreDatabase) {
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
