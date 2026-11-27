/**
 * Normalizes a configured API base URL so common config mistakes never break calls:
 * - Trims whitespace and trailing slashes
 * - Auto-prepends `https://` when protocol is omitted (`http://` for localhost/127.0.0.1)
 * - Strips accidental trailing `/api` so `${base}/api/evaluate` never becomes `/api/api/evaluate`
 * - Rejects non-http(s) protocols (e.g., `javascript:`, `data:`)
 */
export function normalizeApiBaseUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let candidate = raw.trim();
  if (!candidate) return '';

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(candidate);
    candidate = `${isLocal ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    const cleanPath = parsed.pathname
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

/**
 * Checks whether the app is running on a static-only GitHub Pages origin
 * (which cannot run Express `/api/*` routes locally unless a remote API base URL is set).
 */
export function isGitHubPagesHost(hostname?: string): boolean {
  const host =
    typeof hostname === 'string'
      ? hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : '';
  return host.toLowerCase().endsWith('.github.io');
}
