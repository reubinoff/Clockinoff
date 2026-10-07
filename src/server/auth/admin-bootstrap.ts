import { eq } from "drizzle-orm";
import { asUserRole, initialRoleForEmail, isBootstrapAdminEmail, type UserRole } from "@/lib/admin-role";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

// One-way promote. Called after a successful credential check so an
// address added to ADMIN_EMAILS becomes admin on the next sign-in
// without a separate script run. Never demotes.
export async function applyBootstrapRole(
  userId: string,
  email: string,
  role: string,
): Promise<UserRole> {
  const current = asUserRole(role);
  if (current === "admin") return "admin";
  if (!isBootstrapAdminEmail(email)) return "user";
  await getDb().update(users).set({ role: "admin" }).where(eq(users.id, userId));
  return "admin";
}

export { initialRoleForEmail };
