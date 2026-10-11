import { useMutation, useQueryClient } from "@tanstack/react-query";
import { register } from "./api";
import { sessionQueryKey } from "./useSession";

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: register,
    // Registration signs the user in, so the response is the new session.
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}
