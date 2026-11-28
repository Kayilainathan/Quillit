export type HostingEnvironment =
  | 'development'
  | 'production-fullstack'
  | 'static-github-pages'
  | 'static-other';

export interface ApiTargetResolution {
  url: string;
  mode: 'same-origin' | 'remote' | 'offline-static';
  baseUrl: string;
  hostingEnv: HostingEnvironment;
  isApiRoute: boolean;
  reason?: string;
}

const PLACEHOLDER_HOST_RE =
  /^(my_app_url|your-api\.example\.com|your-quillit-server\.run\.app|example\.com)$/i;

const STATIC_ONLY_HOST_SUFFIXES = [
  '.github.io',
  '.gitlab.io',
  '.surge.sh',
  '.bitbucket.io',
] as const;

const STATIC_HOST_SUFFIXES = [
  ...STATIC_ONLY_HOST_SUFFIXES,
  '.pages.dev',
] as const;

/**
 * Classifies the runtime hosting environment from hostname + protocol so `apiFetch`
 * cleanly distinguishes local dev, full-stack production servers (Cloud Run, Render,
 * Railway, Fly, custom Node hosts), and static-only page hosts (GitHub Pages, etc.).
 */
export function detectHostingEnvironment(
  hostname?: string,
  protocol?: string
): HostingEnvironment {
  const proto = (
    typeof protocol === 'string'
      ? protocol
      : typeof window !== 'undefined'
        ? window.location.protocol
        : ''
  ).toLowerCase();

  if (proto === 'file:') {
    return 'static-other';
  }

  const host = (
    typeof hostname === 'string'
      ? hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  )
    .trim()
    .toLowerCase();

  if (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  ) {
    return 'development';
  }

  if (host.endsWith('.github.io')) {
    return 'static-github-pages';
  }

  if (STATIC_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return 'static-other';
  }

  return 'production-fullstack';
}

/**
 * Checks whether the app is running on a static-only GitHub Pages origin
 * (`*.github.io`), which cannot run Express `/api/*` routes locally.
 */
export function isGitHubPagesHost(hostname?: string): boolean {
  return detectHostingEnvironment(hostname) === 'static-github-pages';
}

/**
 * True when running on any known static-only host (`*.github.io`, `*.gitlab.io`,
 * `*.pages.dev`, `*.surge.sh`, `*.bitbucket.io`, or `file:`).
 */
export function isStaticHostingEnvironment(
  hostname?: string,
  protocol?: string
): boolean {
  const env = detectHostingEnvironment(hostname, protocol);
  return env === 'static-github-pages' || env === 'static-other';
}

/**
 * Detects AI Studio private preview URLs (`ais-pre-*.run.app` / `ais-dev-*.run.app`).
 * Those URLs sit behind an authenticated cookie-check 302 proxy and cannot serve
 * cross-origin CORS requests from an external GitHub Pages site.
 */
export function isAiStudioPreviewUrl(raw: string | undefined | null): boolean {
  const normalized = normalizeApiBaseUrl(raw);
  if (!normalized) return false;
  try {
    const { hostname } = new URL(normalized);
    return /^ais-(pre|dev)-.+\.run\.app$/i.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Normalizes a configured API base URL so common config mistakes never break calls:
 * - Trims whitespace and trailing slashes
 * - Rejects placeholder values (e.g., `MY_APP_URL`, `your-api.example.com`)
 * - Rejects static-only hosts (`*.github.io`, `*.gitlab.io`, `*.surge.sh`) that cannot run Express APIs
 * - Auto-prepends `https://` when protocol is omitted (`http://` for localhost/127.0.0.1)
 * - Strips accidental trailing `/api` or `/api/*` paths so `${base}/api/evaluate` never becomes `/api/api/evaluate`
 * - Rejects non-http(s) protocols (e.g., `javascript:`, `data:`)
 */
export function normalizeApiBaseUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let candidate = raw.trim();
  if (!candidate) return '';

  // Reject unreplaced template placeholders early
  if (
    /^(MY_APP_URL|YOUR_.*|<.*>|\$\{\{.*\}\})$/i.test(candidate) ||
    candidate.includes('your-api.example.com') ||
    candidate.includes('your-quillit-server.run.app')
  ) {
    return '';
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(
      candidate
    );
    candidate = `${isLocal ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    const hostLower = parsed.hostname.toLowerCase();
    if (!hostLower || PLACEHOLDER_HOST_RE.test(hostLower)) {
      return '';
    }
    // Never accept a static-only pages domain as an Express API target
    if (STATIC_ONLY_HOST_SUFFIXES.some((suffix) => hostLower.endsWith(suffix))) {
      return '';
    }

    const cleanPath = parsed.pathname
      .replace(/\/+$/, '')
      .replace(/\/api(\/.*)?$/i, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

/**
 * Pure, deterministic API route resolver used by `apiFetch`.
 * Priority:
 * 1. Runtime user-configured backend URL (Settings / `?apiBase=...`)
 * 2. Build-time `VITE_API_BASE_URL`
 * 3. Same-origin `/api/*` when running on dev or full-stack production hosting
 * 4. Fail-fast `'offline-static'` fallback when on a static host (or detected HTML-fallback host) with no backend URL
 */
export function resolveApiTarget(
  path: string,
  options: {
    runtimeBaseUrl?: string | null;
    envBaseUrl?: string | null;
    hostname?: string;
    protocol?: string;
    sameOriginHtmlFallbackDetected?: boolean;
  } = {}
): ApiTargetResolution {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isApiRoute =
    normalizedPath === '/api' || normalizedPath.startsWith('/api/');
  const hostingEnv = detectHostingEnvironment(
    options.hostname,
    options.protocol
  );

  const remoteBase =
    normalizeApiBaseUrl(options.runtimeBaseUrl) ||
    normalizeApiBaseUrl(options.envBaseUrl);

  if (remoteBase) {
    return {
      url: `${remoteBase}${normalizedPath}`,
      mode: 'remote',
      baseUrl: remoteBase,
      hostingEnv,
      isApiRoute,
    };
  }

  const isKnownStatic =
    hostingEnv === 'static-github-pages' || hostingEnv === 'static-other';

  if (isApiRoute && (isKnownStatic || options.sameOriginHtmlFallbackDetected)) {
    return {
      url: normalizedPath,
      mode: 'offline-static',
      baseUrl: '',
      hostingEnv,
      isApiRoute,
      reason: isKnownStatic
        ? 'Static GitHub Pages build has no AI backend server configured (set VITE_API_BASE_URL or connect a server URL in Settings).'
        : 'Current host returned an HTML fallback instead of a JSON API response; operating in offline-first mode until a backend server URL is configured.',
    };
  }

  return {
    url: normalizedPath,
    mode: 'same-origin',
    baseUrl: '',
    hostingEnv,
    isApiRoute,
  };
}
