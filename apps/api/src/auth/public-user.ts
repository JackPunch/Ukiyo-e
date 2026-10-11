import type { PublicUser } from "@ukiyo-e/shared";
import type { UserRow } from "../db/queries/users";

/**
 * Database row (snake_case) to public representation (camelCase). Keeping this
 * in one place is what guarantees `password_hash` never reaches a response.
 */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    pointsBalance: row.points_balance,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}
