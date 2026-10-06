import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/server/http";
import {
  exportDownloadFilename,
  getExportRows,
  parseExportBound,
  validateExportRange,
} from "@/server/services/export";
import { beginExport, endExport } from "@/server/services/export-limit";
import { renderReportPdf } from "@/server/services/pdf";
import { optionalUuid } from "@/lib/uuid";
import { errors } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  let exportUserId: string | null = null;
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const sp = url.searchParams;
    const tz = sp.get("timezone") ?? user.timezone;
    const from = parseExportBound(sp.get("from"), tz);
    const to = parseExportBound(sp.get("to"), tz, true);
    const { from: f, to: t } = validateExportRange({ from, to });
    const project_id = optionalUuid(sp.get("project_id"), "project_id");
    const client_id = optionalUuid(sp.get("client_id"), "client_id");
    const tag_id = optionalUuid(sp.get("tag_id"), "tag_id");

    const gate = beginExport(user.id);
    if (!gate.ok) {
      throw errors.rateLimited(
        "Too many export requests. Please try again later.",
        gate.retryAfterSeconds,
      );
    }
    exportUserId = user.id;

    const { entries, totalSeconds, totalAmount } = await getExportRows(
      user.id,
      {
        from: f,
        to: t,
        project_id,
        client_id,
        tag_id,
        billable: sp.get("billable") == null ? undefined : sp.get("billable") === "true",
      },
      tz,
    );
    const pdf = await renderReportPdf({
      entries,
      from: f,
      to: t,
      timezone: tz,
      totalSeconds,
      totalAmount,
    });
    const filename = exportDownloadFilename(f, t, "pdf");
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  } finally {
    if (exportUserId) endExport(exportUserId);
  }
}
