import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteEntry, updateEntry, type UpdateEntryInput } from "@/server/services/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<UpdateEntryInput>(req);
    const entry = await updateEntry(user.id, params.id, body);
    return ok(entry);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    await deleteEntry(user.id, params.id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
