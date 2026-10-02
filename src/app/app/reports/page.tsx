import { cookies } from "next/headers";
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session";
import ReportsSummary from "@/components/reports/ReportsSummary";

export const dynamic = "force-dynamic";

// #56 Quiet Pulse Summary v1 (PRODUCT LOCKED per attached brief).
//
// Scope on this page:
//   1. Total hours over the selected range (Quiet Pulse hours voice).
//   2. Bar chart — hours per day, empty days = zero baseline (never gaps).
//   3. Group-by-Project list + matching donut, center total.
//   4. Link into the existing /api/export CSV / PDF flow for the same range.
//
// Explicitly out of scope: Detailed / Weekly / Shared tabs, Team filter,
// Apply Filter mega-bar, Rounding, Show estimate, Create invoice, Share
// chrome. The brief treats those as a separate multi-PR epic.
//
// Data path (per brief): prefer client aggregation of the existing entries
// API instead of adding a new report endpoint. The client component pages
// /api/entries with ?from / ?to and feeds the rows to src/lib/report.ts.
// No new API, no cross-account surface — session middleware on /app and
// the entries route already keep this own-user only.
export default async function ReportsPage(): Promise<JSX.Element> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(sid);
  // Belt-and-braces — the /app layout already redirects when unauth'd, but
  // the server render still needs a session user to pass the timezone to
  // the client. If we somehow render without one, fall back to an empty
  // shell so we don't crash the whole /app tree.
  if (!user) return <div />;
  return <ReportsSummary timezone={user.timezone} />;
}
