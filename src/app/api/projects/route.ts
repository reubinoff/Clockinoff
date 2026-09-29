import { NextResponse } from "next/server";
import { jsonError, ok, readJson, requireUser } from "@/server/http";
import { createProject, listProjects, type CreateProjectInput } from "@/server/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const archived = url.searchParams.get("archived") === "true";
    const rows = await listProjects(user.id, { archived });
    return ok({ projects: rows });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<CreateProjectInput>(req);
    const row = await createProject(user.id, body);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
