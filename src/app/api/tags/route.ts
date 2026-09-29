import { NextResponse } from "next/server";
import { jsonError, ok, readJson, requireUser } from "@/server/http";
import { createTag, listTags } from "@/server/services/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const rows = await listTags(user.id);
    return ok({ tags: rows });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<{ name: string }>(req);
    const row = await createTag(user.id, body);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
