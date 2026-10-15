import { Suspense } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser, sessionCreatedWithin } from "@/server/auth/session";
import { SELF_DELETE_REAUTH_MS } from "@/server/auth/self-delete";
import { getSignInMethods } from "@/server/auth/google";
import AccountSettings from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function AccountPage(): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const methods = await getSignInMethods(user.id);
  const sessionFresh = await sessionCreatedWithin(sid, SELF_DELETE_REAUTH_MS);
  return (
    <Suspense fallback={<div />}>
      <AccountSettings
        email={user.email}
        methods={methods}
        isAdmin={user.role === "admin"}
        sessionFresh={sessionFresh}
      />
    </Suspense>
  );
}
