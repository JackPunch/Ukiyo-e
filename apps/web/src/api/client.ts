import type { ErrorResponse } from "@ukiyo-e/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/**
 * An HTTP failure that keeps the status code and the API's error envelope, so
 * callers can branch on `401` / `409` instead of matching message text.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly body?: ErrorResponse;

  constructor(status: number, message: string, body?: ErrorResponse) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** Turns any thrown value into something safe to show the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    return error.body?.error.message ?? error.message;
  }
  return error instanceof Error ? error.message : "请求失败";
}

async function readErrorBody(
  response: Response,
): Promise<ErrorResponse | undefined> {
  try {
    return (await response.json()) as ErrorResponse;
  } catch {
    return undefined;
  }
}

/**
 * Thin wrapper around `fetch` for talking to the Fastify API.
 * During development Vite proxies `/api` to the API (see `vite.config.ts`) and
 * in production nginx does, so both are same-origin: the session cookie travels
 * with no CORS setup.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only declare a JSON body when one is actually sent: Fastify rejects a
  // request that sets `Content-Type: application/json` with an empty body
  // (which is exactly what a body-less POST such as logout is).
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      `请求失败：${response.status} ${response.statusText}`,
      await readErrorBody(response),
    );
  }

  // 204 (logout) has no body to parse. Still drain it so the response stream is
  // closed before the caller navigates away.
  if (response.status === 204) {
    await response.text();
    return undefined as T;
  }

  return (await response.json()) as T;
}
