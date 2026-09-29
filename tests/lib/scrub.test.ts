import { describe, expect, it } from "vitest";
import { REDACTED, redactDeep, redactString } from "@/lib/scrub";

describe("scrub / redactString", () => {
  it("scrubs postgres:// and postgresql:// URLs", () => {
    expect(redactString("dsn=postgres://u:p@h/x extra")).toBe("dsn=[REDACTED_DATABASE_URL] extra");
    expect(redactString("dsn=postgresql://u:p@h/x extra")).toBe(
      "dsn=[REDACTED_DATABASE_URL] extra",
    );
  });

  it("scrubs inline password JSON snippets", () => {
    expect(redactString('body {"password":"hunter2"} sent')).toBe(
      'body {"password":"[REDACTED]"} sent',
    );
  });

  it("scrubs Bearer tokens", () => {
    expect(redactString("Authorization: Bearer abc.def-ghi_jkl~m=")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("scrubs timely_session cookie values", () => {
    expect(redactString("cookie=timely_session=abc123def; other=1")).toBe(
      "cookie=timely_session=[REDACTED]; other=1",
    );
  });

  it("returns non-secret strings unchanged", () => {
    expect(redactString("just a plain log line")).toBe("just a plain log line");
  });
});

describe("scrub / redactDeep — deep object redaction (#37 residual)", () => {
  const isSensitiveKey = (k: string): boolean =>
    /password|authorization|cookie|session|secret|token|database.?url|connection.?string/i.test(k);

  it("deep-redacts a plain object passed to console.log-style call", () => {
    // The bug: `console.log({ password, cookie })` used to emit raw values
    // because wrapConsole only scrubbed strings/Errors. Now it recurses.
    const scrubbed = redactDeep(
      { password: "hunter2", cookie: "session=abc", route: "/api/timer" },
      { isSensitiveKey },
    );
    expect(scrubbed).toEqual({
      password: REDACTED,
      cookie: REDACTED,
      route: "/api/timer",
    });
  });

  it("redacts sensitive keys inside nested arrays and objects", () => {
    const scrubbed = redactDeep(
      {
        items: [
          { authorization: "Bearer xyz" },
          { db: { connection_string: "Server=x;Password=y" } },
        ],
      },
      { isSensitiveKey },
    );
    expect(scrubbed).toEqual({
      items: [
        { authorization: REDACTED },
        { db: { connection_string: REDACTED } },
      ],
    });
  });

  it("still runs redactString on string leaves so bare URLs are caught", () => {
    const scrubbed = redactDeep(
      { note: "connect failed postgres://u:p@h/x", ok: true },
      { isSensitiveKey },
    );
    expect(scrubbed).toEqual({
      note: "connect failed [REDACTED_DATABASE_URL]",
      ok: true,
    });
  });

  it("preserves Error instances by default (console mode)", () => {
    const err = new Error("boom postgres://u:p@h/x");
    err.stack = "Error: boom postgres://u:p@h/x\n at foo";
    const out = redactDeep(err, { isSensitiveKey }) as Error;
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toBe("boom [REDACTED_DATABASE_URL]");
    expect(out.stack).toContain("[REDACTED_DATABASE_URL]");
    expect(out.stack).not.toContain("u:p@h");
  });

  it("uses custom onError callback when provided (logger mode → plain object)", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n at foo";
    const out = redactDeep(err, {
      isSensitiveKey,
      onError: (e) => ({ name: e.name, message: e.message, stack: e.stack }),
    }) as { name: string; message: string; stack: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
    expect(out.stack).toContain("at foo");
  });

  it("returns non-plain objects (Buffer, Date) untouched by default", () => {
    const buf = Buffer.from("hello");
    const date = new Date("2026-01-01T00:00:00Z");
    const outBuf = redactDeep(buf, { isSensitiveKey });
    const outDate = redactDeep(date, { isSensitiveKey });
    expect(outBuf).toBe(buf);
    expect(outDate).toBe(date);
  });

  it("routes unknown types through onOther when provided (logger mode → String())", () => {
    const sym = Symbol("s");
    const out = redactDeep(sym, { isSensitiveKey, onOther: (v) => String(v) });
    expect(out).toBe("Symbol(s)");
  });

  it("passes through null / undefined / primitives", () => {
    expect(redactDeep(null, { isSensitiveKey })).toBeNull();
    expect(redactDeep(undefined, { isSensitiveKey })).toBeUndefined();
    expect(redactDeep(42, { isSensitiveKey })).toBe(42);
    expect(redactDeep(true, { isSensitiveKey })).toBe(true);
    expect(redactDeep(1n, { isSensitiveKey })).toBe(1n);
  });

  it("truncates beyond maxDepth", () => {
    let deep: unknown = { leaf: true };
    for (let i = 0; i < 10; i += 1) deep = { next: deep };
    const out = JSON.stringify(redactDeep(deep, { isSensitiveKey, maxDepth: 4 }));
    expect(out).toContain("[TRUNCATED]");
  });

  it("guards against cyclic object references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = redactDeep(a, { isSensitiveKey }) as Record<string, unknown>;
    expect(out.name).toBe("a");
    expect(out.self).toBe("[CIRCULAR]");
  });

  it("guards against cyclic array references", () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    const out = redactDeep(arr, { isSensitiveKey }) as unknown[];
    expect(out[0]).toBe(1);
    expect(out[2]).toBe("[CIRCULAR]");
  });
});

describe("scrub / SENSITIVE key matchers (#37) — attribute-key coverage", () => {
  const isSensitiveKey = (k: string): boolean =>
    /database.?url|connection.?string/i.test(k);

  it.each([
    "database_url",
    "DATABASE_URL",
    "database.url",
    "databaseUrl",
    "connection_string",
    "connectionString",
    "db.connection_string",
    "postgres.connection.string",
  ])("matches attribute key %s regardless of value shape", (key) => {
    // Value is NOT URL-shaped — the string scrub alone wouldn't catch this;
    // only the key matcher does.
    const scrubbed = redactDeep({ [key]: "Server=x;User Id=y;Password=z" }, { isSensitiveKey });
    expect((scrubbed as Record<string, unknown>)[key]).toBe(REDACTED);
  });
});
