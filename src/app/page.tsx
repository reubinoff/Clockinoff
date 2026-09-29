import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function IndexPage(): Promise<never> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  redirect(user ? "/app" : "/login");
}
