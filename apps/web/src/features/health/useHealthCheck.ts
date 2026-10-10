import { useMutation } from "@tanstack/react-query";
import type { HealthResponse } from "@ukiyo-e/shared";
import { apiFetch } from "../../api/client";

export function useHealthCheck() {
  return useMutation({
    mutationFn: () => apiFetch<HealthResponse>("/health"),
  });
}
