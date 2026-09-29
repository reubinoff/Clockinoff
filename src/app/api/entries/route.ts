import { NextResponse } from "next/server";
import { jsonError, ok, readJson, requireUser } from "@/server/http";
import {
  createEntry,
  listEntries,
  type CreateEntryInput,
  type ListEntriesFilters,
} from "@/server/services/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDateParam(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const sp = url.searchParams;
    const filters: ListEntriesFilters = {
      from: parseDateParam(sp.get("from")),
      to: parseDateParam(sp.get("to")),
      project_id: sp.get("project_id"),
      client_id: sp.get("client_id"),
      tag_id: sp.get("tag_id"),
      billable: sp.get("billable") == null ? undefined : sp.get("billable") === "true",
      include_running: sp.get("include_running") !== "false",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor"),
    };
    const result = await listEntries(user.id, filters);
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<CreateEntryInput>(req);
    const entry = await createEntry(user.id, body);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
