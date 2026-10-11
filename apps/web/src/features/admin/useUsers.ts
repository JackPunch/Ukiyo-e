import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listUsers } from "./api";

export interface UserListParams {
  limit: number;
  offset: number;
  /** Empty string means "no keyword"; it is not forwarded to the API. */
  q: string;
}

/** Every admin user list query keys under ["admin","users"] for easy invalidation. */
export const adminUsersQueryKey = (params: UserListParams) =>
  ["admin", "users", params] as const;

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: adminUsersQueryKey(params),
    queryFn: () => listUsers({ ...params, q: params.q || undefined }),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}
