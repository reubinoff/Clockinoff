import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import { listProjects } from "@/server/services/projects";
import { listClients } from "@/server/services/clients";
import ProjectsPanel from "@/components/ProjectsPanel";

export const dynamic = "force-dynamic";

export default async function ProjectsPage(): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const [projects, clients] = await Promise.all([
    listProjects(user.id, { archived: true }),
    listClients(user.id, { archived: true }),
  ]);
  return (
    <ProjectsPanel
      initial={projects.map((p) => ({
        id: p.id,
        name: p.name,
        client_id: p.clientId,
        default_billable: p.defaultBillable,
        default_rate: p.defaultRate,
        archived: p.archivedAt !== null,
      }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name, archived: c.archivedAt !== null }))}
    />
  );
}
