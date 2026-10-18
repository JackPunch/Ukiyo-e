import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustUserPoints } from "./api";

export function useAdjustPoints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      amount,
      note,
    }: {
      userId: number;
      amount: number;
      note?: string;
    }) => adjustUserPoints(userId, { amount, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
