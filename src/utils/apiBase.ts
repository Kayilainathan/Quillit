import { auth } from '../firebase';
import {
  detectHostingEnvironment,
  isAiStudioPreviewUrl,
  isGitHubPagesHost,
  isStaticHostingEnvironment,
  normalizeApiBaseUrl,
  resolveApiTarget,
  type ApiTargetResolution,
  type HostingEnvironment,
} from './apiUrl';

export {
  detectHostingEnvironment,
  isAiStudioPreviewUrl,
  isGitHubPagesHost,
  isStaticHostingEnvironment,
  normalizeApiBaseUrl,
  resolveApiTarget,
  type ApiTargetResolution,
  type HostingEnvironment,
};

const RUNTIME_API_BASE_KEY = 'quillit_api_base_url_v1';
const DEFAULT_HEALTH_TIMEOUT_MS = 8_000;
const DEFAULT_API_TIMEOUT_MS = 50_000;

/**
 * In-memory flag set if a same-origin `/api/*` request on a custom domain
 * returns a static HTML fallback (e.g. GitHub Pages custom domain 404/index.html).
 * Automatically cleared whenever the user saves or clears a runtime API base URL.
 */
let sameOriginHtmlFallbackDetected = false;

export class StaticHostNoBackendError extends Error {
  readonly code = 'STATIC_HOST_NO_BACKEND' as const;
  readonly hostingEnv: HostingEnvironment;

  constructor(message: string, hostingEnv: HostingEnvironment) {
    super(message);
    this.name = 'StaticHostNoBackendError';
    this.hostingEnv = hostingEnv;
  }
}

export function isStaticHostNoBackendError(
  err: unknown
): err is StaticHostNoBackendError {
  return (
    err instanceof StaticHostNoBackendError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'STATIC_HOST_NO_BACKEND')
  );
}

function readRuntimeApiBaseOverride(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('apiBase') || params.get('api');
    if (fromQuery) {
      const normalized = normalizeApiBaseUrl(fromQuery);
      if (normalized) {
        localStorage.setItem(RUNTIME_API_BASE_KEY, normalized);
        sameOriginHtmlFallbackDetected = false;
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

function readEnvApiBaseUrl(): string {
  const envRaw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL)
      : '';
  return normalizeApiBaseUrl(envRaw);
}

export function setRuntimeApiBaseUrl(url: string): string {
  const normalized = normalizeApiBaseUrl(url);
  sameOriginHtmlFallbackDetected = false;
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
  sameOriginHtmlFallbackDetected = false;
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RUNTIME_API_BASE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Resolves the active remote API base URL:
 * 1. Runtime override saved on-device (Settings / `?apiBase=...`)
 * 2. Build-time `VITE_API_BASE_URL` (normalized safely)
 * 3. Empty string (use same-origin Express server when available)
 */
export function getApiBaseUrl(): string {
  return readRuntimeApiBaseOverride() || readEnvApiBaseUrl();
}

/**
 * True when running on a static host (GitHub Pages, Cloudflare Pages, custom-domain static host)
 * without a configured remote API server URL.
 */
export function isStaticPagesWithoutApi(): boolean {
  const target = resolveApiTarget('/api/health', {
    runtimeBaseUrl: readRuntimeApiBaseOverride(),
    envBaseUrl: readEnvApiBaseUrl(),
    sameOriginHtmlFallbackDetected,
  });
  return target.mode === 'offline-static';
}

export function getApiUrl(path: string): string {
  const target = resolveApiTarget(path, {
    runtimeBaseUrl: readRuntimeApiBaseOverride(),
    envBaseUrl: readEnvApiBaseUrl(),
    sameOriginHtmlFallbackDetected,
  });
  return target.url;
}

export function getApiConnectionSummary(): {
  mode: 'same-origin' | 'remote' | 'offline-static';
  hostingEnv: HostingEnvironment;
  baseUrl: string;
  hasBuildEnvBase: boolean;
  hasRuntimeOverride: boolean;
} {
  const runtimeBaseUrl = readRuntimeApiBaseOverride();
  const envBaseUrl = readEnvApiBaseUrl();
  const target = resolveApiTarget('/api/health', {
    runtimeBaseUrl,
    envBaseUrl,
    sameOriginHtmlFallbackDetected,
  });
  return {
    mode: target.mode,
    hostingEnv: target.hostingEnv,
    baseUrl: target.baseUrl,
    hasBuildEnvBase: Boolean(envBaseUrl),
    hasRuntimeOverride: Boolean(runtimeBaseUrl),
  };
}

function createRequestSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => {
    controller.abort(new Error(`API request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timerId);
      if (callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}

export interface ApiFetchOptions extends RequestInit {
  /** Optional per-request timeout in milliseconds (defaults to 8s for health checks, 50s for AI routes). */
  timeoutMs?: number;
}

/**
 * Authenticated, environment-aware fetch wrapper for all Quillit `/api/*` requests.
 * - Detects development, full-stack production, and static GitHub Pages environments
 * - Fails fast with `StaticHostNoBackendError` on static deployments lacking `VITE_API_BASE_URL`
 * - Detects static HTML 404/SPA fallbacks on custom domains so offline-first mode engages cleanly
 * - Enforces bounded timeouts so unreachable remote backends never stall the editor
 * - Attaches the signed-in Firebase user's ID token (`Authorization: Bearer <token>`) when available
 */
export async function apiFetch(
  path: string,
  init: ApiFetchOptions = {}
): Promise<Response> {
  const target = resolveApiTarget(path, {
    runtimeBaseUrl: readRuntimeApiBaseOverride(),
    envBaseUrl: readEnvApiBaseUrl(),
    sameOriginHtmlFallbackDetected,
  });

  if (target.mode === 'offline-static') {
    throw new StaticHostNoBackendError(
      target.reason ||
        'Static hosting deployment has no AI backend configured; falling back to offline-first mode.',
      target.hostingEnv
    );
  }

  const { timeoutMs, signal: callerSignal, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers);

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

  const effectiveTimeoutMs =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? timeoutMs
      : path.includes('/health')
        ? DEFAULT_HEALTH_TIMEOUT_MS
        : DEFAULT_API_TIMEOUT_MS;

  const { signal, cleanup } = createRequestSignal(
    callerSignal,
    effectiveTimeoutMs
  );

  try {
    const res = await fetch(target.url, {
      ...fetchInit,
      headers,
      signal,
    });

    // If an `/api/*` route returns HTML (e.g., GitHub Pages custom-domain 404/SPA fallback
    // or an auth-gated redirect proxy page), treat it as no JSON API backend available.
    if (target.isApiRoute) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        if (target.mode === 'same-origin' && target.hostingEnv !== 'development') {
          sameOriginHtmlFallbackDetected = true;
        }
        throw new StaticHostNoBackendError(
          target.mode === 'remote'
            ? 'Remote backend returned an HTML page instead of JSON (check that the server URL is publicly accessible and not behind a login proxy).'
            : 'This deployment returned an HTML fallback instead of a JSON API response; switching to offline-first mode.',
          target.hostingEnv
        );
      }
    }

    return res;
  } finally {
    cleanup();
  }
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
