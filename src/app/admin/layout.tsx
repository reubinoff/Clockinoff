import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import AuthenticatedShell from "@/components/AuthenticatedShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) redirect("/login");
  // Soft redirect. The API still returns 403. No full-page 403.
  if (user.role !== "admin") redirect("/app");
  return <AuthenticatedShell user={user}>{children}</AuthenticatedShell>;
}
