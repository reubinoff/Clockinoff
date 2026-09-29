import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import { listClients } from "@/server/services/clients";
import SimpleCrudPanel from "@/components/SimpleCrudPanel";

export const dynamic = "force-dynamic";

export default async function ClientsPage(): Promise<JSX.Element> {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  if (!user) return <div />;
  const clients = await listClients(user.id, { archived: true });
  return (
    <SimpleCrudPanel
      title="Clients"
      subtitle="Attach clients to projects."
      resource="clients"
      supportsArchive
      initial={clients.map((c) => ({
        id: c.id,
        name: c.name,
        archived: c.archivedAt !== null,
      }))}
    />
  );
}
