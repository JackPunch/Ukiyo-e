const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/**
 * Thin wrapper around `fetch` for talking to the Fastify API.
 * During development Vite proxies `/api` to the API (see `vite.config.ts`).
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`请求失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}
