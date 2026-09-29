import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing, logger } from "@/lib/logger";

const { redactString, redactValue } = __testing;

describe("logger / redactString", () => {
  it("scrubs a bare postgres:// URL", () => {
    expect(
      redactString("connect failed for postgres://timely:s3cret@db.example.com:5432/timely?sslmode=require"),
    ).toBe("connect failed for [REDACTED_DATABASE_URL]");
  });

  it("scrubs a postgresql:// URL variant", () => {
    expect(redactString("dsn=postgresql://u:p@h/x extra")).toBe("dsn=[REDACTED_DATABASE_URL] extra");
  });

  it("scrubs inline password JSON snippets", () => {
    expect(redactString('body {"password":"hunter2"} sent')).toBe('body {"password":"[REDACTED]"} sent');
  });

  it("scrubs Bearer tokens", () => {
    expect(redactString("Authorization: Bearer abc.def-ghi_jkl~m=")).toBe("Authorization: Bearer [REDACTED]");
  });

  it("scrubs timely_session cookie values", () => {
    expect(redactString("cookie=timely_session=abc123def; other=1")).toBe(
      "cookie=timely_session=[REDACTED]; other=1",
    );
  });

  it("passes through strings that hold no secret", () => {
    expect(redactString("plain log message")).toBe("plain log message");
  });
});

describe("logger / redactValue", () => {
  it("redacts sensitive keys wholesale", () => {
    expect(
      redactValue({
        password: "hunter2",
        Authorization: "Bearer x",
        cookie: "y",
        session: "z",
        secret: "s",
        token: "t",
        DATABASE_URL: "postgres://u:p@h/x",
        keep: "visible",
      }),
    ).toEqual({
      password: "[REDACTED]",
      Authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      session: "[REDACTED]",
      secret: "[REDACTED]",
      token: "[REDACTED]",
      DATABASE_URL: "[REDACTED]",
      keep: "visible",
    });
  });

  // #37: attribute key matchers must cover DB DSN shapes even when the value
  // isn't URL-shaped (e.g. ODBC-style connection strings).
  it.each([
    "database_url",
    "DATABASE_URL",
    "databaseUrl",
    "database.url",
    "connection_string",
    "connectionString",
    "db.connection_string",
    "postgres.connection.string",
  ])("redacts DB DSN attribute key %s regardless of value shape", (key) => {
    const out = redactValue({ [key]: "Server=x;User Id=y;Password=z" }) as Record<string, unknown>;
    expect(out[key]).toBe("[REDACTED]");
  });

  it("recursively redacts arrays and nested objects", () => {
    expect(
      redactValue({
        items: [
          { note: "postgres://u:p@h/x" },
          { password: "shh" },
          "raw postgres://a:b@c/d",
        ],
      }),
    ).toEqual({
      items: [
        { note: "[REDACTED_DATABASE_URL]" },
        { password: "[REDACTED]" },
        "raw [REDACTED_DATABASE_URL]",
      ],
    });
  });

  it("passes through primitives untouched", () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });

  it("stringifies unknown types (e.g. symbol)", () => {
    expect(redactValue(Symbol("s"))).toBe("Symbol(s)");
  });

  it("truncates beyond max depth", () => {
    let deep: unknown = { leaf: true };
    for (let i = 0; i < 10; i += 1) {
      deep = { next: deep };
    }
    const out = JSON.stringify(redactValue(deep));
    expect(out).toContain("[TRUNCATED]");
  });

  it("expands Error instances with redacted stack/message", () => {
    const err = new Error("connect failed postgres://u:p@h/x");
    err.stack = "Error: connect failed postgres://u:p@h/x\n at foo";
    const out = redactValue(err) as { name: string; message: string; stack: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("connect failed [REDACTED_DATABASE_URL]");
    expect(out.stack).toContain("[REDACTED_DATABASE_URL]");
  });

  it("handles Errors with no stack", () => {
    const err = new Error("boom");
    err.stack = undefined;
    const out = redactValue(err) as { stack?: unknown };
    expect(out.stack).toBeUndefined();
  });
});

describe("logger / emit routing", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logger.info routes to console.log with redacted body", () => {
    logger.info("hello postgres://u:p@h/x", { note: "ok" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain("[REDACTED_DATABASE_URL]");
    expect(line).toContain('"note":"ok"');
  });

  it("logger.warn routes to console.warn", () => {
    logger.warn("careful");
    expect(warnSpy).toHaveBeenCalledWith("careful");
  });

  it("logger.error routes to console.error and redacts extras", () => {
    logger.error("nope", { password: "secret" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('"password":"[REDACTED]"');
    expect(line).not.toContain("secret");
  });

  it("logger.exception folds the error into the payload", () => {
    logger.exception("api boom", new Error("db down postgres://u:p@h/x"));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain("api boom");
    expect(line).toContain("[REDACTED_DATABASE_URL]");
  });

  it("logger.exception merges caller-provided extras", () => {
    logger.exception("api boom", new Error("x"), { route: "/api/timer" });
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('"route":"/api/timer"');
    expect(line).toContain('"error"');
  });
});
