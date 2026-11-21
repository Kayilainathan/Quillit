/**
 * Resolves the API URL for backend routes so local dev uses relative `/api/*`
 * while static GitHub Pages deployments can optionally target a hosted API
 * origin via `VITE_API_BASE_URL` (or gracefully fall back locally when unset).
 */
export function getApiBaseUrl(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL)
      : '';
  return raw.trim().replace(/\/+$/, '');
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
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
