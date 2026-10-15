import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { AUDIT_FORWARDED_FOR_MAX, AUDIT_USER_AGENT_MAX } from "@/lib/audit-user-agent";
import {
  AUDIT_WRITE_FAILED,
  AUTH_AUDIT,
  loginFailureActorEmail,
  recordAuthEvent,
  setAuthAuditInsert,
} from "@/server/auth/auth-audit";
import { LOGIN_IP_RATE_LIMIT, LOGIN_RATE_LIMIT, resetAuthRateLimits } from "@/server/auth/rate-limit";
import { hashSessionToken, SESSION_COOKIE } from "@/server/auth/session";
import * as passwords from "@/server/auth/passwords";
import { getDb } from "@/server/db/client";
import { auditEvents, sessions, users } from "@/server/db/schema";
import { truncateAll } from "../setup";

const PW = "pw-do-not-store-9f3a";

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieValue === undefined || name !== SESSION_COOKIE
        ? undefined
        : { name: SESSION_COOKIE, value: cookieValue },
  }),
}));

const WRONG = "not-the-password-zz";

function forgedHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-client-ip": "1.2.3.4, 140.248.50.22",
    "x-forwarded-for": "1.2.3.4, 203.0.113.50",
    "x-azure-clientip": "5.6.7.8",
    "user-agent": "ClockinoffAudit/1",
    "x-request-id": "auth-audit-req",
    ...extra,
  };
}

