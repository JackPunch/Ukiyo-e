import type {
  AdminAdjustPointsRequest,
  AdminCreateUserRequest,
  AdminUserListResponse,
  PublicUser,
} from "@ukiyo-e/shared";
import { apiFetch } from "../../api/client";

/** One page of users, optionally filtered by a keyword (docs/api.md §4.7). */
export function listUsers(params: {
  limit: number;
  offset: number;
  q?: string;
}): Promise<AdminUserListResponse> {
  const search = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.q) search.set("q", params.q);

  return apiFetch<AdminUserListResponse>(`/admin/users?${search.toString()}`);
}

/** Admin-side account creation; the new user is not signed in (docs/api.md §4.6). */
export async function createUser(
  input: AdminCreateUserRequest,
): Promise<PublicUser> {
  const { user } = await apiFetch<{ user: PublicUser }>("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return user;
}

export async function adjustUserPoints(
  userId: number,
  input: AdminAdjustPointsRequest,
): Promise<void> {
  await apiFetch(`/admin/users/${userId}/points`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
