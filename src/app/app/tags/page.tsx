import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import { listTags } from "@/server/services/tags";
import SimpleCrudPanel from "@/components/SimpleCrudPanel";

export const dynamic = "force-dynamic";

export default async function TagsPage(): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const tags = await listTags(user.id);
  return (
    <SimpleCrudPanel
      title="Tags"
      subtitle="Label entries. Names are unique per user."
      resource="tags"
      supportsArchive={false}
      initial={tags.map((t) => ({ id: t.id, name: t.name, archived: false }))}
    />
  );
}
