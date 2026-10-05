import { expect, request as apiRequest, test } from "@playwright/test";

// Nightly regression for the Export API end-to-end. Smoke only asserts
// 200 + content-type + magic bytes on the happy path; this spec parses
// the CSV body against seeded values and locks in the negative contract
// (unauth → 401, bad range → 400, empty range → 200 with header-only).

test.use({ timezoneId: "UTC" });

const password = "correct-horse-battery";

async function registerUser(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/);
}

interface CsvRow {
  date: string;
  start: string;
  end: string;
  duration: string;
  description: string;
  project: string;
  client: string;
  tags: string;
  billable: string;
  rate: string;
  amount: string;
  billed: string;
}

function parseCsv(csv: string): { headers: string[]; rows: CsvRow[] } {
  const text = csv.replace(/\r\n$/, "");
  const lines = text.split("\r\n");
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
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
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = parseLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])) as unknown as CsvRow;
  });
  return { headers, rows };
}

test.describe.serial("Export API (CSV + PDF) — regression", () => {
  test("CSV: seeded entries parse into rows whose values match the seed", async ({ page }) => {
    const email = `export-pos-${Date.now()}@example.com`;
    await registerUser(page, email);
    const request = page.request;
    const day = new Date().toISOString().slice(0, 10);

    // Three entries, including one description with an embedded comma to
    // exercise CSV quoting through the real route, not just the lib test.
    const seeds = [
      {
        description: "export alpha",
        start_at: `${day}T00:00:00Z`,
        end_at: `${day}T01:00:00Z`,
        billable: true,
        rate: 40,
      },
      {
        description: "export beta, comma",
        start_at: `${day}T01:00:00Z`,
        end_at: `${day}T02:30:00Z`,
        billable: true,
        rate: 50,
      },
      {
        description: "export free",
        start_at: `${day}T02:30:00Z`,
        end_at: `${day}T03:00:00Z`,
        billable: false,
      },
    ];
    for (const seed of seeds) {
      const res = await request.post("/api/entries", { data: seed });
      expect(res.status()).toBe(201);
    }

    const csvRes = await request.get(
      `/api/export/csv?from=${day}&to=${day}&timezone=UTC`,
    );
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()["content-type"] ?? "").toContain("text/csv");
    const { headers, rows } = parseCsv(await csvRes.text());
    expect(headers).toEqual([
      "date",
      "start",
      "end",
      "duration",
      "description",
      "project",
      "client",
      "tags",
      "billable",
      "rate",
      "amount",
      "billed",
    ]);
    expect(rows).toHaveLength(3);
    const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
    expect(byDesc["export alpha"].duration).toBe("1.00");
    expect(byDesc["export alpha"].billable).toBe("yes");
    expect(Number(byDesc["export alpha"].amount)).toBe(40);
    expect(byDesc["export beta, comma"].duration).toBe("1.50");
    expect(Number(byDesc["export beta, comma"].amount)).toBe(75);
    expect(byDesc["export free"].duration).toBe("0.50");
    expect(byDesc["export free"].billable).toBe("no");
    expect(byDesc["export free"].rate).toBe("");
    expect(byDesc["export free"].amount).toBe("");
  });

  test("PDF: seeded entries render > 1KB %PDF payload with the correct content-type", async ({
    page,
  }) => {
    const email = `export-pdf-${Date.now()}@example.com`;
    await registerUser(page, email);
    const request = page.request;
    const day = new Date().toISOString().slice(0, 10);
    const res = await request.post("/api/entries", {
      data: {
        description: "pdf regression",
        start_at: `${day}T00:00:00Z`,
        end_at: `${day}T00:30:00Z`,
        billable: true,
      },
    });
    expect(res.status()).toBe(201);

    const pdfRes = await request.get(
      `/api/export/pdf?from=${day}&to=${day}&timezone=UTC`,
    );
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"] ?? "").toContain("application/pdf");
    const bytes = await pdfRes.body();
    expect(bytes.slice(0, 5).toString("ascii")).toBe("%PDF-");
    // Service-level test already asserts the >500 byte floor for an empty
    // range; the row path produces > 1KB consistently via @react-pdf/renderer.
    // We deliberately do NOT parse the binary content here — pdf-parse would
    // be a new heavyweight dependency the brief tells us to avoid in CI.
    expect(bytes.byteLength).toBeGreaterThan(1024);
  });

  test("empty range: no seeded entries → CSV 200 with header-only body", async ({ page }) => {
    const email = `export-empty-${Date.now()}@example.com`;
    await registerUser(page, email);
    const request = page.request;
    const csvRes = await request.get(
      `/api/export/csv?from=2026-01-01&to=2026-01-07&timezone=UTC`,
    );
    expect(csvRes.status()).toBe(200);
    const body = await csvRes.text();
    expect(body).toBe(
      "date,start,end,duration,description,project,client,tags,billable,rate,amount,billed\r\n",
    );
  });

  test("unauthenticated callers get 401 from /api/export/csv, /api/export/pdf and /api/entries", async ({
    baseURL,
  }) => {
    // Spin up a *fresh* APIRequestContext with no cookies so the proxy guard
    // in src/proxy.ts fires. page.request would share the registered-user
    // cookie jar and defeat the test.
    const anon = await apiRequest.newContext({ baseURL });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const csv = await anon.get(`/api/export/csv?from=${today}&to=${today}`);
      expect(csv.status()).toBe(401);
      const csvBody = (await csv.json()) as { error: { code: string } };
      expect(csvBody.error.code).toBe("UNAUTHORIZED");

      const pdf = await anon.get(`/api/export/pdf?from=${today}&to=${today}`);
      expect(pdf.status()).toBe(401);

      const entries = await anon.get("/api/entries");
      expect(entries.status()).toBe(401);

      // A junk/forged session cookie must also be rejected — the proxy
      // forwards it to the route, which fails the DB lookup and the route
      // throws UNAUTHORIZED.
      const junk = await apiRequest.newContext({
        baseURL,
        extraHTTPHeaders: { cookie: "timely_session=not-a-real-session-id" },
      });
      try {
        const junkRes = await junk.get("/api/entries");
        expect(junkRes.status()).toBe(401);
      } finally {
        await junk.dispose();
      }
    } finally {
      await anon.dispose();
    }
  });

  test("invalid export range params → 400 VALIDATION", async ({ page }) => {
    const email = `export-neg-${Date.now()}@example.com`;
    await registerUser(page, email);
    const request = page.request;

    // Missing from.
    const noFrom = await request.get("/api/export/csv?to=2026-01-01");
    expect(noFrom.status()).toBe(400);
    expect(((await noFrom.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");

    // Missing to.
    const noTo = await request.get("/api/export/csv?from=2026-01-01");
    expect(noTo.status()).toBe(400);

    // from > to.
    const reversed = await request.get("/api/export/csv?from=2026-03-10&to=2026-03-01");
    expect(reversed.status()).toBe(400);
    const body = (await reversed.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toMatch(/from/i);

    // Garbage dates — parseRangeParam returns undefined → "from is required".
    const junk = await request.get("/api/export/csv?from=not-a-date&to=also-nope");
    expect(junk.status()).toBe(400);

    // Same contract for the PDF route.
    const pdfBad = await request.get("/api/export/pdf?from=2026-03-10&to=2026-03-01");
    expect(pdfBad.status()).toBe(400);
  });
});
