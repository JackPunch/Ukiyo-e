import { useQuery } from "@tanstack/react-query";
import type { PointTransactionListResponse } from "@ukiyo-e/shared";
import { apiFetch } from "../../api/client";

export function usePointTransactions() {
  return useQuery({
    queryKey: ["points", "transactions"],
    queryFn: () =>
      apiFetch<PointTransactionListResponse>(
        "/points/transactions?limit=20&offset=0",
      ),
  });
}
