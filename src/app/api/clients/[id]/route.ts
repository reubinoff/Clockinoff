import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteClient, updateClient } from "@/server/services/clients";
import { requireUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const id = requireUuid(params.id);
    const body = await readJson<{ name?: string; archived?: boolean }>(req);
    const row = await updateClient(user.id, id, body);
    return ok(row);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const id = requireUuid(params.id);
    await deleteClient(user.id, id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
