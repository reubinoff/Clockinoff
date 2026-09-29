import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { deleteProject, updateProject, type UpdateProjectInput } from "@/server/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<UpdateProjectInput>(req);
    const row = await updateProject(user.id, params.id, body);
    return ok(row);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    await deleteProject(user.id, params.id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
