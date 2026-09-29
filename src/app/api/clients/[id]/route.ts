import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteClient, updateClient } from "@/server/services/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<{ name?: string; archived?: boolean }>(req);
    const row = await updateClient(user.id, params.id, body);
    return ok(row);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    await deleteClient(user.id, params.id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
