import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage(): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/app");
  return <AdminDashboard timezone={user.timezone} />;
}
