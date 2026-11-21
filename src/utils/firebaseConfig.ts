export interface ResolvedFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export interface FirebaseConfigEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_DATABASE_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
}

const PLACEHOLDER_PROJECT_IDS = new Set([
  '',
  'remixed-project-id',
  'your-project-id',
  'my-project-id',
]);

function pickString(primary: unknown, fallback: unknown): string {
  const p = typeof primary === 'string' ? primary.trim() : '';
  if (p) return p;
  return typeof fallback === 'string' ? fallback.trim() : '';
}

/**
 * Resolves Firebase configuration from either `VITE_FIREBASE_*` environment
 * variables (useful for GitHub Actions / Pages builds) or an optional
 * `firebase-applet-config.json` file. Returns `null` if Firebase is not
 * configured so static deployments can fall back cleanly to Offline Space
 * without crashing at startup.
 */
export function resolveFirebaseConfig(
  fileConfig: Partial<ResolvedFirebaseConfig> | null | undefined,
  env: FirebaseConfigEnv = {}
): ResolvedFirebaseConfig | null {
  const apiKey = pickString(env.VITE_FIREBASE_API_KEY, fileConfig?.apiKey);
  const projectId = pickString(
    env.VITE_FIREBASE_PROJECT_ID,
    fileConfig?.projectId
  );
  const appId = pickString(env.VITE_FIREBASE_APP_ID, fileConfig?.appId);
  const authDomain =
    pickString(env.VITE_FIREBASE_AUTH_DOMAIN, fileConfig?.authDomain) ||
    (projectId ? `${projectId}.firebaseapp.com` : '');

  if (
    !apiKey ||
    !projectId ||
    !appId ||
    PLACEHOLDER_PROJECT_IDS.has(projectId.toLowerCase()) ||
    apiKey.toLowerCase().startsWith('my_') ||
    apiKey.toLowerCase().includes('placeholder')
  ) {
    return null;
  }

  const firestoreDatabaseId = pickString(
    env.VITE_FIREBASE_DATABASE_ID,
    fileConfig?.firestoreDatabaseId
  );
  const storageBucket = pickString(
    env.VITE_FIREBASE_STORAGE_BUCKET,
    fileConfig?.storageBucket
  );
  const messagingSenderId = pickString(
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    fileConfig?.messagingSenderId
  );
  const measurementId = pickString(
    env.VITE_FIREBASE_MEASUREMENT_ID,
    fileConfig?.measurementId
  );

  return {
    apiKey,
    projectId,
    appId,
    authDomain,
    ...(firestoreDatabaseId ? { firestoreDatabaseId } : {}),
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(measurementId ? { measurementId } : {}),
  };
}
