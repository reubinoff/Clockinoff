import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteTag, updateTag } from "@/server/services/tags";
import { requireUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const { id: raw } = await params;
    const id = requireUuid(raw);
    const body = await readJson<{ name: string }>(req);
    const row = await updateTag(user.id, id, body);
    return ok(row);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const { id: raw } = await params;
    const id = requireUuid(raw);
    await deleteTag(user.id, id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
