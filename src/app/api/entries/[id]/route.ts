import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteEntry, updateEntry, type UpdateEntryInput } from "@/server/services/entries";
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
    const body = await readJson<UpdateEntryInput>(req);
    const entry = await updateEntry(user.id, id, body);
    return ok(entry);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const id = requireUuid(params.id);
    await deleteEntry(user.id, id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
