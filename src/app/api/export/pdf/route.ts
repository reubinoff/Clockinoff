import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/server/http";
import { getExportRows, validateExportRange } from "@/server/services/export";
import { renderReportPdf } from "@/server/services/pdf";
import { endOfDayExclusiveInZone, zonedIsoToUtc } from "@/lib/tz";
import { optionalUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRangeParam(v: string | null, tz: string, endOfDay = false): Date | undefined {
  if (!v) return undefined;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return endOfDay ? endOfDayExclusiveInZone(v, tz) : zonedIsoToUtc(v, tz);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const sp = url.searchParams;
    const tz = sp.get("timezone") ?? user.timezone;
    const from = parseRangeParam(sp.get("from"), tz);
    const to = parseRangeParam(sp.get("to"), tz, true);
    const { from: f, to: t } = validateExportRange({ from, to });

    const { entries, totalSeconds, totalAmount } = await getExportRows(
      user.id,
      {
        from: f,
        to: t,
        project_id: optionalUuid(sp.get("project_id"), "project_id"),
        client_id: optionalUuid(sp.get("client_id"), "client_id"),
        tag_id: optionalUuid(sp.get("tag_id"), "tag_id"),
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
    const filename = `timely-${sp.get("from") ?? "range"}-${sp.get("to") ?? "range"}.pdf`;
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
  }
}
