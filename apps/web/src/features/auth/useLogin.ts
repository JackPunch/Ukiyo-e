import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login } from "./api";
import { sessionQueryKey } from "./useSession";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    // Seed the cache with the response so the UI updates without a refetch.
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}
