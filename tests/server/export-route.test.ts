import { beforeEach, describe, expect, it, vi } from "vitest";
import { truncateAll } from "../setup";
import { makeUser } from "../helpers";
import {
  EXPORT_RATE_LIMIT,
  beginExport,
  resetExportLimit,
} from "@/server/services/export-limit";
import type { SessionUser } from "@/server/auth/session";

let cookieValue: string | undefined;
let currentUser: SessionUser;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue === undefined ? undefined : { name: "timely_session", value: cookieValue },
  }),
}));

import { GET as exportCsvGet } from "@/app/api/export/csv/route";
import { GET as exportPdfGet } from "@/app/api/export/pdf/route";

function getReq(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/export/* security caps (#147)", () => {
  beforeEach(async () => {
    await truncateAll();
    resetExportLimit();
    const created = await makeUser(`export-${Date.now()}@ex.com`);
    cookieValue = created.session.id;
    currentUser = created.user;
  });

  it("returns 400 when the range exceeds 366 days", async () => {
    const res = await exportCsvGet(
      getReq("http://x/api/export/csv?from=2024-01-01&to=2025-01-02"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/366 days/);
  });

  it("returns 400 (never 500) when from contains CR/LF", async () => {
    const res = await exportCsvGet(
      getReq("http://x/api/export/csv?from=2026-01-01%0D%0A&to=2026-01-08"),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("uses ISO dates from the validated range in the filename", async () => {
    const res = await exportCsvGet(
      getReq("http://x/api/export/csv?from=2026-01-01&to=2026-01-08"),
    );
    expect(res.status).toBe(200);
    const disp = res.headers.get("content-disposition") ?? "";
    expect(disp).toMatch(/filename="timely-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(disp).not.toMatch(/[\r\n]/);
  });

  it("returns 429 with Retry-After when an export is already in flight", async () => {
    expect(beginExport(currentUser.id).ok).toBe(true);
    const res = await exportCsvGet(
      getReq("http://x/api/export/csv?from=2026-01-01&to=2026-01-08"),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
  });

  it("returns 429 with Retry-After after the per-window export budget", async () => {
    for (let i = 0; i < EXPORT_RATE_LIMIT.maxPerWindow; i += 1) {
      const res = await exportCsvGet(
        getReq("http://x/api/export/csv?from=2026-01-01&to=2026-01-08"),
      );
      expect(res.status).toBe(200);
    }
    const blocked = await exportCsvGet(
      getReq("http://x/api/export/csv?from=2026-01-01&to=2026-01-08"),
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
  });

  it("applies the same in-flight limit to PDF", async () => {
    expect(beginExport(currentUser.id).ok).toBe(true);
    const res = await exportPdfGet(
      getReq("http://x/api/export/pdf?from=2026-01-01&to=2026-01-08"),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});
