// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_FAILURE_STATUSES,
  buildLoginRedirect,
  handleAuthFailure,
  isAuthFailure,
} from "@/lib/auth-ui";

describe("auth-ui", () => {
  it("flags 401 and 403 as auth failures and nothing else", () => {
    expect(AUTH_FAILURE_STATUSES).toEqual([401, 403]);
    for (const s of [401, 403]) expect(isAuthFailure(s)).toBe(true);
    for (const s of [200, 204, 400, 404, 409, 429, 500, 0]) {
      expect(isAuthFailure(s)).toBe(false);
    }
  });

  it("builds a /login?next= URL that encodes the current path", () => {
    expect(buildLoginRedirect("/app")).toBe("/login?next=%2Fapp");
    expect(buildLoginRedirect("/app/export?from=2026-10-01")).toBe(
      "/login?next=%2Fapp%2Fexport%3Ffrom%3D2026-10-01",
    );
  });

  it("falls back to /app when the path is empty, relative, or external", () => {
    expect(buildLoginRedirect("")).toBe("/login?next=%2Fapp");
    expect(buildLoginRedirect("relative/path")).toBe("/login?next=%2Fapp");
    expect(buildLoginRedirect("https://evil.example/x")).toBe(
      "/login?next=%2Fapp",
    );
  });

  it("rolls back optimistic state before navigating on auth failure", () => {
    const rollback = vi.fn();
    const navigate = vi.fn();
    handleAuthFailure({ rollback, navigate, path: "/app" });
    expect(rollback).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/login?next=%2Fapp");
    expect(rollback.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
  });

  it("still navigates when the rollback throws", () => {
    const rollback = vi.fn(() => {
      throw new Error("boom");
    });
    const navigate = vi.fn();
    handleAuthFailure({ rollback, navigate, path: "/app/export" });
    expect(navigate).toHaveBeenCalledWith("/login?next=%2Fapp%2Fexport");
  });

  it("works without a rollback and uses the provided path", () => {
    const navigate = vi.fn();
    handleAuthFailure({ navigate, path: "/app" });
    expect(navigate).toHaveBeenCalledWith("/login?next=%2Fapp");
  });

  describe("default browser hookup", () => {
    const originalLocation = window.location;
    let assignSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      assignSpy = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          ...originalLocation,
          pathname: "/app/export",
          search: "?from=2026-10-01",
          assign: assignSpy,
        },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    });

    it("reads the current path from window when no override is provided", () => {
      const navigate = vi.fn();
      handleAuthFailure({ navigate });
      expect(navigate).toHaveBeenCalledWith(
        "/login?next=%2Fapp%2Fexport%3Ffrom%3D2026-10-01",
      );
    });

    it("falls back to window.location.assign when navigate is omitted", () => {
      handleAuthFailure({ path: "/app/entries" });
      expect(assignSpy).toHaveBeenCalledWith("/login?next=%2Fapp%2Fentries");
    });
  });
});
