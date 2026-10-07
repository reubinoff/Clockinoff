import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminUserDetail from "@/components/admin/AdminUserDetail";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/app");
  const { id } = await params;
  return <AdminUserDetail userId={id} actorId={user.id} timezone={user.timezone} />;
}