function post(url: string, body: unknown, headers: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("auth audit trail", () => {
  beforeEach(async () => {
    await truncateAll();
    resetAuthRateLimits();
    setAuthAuditInsert(null);
    cookieValue = undefined;
  });

  it("records register with the parsed client IP, not the forged left hop", async () => {
    const res = await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "new@example.com", password: PW },
        forgedHeaders(),
      ),
    );
    expect(res.status).toBe(201);
    const rows = await getDb().select().from(auditEvents);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.action).toBe(AUTH_AUDIT.register);
    expect(row?.actorEmail).toBe("new@example.com");
    expect(row?.actorUserId).toBeTruthy();
    expect(row?.targets).toEqual([{ id: row?.actorUserId, email: "new@example.com" }]);
    expect(row?.clientIp).toBe("140.248.50.22");
    expect(row?.clientIp).not.toBe("1.2.3.4");
    expect(row?.forwardedFor).toContain("x-client-ip: 1.2.3.4, 140.248.50.22");
    expect(row?.forwardedFor).toContain("x-forwarded-for: 1.2.3.4, 203.0.113.50");
    expect(row?.forwardedFor).toContain("x-azure-clientip: 5.6.7.8");
    expect(row?.userAgent).toBe("ClockinoffAudit/1");
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.status).toBe("completed");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)?.[1] ?? "";
    expect(token.length).toBeGreaterThan(0);
    expect(row?.sessionIdHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(row)).not.toContain(PW);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("records login success from the right-most X-Forwarded-For hop", async () => {
    await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "in@example.com", password: PW },
        { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
      ),
    );
    const res = await loginPost(
      post(
        "http://test/api/auth/login",
        { email: "in@example.com", password: PW },
        {
          "content-type": "application/json",
          "x-forwarded-for": "1.2.3.4, 203.0.113.50",
          "x-azure-clientip": "5.6.7.8",
          "user-agent": "ClockinoffLogin/2",
        },
      ),
    );
    expect(res.status).toBe(200);
    const loginRows = (await getDb().select().from(auditEvents)).filter(
      (row) => row.action === AUTH_AUDIT.loginSuccess,
    );
    expect(loginRows).toHaveLength(1);
    expect(loginRows[0]?.clientIp).toBe("203.0.113.50");
    expect(loginRows[0]?.clientIp).not.toBe("1.2.3.4");
    expect(loginRows[0]?.forwardedFor).toContain("1.2.3.4, 203.0.113.50");
    expect(loginRows[0]?.actorEmail).toBe("in@example.com");
    expect(loginRows[0]?.userAgent).toBe("ClockinoffLogin/2");
    expect(loginRows[0]?.createdAt).toBeInstanceOf(Date);
    const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(token).toBeTruthy();
    expect(JSON.stringify(loginRows[0])).not.toContain(PW);
    expect(JSON.stringify(loginRows[0])).not.toContain(token);
  });

  it("records the same failed-login shape when the account is missing or the password is wrong", async () => {
    await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "real@example.com", password: PW },
        { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
      ),
    );
    const headers = forgedHeaders({ "user-agent": `Agent/${"b".repeat(600)}` });
    headers["x-client-ip"] = `${"1.2.3.4, ".repeat(80)}140.248.50.22`;
    const verifySpy = vi.spyOn(passwords, "verifyPassword");

    let missing: Response;
    let wrong: Response;
    try {
      missing = await loginPost(
        post(
          "http://test/api/auth/login",
          { email: "Ghost@Example.com", password: WRONG },
          headers,
        ),
      );
      wrong = await loginPost(
        post(
          "http://test/api/auth/login",
          { email: "real@example.com", password: WRONG },
          headers,
        ),
      );
      expect(missing.status).toBe(wrong.status);
      expect(missing.status).toBe(401);
      expect(verifySpy).toHaveBeenCalledTimes(2);
    } finally {
      verifySpy.mockRestore();
    }
    const missingBody = JSON.stringify(await missing.json());
    const wrongBody = JSON.stringify(await wrong.json());
    expect(missingBody).toBe(wrongBody);
    expect(missingBody).not.toContain(PW);
    expect(missingBody).not.toContain(WRONG);
    expect(missingBody).not.toContain("audit");

    const failures = (await getDb().select().from(auditEvents)).filter(
      (row) => row.action === AUTH_AUDIT.loginFailure,
    );
    expect(failures).toHaveLength(2);
    const ghost = failures.find((row) => row.actorEmail === "ghost@example.com");
    const real = failures.find((row) => row.actorEmail === "real@example.com");
    const [account] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "real@example.com"));
    expect(account?.id).toBeTruthy();
    for (const row of [ghost, real]) {
      expect(row?.actorUserId).toBeNull();
      expect(row?.actorUserId).not.toBe(account?.id);
      expect(row?.targets).toEqual([]);
      expect(row?.sessionIdHash).toBeNull();
      expect(row?.result).toBeNull();
      expect(row?.clientIp).toBe("140.248.50.22");
      expect(row?.clientIp).not.toBe("1.2.3.4");
      expect(row?.userAgent).toHaveLength(AUDIT_USER_AGENT_MAX);
      expect(row?.forwardedFor).toHaveLength(AUDIT_FORWARDED_FOR_MAX);
      expect(row?.createdAt).toBeInstanceOf(Date);
      const blob = JSON.stringify(row);
      expect(blob).not.toContain(PW);
      expect(blob).not.toContain(WRONG);
      expect(blob).not.toContain("password");
    }
    expect(ghost?.actorEmail).not.toBe(real?.actorEmail);
    const shape = (row: (typeof failures)[number] | undefined) => {
      const {
        id: _id,
        createdAt: _createdAt,
        completedAt: _completedAt,
        requestId: _requestId,
        actorEmail: _actorEmail,
        ...rest
      } = row ?? {};
      return rest;
    };
    expect(shape(ghost)).toEqual(shape(real));
    expect(Object.keys(ghost ?? {}).sort()).toEqual(Object.keys(real ?? {}).sort());
  });

  it("caps a failed-login email at 254 characters", () => {
    const local = "a".repeat(300);
    expect(loginFailureActorEmail(`  ${local}@example.com  `)).toHaveLength(254);
    expect(loginFailureActorEmail("  In@Example.com ")).toBe("in@example.com");
  });

  it("does not write an audit row for an unknown session cookie", async () => {
    cookieValue = "not-a-real-session";
    const res = await logoutPost(
      new Request("http://test/api/auth/logout", {
        method: "POST",
        headers: forgedHeaders(),
      }),
    );
    expect(res.status).toBe(204);
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);
  });

  it("leaves earlier audit rows in place when the session is deleted", async () => {
    const registered = await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "stay@example.com", password: PW },
        forgedHeaders(),
      ),
    );
    const token =
      new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(registered.headers.get("set-cookie") ?? "")?.[1] ??
      "";
    cookieValue = token;
    const before = await getDb().select().from(auditEvents);
    expect(before.map((row) => row.action)).toEqual([AUTH_AUDIT.register]);
    const beforeId = before[0]?.id;

    const res = await logoutPost(
      new Request("http://test/api/auth/logout", {
        method: "POST",
        headers: forgedHeaders(),
      }),
    );
    expect(res.status).toBe(204);
    const after = await getDb().select().from(auditEvents);
    expect(after).toHaveLength(2);
    const kept = after.find((row) => row.id === beforeId);
    expect(kept?.action).toBe(AUTH_AUDIT.register);
    expect(kept?.clientIp).toBe(before[0]?.clientIp);
    const logout = after.find((row) => row.action === AUTH_AUDIT.logout);
    expect(logout?.actorEmail).toBe("stay@example.com");
    expect(logout?.clientIp).toBe("140.248.50.22");
    expect(logout?.clientIp).not.toBe("1.2.3.4");
    expect(logout?.forwardedFor).toContain("1.2.3.4, 203.0.113.50");
    expect(logout?.userAgent).toBe("ClockinoffAudit/1");
    expect(logout?.createdAt).toBeInstanceOf(Date);
    expect(logout?.sessionIdHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(after)).not.toContain(token);
    expect(JSON.stringify(after)).not.toContain(PW);
    const sessionRows = await getDb().select().from(sessions);
    expect(sessionRows).toHaveLength(0);
  });

  it("still registers when the audit insert throws, and the body is not the database error", async () => {
    setAuthAuditInsert(async () => {
      throw new Error("audit_events down password=pw-do-not-store-9f3a");
    });
    const res = await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "open@example.com", password: PW },
        forgedHeaders(),
      ),
    );
    expect(res.status).toBe(201);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("audit_events");
    expect(text).not.toContain(PW);
    expect(await getDb().select().from(users)).toHaveLength(1);
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);
  });

  it("still returns 401 when a failed-login audit insert throws", async () => {
    setAuthAuditInsert(async () => {
      throw new Error("duplicate key audit_events password=pw-do-not-store-9f3a");
    });
    const res = await loginPost(
      post(
        "http://test/api/auth/login",
        { email: "missing@example.com", password: PW },
        forgedHeaders(),
      ),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
    });
    expect(JSON.stringify(body)).not.toContain("audit_events");
    expect(JSON.stringify(body)).not.toContain(PW);
    expect(await getDb().select().from(auditEvents)).toHaveLength(0);
  });

  it("still logs out when the audit insert throws and keeps earlier rows", async () => {
    const registered = await registerPost(
      post(
        "http://test/api/auth/register",
        { email: "bye@example.com", password: PW },
        { "content-type": "application/json", "x-forwarded-for": "198.51.100.40" },
      ),
    );
    const token =
      new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(registered.headers.get("set-cookie") ?? "")?.[1] ??
      "";
    cookieValue = token;
    const before = await getDb().select().from(auditEvents);
    expect(before).toHaveLength(1);
    setAuthAuditInsert(async () => {
      throw new Error("logout audit failed");
    });
    const res = await logoutPost(
      new Request("http://test/api/auth/logout", { method: "POST", headers: forgedHeaders() }),
    );
    expect(res.status).toBe(204);
    const after = await getDb().select().from(auditEvents);
    expect(after).toEqual(before);
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, before[0]!.actorUserId!))).toHaveLength(
      0,
    );
  });

  it("does not add an audit row for each login the rate limiter rejects", async () => {
    const ip = "198.51.100.80";
    const email = "flood@example.com";
    await registerPost(
      post(
        "http://test/api/auth/register",
        { email, password: PW },
        { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" },
      ),
    );
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxFailures; i += 1) {
      const res = await loginPost(
        post(
          "http://test/api/auth/login",
          { email, password: WRONG },
          { "content-type": "application/json", "x-forwarded-for": ip },
        ),
      );
      expect(res.status).toBe(401);
    }
    const failureCount = async () =>
      (await getDb().select().from(auditEvents)).filter((row) => row.action === AUTH_AUDIT.loginFailure)
        .length;
    const before = await failureCount();
    expect(before).toBe(LOGIN_RATE_LIMIT.maxFailures);
    for (let i = 0; i < 6; i += 1) {
      const res = await loginPost(
        post(
          "http://test/api/auth/login",
          { email, password: PW },
          { "content-type": "application/json", "x-forwarded-for": ip },
        ),
      );
      expect(res.status).toBe(429);
    }
    expect(await failureCount()).toBe(before);
  });

  it("bounds audit rows when many junk emails come from one IP", async () => {
    const ip = "198.51.100.91";
    const extra = 8;
    const attempts = LOGIN_IP_RATE_LIMIT.maxFailures + extra;
    let rejected = 0;
    for (let i = 0; i < attempts; i += 1) {
      const res = await loginPost(
        post(
          "http://test/api/auth/login",
          { email: `junk-${i}@example.com`, password: WRONG },
          { "content-type": "application/json", "x-forwarded-for": ip },
        ),
      );
      if (res.status === 429) rejected += 1;
      else expect(res.status).toBe(401);
    }
    expect(rejected).toBe(extra);
    const failures = (await getDb().select().from(auditEvents)).filter(
      (row) => row.action === AUTH_AUDIT.loginFailure,
    );
    expect(failures.length).toBe(LOGIN_IP_RATE_LIMIT.maxFailures);
    expect(failures.length).toBeLessThan(attempts);
  });

  it("strips CR and LF before insert and keeps them out of the failure log", async () => {
    const marker = "INJECTED-LOG-LINE";
    const ua = `Agent\r\n${marker}\r\n${"u".repeat(600)}`;
    const forwarded = `x-forwarded-for: 1.2.3.4\r\n${marker}, 203.0.113.50`;
    await recordAuthEvent({
      action: AUTH_AUDIT.loginFailure,
      actorUserId: null,
      actorEmail: "crlf@example.com",
      targets: [],
      requestId: "req-crlf",
      clientIp: "203.0.113.50",
      forwardedFor: forwarded,
      userAgent: ua,
      sessionIdHash: null,
    });
    const [row] = await getDb().select().from(auditEvents);
    expect(row?.userAgent).not.toMatch(/[\r\n]/);
    expect(row?.forwardedFor).not.toMatch(/[\r\n]/);
    expect(row?.userAgent).toHaveLength(AUDIT_USER_AGENT_MAX);
    expect(row?.forwardedFor?.length).toBeLessThanOrEqual(AUDIT_FORWARDED_FOR_MAX);
    expect(row?.userAgent?.startsWith(`Agent${marker}`)).toBe(true);
    expect(row?.forwardedFor?.includes(`1.2.3.4${marker}`)).toBe(true);

    class QueryFailedError extends Error {
      constructor() {
        super(`boom\r\n${marker}\r\n${ua}`);
        this.name = "QueryFailedError";
      }
    }
    setAuthAuditInsert(async () => {
      throw new QueryFailedError();
    });
    const captured: string[] = [];
    const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      captured.push(args.map((part) => String(part)).join(" "));
    });
    try {
      await recordAuthEvent({
        action: AUTH_AUDIT.loginFailure,
        actorUserId: null,
        actorEmail: "crlf@example.com",
        targets: [],
        requestId: "req-crlf",
        clientIp: "203.0.113.50",
        forwardedFor: forwarded,
        userAgent: ua,
        sessionIdHash: null,
      });
      expect(captured).toHaveLength(1);
      const line = captured[0] ?? "";
      expect(line).not.toMatch(/[\r\n]/);
      expect(line).not.toContain(marker);
      expect(line).not.toContain(ua);
      expect(line).not.toContain(forwarded);
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed).toEqual({
        event: AUDIT_WRITE_FAILED,
        type: AUTH_AUDIT.loginFailure,
        error_class: "QueryFailedError",
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("emits audit_write_failed with the event type and no user details", async () => {
    const email = "leak-me@example.com";
    const ip = "203.0.113.77";
    const ua = "LeakAgent/9";
    const id = "11111111-2222-3333-4444-555555555555";
    class QueryFailedError extends Error {
      constructor() {
        super(`db down ${email}\r\n${ip} ${ua} ${id} password=${PW}`);
        this.name = "QueryFailedError";
      }
    }
    setAuthAuditInsert(async () => {
      throw new QueryFailedError();
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const denied = await loginPost(
        post(
          "http://test/api/auth/login",
          { email, password: PW },
          {
            "content-type": "application/json",
            "x-forwarded-for": ip,
            "user-agent": ua,
            "x-request-id": id,
          },
        ),
      );
      expect(denied.status).toBe(401);
      const created = await registerPost(
        post(
          "http://test/api/auth/register",
          { email: "open-secret@example.com", password: PW },
          {
            "content-type": "application/json",
            "x-forwarded-for": ip,
            "user-agent": ua,
          },
        ),
      );
      expect(created.status).toBe(201);
      const token =
        new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(created.headers.get("set-cookie") ?? "")?.[1] ??
        "";
      cookieValue = token;
      const signedOut = await logoutPost(
        new Request("http://test/api/auth/logout", {
          method: "POST",
          headers: { "x-forwarded-for": ip, "user-agent": ua },
        }),
      );
      expect(signedOut.status).toBe(204);

      const lines = spy.mock.calls.map((call) => call.map((part) => String(part)).join(" "));
      const hits = lines.filter((line) => line.includes(AUDIT_WRITE_FAILED));
      expect(hits).toHaveLength(3);
      const types = hits.map((line) => {
        expect(line).not.toMatch(/[\r\n]/);
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(Object.keys(parsed).sort()).toEqual(["error_class", "event", "type"]);
        expect(parsed.event).toBe(AUDIT_WRITE_FAILED);
        expect(parsed.error_class).toBe("QueryFailedError");
        expect(line).not.toContain(email);
        expect(line).not.toContain("open-secret@example.com");
        expect(line).not.toContain(ip);
        expect(line).not.toContain(ua);
        expect(line).not.toContain(id);
        expect(line).not.toContain(token);
        expect(line).not.toContain(PW);
        expect(line).not.toContain("password");
        expect(line).not.toContain("db down");
        return parsed.type;
      });
      expect(types).toEqual([
        AUTH_AUDIT.loginFailure,
        AUTH_AUDIT.register,
        AUTH_AUDIT.logout,
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
