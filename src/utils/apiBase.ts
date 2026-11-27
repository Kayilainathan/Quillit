import { auth } from '../firebase';
import { isGitHubPagesHost, normalizeApiBaseUrl } from './apiUrl';

export { isGitHubPagesHost, normalizeApiBaseUrl };

const RUNTIME_API_BASE_KEY = 'quillit_api_base_url_v1';

function readRuntimeApiBaseOverride(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('apiBase') || params.get('api');
    if (fromQuery) {
      const normalized = normalizeApiBaseUrl(fromQuery);
      if (normalized) {
        localStorage.setItem(RUNTIME_API_BASE_KEY, normalized);
        return normalized;
      }
    }
  } catch {
    // Ignore malformed query string or restricted storage
  }
  try {
    return normalizeApiBaseUrl(localStorage.getItem(RUNTIME_API_BASE_KEY));
  } catch {
    return '';
  }
}

export function setRuntimeApiBaseUrl(url: string): string {
  const normalized = normalizeApiBaseUrl(url);
  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        localStorage.setItem(RUNTIME_API_BASE_KEY, normalized);
      } else {
        localStorage.removeItem(RUNTIME_API_BASE_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }
  return normalized;
}

export function clearRuntimeApiBaseUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RUNTIME_API_BASE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Resolves the API base URL for backend routes:
 * 1. Optional runtime override saved on-device (for static GitHub Pages connecting to a hosted server)
 * 2. Build-time `VITE_API_BASE_URL` (normalized safely)
 * 3. Empty string (relative `/api/*` against same-origin Express server)
 */
export function getApiBaseUrl(): string {
  const runtimeOverride = readRuntimeApiBaseOverride();
  if (runtimeOverride) return runtimeOverride;

  const envRaw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL)
      : '';
  return normalizeApiBaseUrl(envRaw);
}

/**
 * True when running on static GitHub Pages without a configured remote API server URL.
 * Calling `/api/*` relative to `*.github.io` always returns an HTML 404 page.
 */
export function isStaticPagesWithoutApi(): boolean {
  return isGitHubPagesHost() && !getApiBaseUrl();
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Authenticated fetch wrapper for all Quillit `/api/*` requests.
 * Resolves the target URL via `getApiUrl`, fails fast on unconfigured static GitHub Pages
 * instead of waiting on guaranteed HTML 404 responses, and attaches the signed-in
 * Firebase user's ID token (`Authorization: Bearer <token>`) when available.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  if (path.startsWith('/api/') && isStaticPagesWithoutApi()) {
    throw new Error(
      'Static GitHub Pages build has no AI backend server configured (set VITE_API_BASE_URL or connect a server URL in Settings).'
    );
  }

  const url = getApiUrl(path);
  const headers = new Headers(init.headers);

  if (!headers.has('Authorization') && auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`);
      }
    } catch {
      // Proceed without Bearer header if token refresh fails offline
    }
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

/**
 * Safely parses JSON from an API response, returning null if a static host
 * (such as GitHub Pages) returns an HTML 404 fallback instead of JSON.
 */
export async function safeParseJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T | null> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
