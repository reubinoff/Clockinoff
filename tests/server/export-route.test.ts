import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import { createEntry } from "@/server/services/entries";

// Direct route-handler coverage for the Export API (CSV + PDF). The service
// layer is covered in `tests/server/export.test.ts`; this file nails down
// the HTTP contract so the Playwright e2e specs can assert against the
// same shapes without reinventing them.
//
// The same cookie-mock pattern as batch-billed.test.ts / entries-route.test.ts
// — `cookies()` is replaced with a controllable stub so we can switch between
// unauth and authenticated calls on the SAME process.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_name: string) =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

import { GET as csvGet } from "@/app/api/export/csv/route";
import { GET as pdfGet } from "@/app/api/export/pdf/route";
import { GET as entriesGet } from "@/app/api/entries/route";

function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("export routes — negative + value contract", () => {
  beforeEach(async () => {
    await truncateAll();
    cookieValue = undefined;
  });

  it("GET /api/export/csv without a session returns 401 UNAUTHORIZED", async () => {
    const res = await csvGet(get("http://x/api/export/csv?from=2026-01-01&to=2026-01-07"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/export/pdf without a session returns 401 UNAUTHORIZED", async () => {
    const res = await pdfGet(get("http://x/api/export/pdf?from=2026-01-01&to=2026-01-07"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/entries without a session returns 401 UNAUTHORIZED", async () => {
    const res = await entriesGet(get("http://x/api/entries"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("CSV requires both from and to — missing params → 400 VALIDATION", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const noFrom = await csvGet(get("http://x/api/export/csv?to=2026-01-02"));
    expect(noFrom.status).toBe(400);
    expect((await noFrom.json()).error.code).toBe("VALIDATION");
    const noTo = await csvGet(get("http://x/api/export/csv?from=2026-01-01"));
    expect(noTo.status).toBe(400);
    expect((await noTo.json()).error.code).toBe("VALIDATION");
    const empty = await csvGet(get("http://x/api/export/csv?from=&to="));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("VALIDATION");
  });

  it("CSV rejects reversed ranges (from > to) with 400 VALIDATION", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await csvGet(
      get("http://x/api/export/csv?from=2026-02-10&to=2026-02-01"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/from/i);
  });

  it("CSV treats garbage date strings as missing (parseRangeParam → undefined)", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    // parseRangeParam returns undefined for anything that neither matches
    // YYYY-MM-DD nor parses via `new Date(v)` — the route then surfaces
    // VALIDATION "from is required" / "to is required". Pins current
    // contract so a drift to e.g. 200 + silent-ignore is caught.
    const res = await csvGet(
      get("http://x/api/export/csv?from=not-a-date&to=also-nope"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  it("PDF route mirrors the same validation contract as CSV", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const bad = await pdfGet(get("http://x/api/export/pdf?from=2026-02-10&to=2026-02-01"));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION");
    const missing = await pdfGet(get("http://x/api/export/pdf"));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("VALIDATION");
  });

  it("CSV empty range → 200 with header-only body", async () => {
    const { session } = await makeUser();
    cookieValue = session.id;
    const res = await csvGet(
      get("http://x/api/export/csv?from=2026-01-01&to=2026-01-07&timezone=UTC"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/csv");
    const text = await res.text();
    // Exactly the header row + trailing CRLF — no entries.
    expect(text).toBe(
      "date,start,end,duration,description,project,client,tags,billable,rate,amount,billed\r\n",
    );
  });

  it("CSV with real entries emits parseable rows whose values match the seed", async () => {
    const { user, session } = await makeUser();
    cookieValue = session.id;
    // Three closed entries + one row with a comma in the description so we
    // also exercise csvEscape via the route path, not just the lib tests.
    await createEntry(user.id, {
      description: "alpha work",
      start_at: "2026-04-01T09:00:00Z",
      end_at: "2026-04-01T10:00:00Z",
      billable: true,
      rate: 50,
    });
    await createEntry(user.id, {
      description: "beta, with comma",
      start_at: "2026-04-01T11:00:00Z",
      end_at: "2026-04-01T12:30:00Z",
      billable: true,
      rate: 80,
    });
    await createEntry(user.id, {
      description: "gamma unbillable",
      start_at: "2026-04-02T09:00:00Z",
      end_at: "2026-04-02T09:30:00Z",
      billable: false,
    });

    const res = await csvGet(
      get("http://x/api/export/csv?from=2026-04-01&to=2026-04-02&timezone=UTC"),
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.replace(/\r\n$/, "").split("\r\n");
    // Header + 3 data rows.
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "date,start,end,duration,description,project,client,tags,billable,rate,amount,billed",
    );

    // Parse data lines using a minimal RFC-4180-aware splitter so a comma
    // inside a quoted description doesn't split the row.
    const parseRow = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else if (c === '"') {
            inQ = false;
          } else {
            cur += c;
          }
        } else if (c === '"') {
          inQ = true;
        } else if (c === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      out.push(cur);
      return out;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map((l) => {
      const cells = parseRow(l);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i]])) as Record<string, string>;
    });

    const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
    expect(Object.keys(byDesc).sort()).toEqual(
      ["alpha work", "beta, with comma", "gamma unbillable"].sort(),
    );

    const alpha = byDesc["alpha work"];
    expect(alpha.date).toBe("2026-04-01");
    expect(alpha.duration).toBe("1.00");
    expect(alpha.billable).toBe("yes");
    expect(Number(alpha.rate)).toBe(50);
    expect(Number(alpha.amount)).toBe(50);
    expect(alpha.billed).toBe("no");

    const beta = byDesc["beta, with comma"];
    expect(beta.date).toBe("2026-04-01");
    // 1h30m → 1.50 hours in the CSV formatter.
    expect(beta.duration).toBe("1.50");
    expect(Number(beta.rate)).toBe(80);
    expect(Number(beta.amount)).toBe(120);

    const gamma = byDesc["gamma unbillable"];
    expect(gamma.date).toBe("2026-04-02");
    expect(gamma.duration).toBe("0.50");
    expect(gamma.billable).toBe("no");
    expect(gamma.rate).toBe("");
    expect(gamma.amount).toBe("");
  });

  it("PDF with real entries → 200 application/pdf + %PDF magic + non-trivial size", async () => {
    const { user, session } = await makeUser();
    cookieValue = session.id;
    await createEntry(user.id, {
      description: "pdf-value",
      start_at: "2026-05-01T09:00:00Z",
      end_at: "2026-05-01T10:00:00Z",
      billable: true,
      rate: 25,
    });
    const res = await pdfGet(
      get("http://x/api/export/pdf?from=2026-05-01&to=2026-05-01&timezone=UTC"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    // Rendering a header + totals + one row via @react-pdf/renderer always
    // produces > 1KB in practice; the service-level test asserts >500 for
    // an empty page so pick a slightly stricter bar for the row path.
    expect(bytes.byteLength).toBeGreaterThan(1024);
  });
});
