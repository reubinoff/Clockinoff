import { jsonError, noContent, ok, readJson, requireUser } from "@/server/http";
import { discardRunning, getRunningEntry, patchRunning } from "@/server/services/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const running = await getRunningEntry(user.id);
    return ok(running);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<Parameters<typeof patchRunning>[1]>(req);
    const running = await patchRunning(user.id, body);
    return ok(running);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const user = await requireUser();
    await discardRunning(user.id);
    return noContent();
  } catch (err) {
    return jsonError(err);
  }
}
