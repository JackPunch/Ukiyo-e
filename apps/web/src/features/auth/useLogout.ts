import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "./api";
import { sessionQueryKey } from "./useSession";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    // Logout only clears the cookie, so the local cache is cleared as well.
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}
