import { jsonError, noContent, ok, requireAdmin } from "@/server/http";
import { requireUuid } from "@/lib/uuid";
import { getAdminUser, removeAdminUser } from "@/server/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    await requireAdmin();
    const { id: raw } = await params;
    const detail = await getAdminUser(requireUuid(raw));
    return ok(detail);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const actor = await requireAdmin();
    const { id: raw } = await params;
    await removeAdminUser(actor.id, requireUuid(raw));
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
