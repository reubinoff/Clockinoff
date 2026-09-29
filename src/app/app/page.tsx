import EntryList from "@/components/EntryList";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import { listEntries } from "@/server/services/entries";
import { listProjects } from "@/server/services/projects";
import { listTags } from "@/server/services/tags";

export const dynamic = "force-dynamic";

export default async function AppHomePage(): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const [{ entries }, projects, tags] = await Promise.all([
    listEntries(user.id, { limit: 50, include_running: false }),
    listProjects(user.id),
    listTags(user.id),
  ]);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Entries</h2>
        <p className="text-sm text-muted">Your recent time entries.</p>
      </div>
      <EntryList
        initial={entries}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
        timezone={user.timezone}
      />
    </section>
  );
}
