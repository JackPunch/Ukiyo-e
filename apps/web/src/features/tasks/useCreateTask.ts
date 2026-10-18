import { useMutation } from "@tanstack/react-query";
import type { CreateImageTaskResponse } from "@ukiyo-e/shared";
import { apiFetch } from "../../api/client";

export interface CreateTaskInput {
  model: "nano-banana-2-1";
  input: {
    prompt: string;
    aspect_ratio: string;
    resolution: "1K" | "2K" | "4K";
    output_format: "png" | "jpg";
  };
}

export function useCreateTask() {
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiFetch<CreateImageTaskResponse>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
