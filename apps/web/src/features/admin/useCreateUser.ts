import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser } from "./api";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    // Refresh every cached page so the new user shows up immediately.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
