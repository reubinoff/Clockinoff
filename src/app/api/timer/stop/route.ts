import { jsonError, ok, requireUser } from "@/server/http";
import { stopTimer } from "@/server/services/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const user = await requireUser();
    const entry = await stopTimer(user.id);
    return ok(entry);
  } catch (err) {
    return jsonError(err);
  }
}
