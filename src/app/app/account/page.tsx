import { Suspense } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import { getSignInMethods } from "@/server/auth/google";
import AccountSettings from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function AccountPage(): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const methods = await getSignInMethods(user.id);
  return (
    <Suspense fallback={<div />}>
      <AccountSettings email={user.email} methods={methods} />
    </Suspense>
  );
}
