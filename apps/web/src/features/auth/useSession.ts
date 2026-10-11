import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "./api";

export const sessionQueryKey = ["auth", "me"] as const;

/**
 * The single source of truth for "who is signed in". `GET /auth/me` is the only
 * place session state is read from, and every auth mutation writes this key
 * (see `useLogin` / `useRegister` / `useLogout`).
 */
export function useSession() {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    // A 401 is an answer, not a failure worth retrying.
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
  };
}
