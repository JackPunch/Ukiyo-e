import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateImageTaskResponse,
  TaskListResponse,
  TaskStatusResponse,
} from "@ukiyo-e/shared";
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

export function useTaskStatus(taskId: number | null) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => apiFetch<TaskStatusResponse>(`/tasks/${taskId}`),
    enabled: taskId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 2_000;
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiFetch<CreateImageTaskResponse>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", "history"] });
      void queryClient.invalidateQueries({ queryKey: ["points", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useTaskHistory() {
  return useQuery({
    queryKey: ["tasks", "history"],
    queryFn: () => apiFetch<TaskListResponse>("/tasks?limit=20&offset=0"),
    refetchInterval: 5_000,
  });
}
