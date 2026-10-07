import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminUsers from "@/components/admin/AdminUsers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage(): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/app");
  return <AdminUsers actorId={user.id} timezone={user.timezone} />;
}
