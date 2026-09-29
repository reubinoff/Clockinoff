import { NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/server/http";
import { startTimer, type StartTimerInput } from "@/server/services/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    let body: StartTimerInput = {};
    if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
      body = await readJson<StartTimerInput>(req);
    }
    const entry = await startTimer(user.id, body ?? {});
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
