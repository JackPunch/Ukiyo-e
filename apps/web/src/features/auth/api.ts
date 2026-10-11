import type {
  AuthResponse,
  LoginRequest,
  PublicUser,
  RegisterRequest,
} from "@ukiyo-e/shared";
import { apiFetch, HttpError } from "../../api/client";

/** Reads the current session; `null` simply means "not signed in". */
export async function fetchSession(): Promise<PublicUser | null> {
  try {
    const { user } = await apiFetch<AuthResponse>("/auth/me");
    return user;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

async function submitCredentials(
  path: string,
  body: LoginRequest | RegisterRequest,
): Promise<PublicUser> {
  const { user } = await apiFetch<AuthResponse>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return user;
}

export function login(input: LoginRequest): Promise<PublicUser> {
  return submitCredentials("/auth/login", input);
}

export function register(input: RegisterRequest): Promise<PublicUser> {
  return submitCredentials("/auth/register", input);
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}
