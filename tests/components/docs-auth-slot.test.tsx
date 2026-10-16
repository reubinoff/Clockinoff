// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocsLayout from "@/app/docs/layout";
import DocsAuthSlot from "@/components/DocsAuthSlot";
import { ACCOUNT_TRIGGER_SIZE_CLASS } from "@/components/HeaderUserMenu";
import * as docsIndex from "@/app/docs/page";
import * as docsSlug from "@/app/docs/[slug]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionUser: vi.fn(() => {
    throw new Error("docs HTML must not read the session");
  }),
  SESSION_COOKIE: "timely_session",
}));

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function docsHtml(): string {
  return renderToStaticMarkup(
    <DocsLayout>
      <p>Same body</p>
    </DocsLayout>,
  );
}

beforeEach(() => {
  installMatchMedia();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  document.cookie = "timely_session=; Max-Age=0; path=/";
});

describe("static /docs header", () => {
  it("renders the same HTML with or without a session cookie and no user data", () => {
    document.cookie = "";
    const anonymous = docsHtml();
    document.cookie = "timely_session=visitor-a-secret-token";
    const withSession = docsHtml();
    document.cookie = "timely_session=visitor-b-other-token";
    const otherSession = docsHtml();

    expect(withSession).toBe(anonymous);
    expect(otherSession).toBe(anonymous);
    expect(anonymous).toContain('data-docs-auth="pending"');
    expect(anonymous).toContain("min-w-[10.21875rem]");
    expect(anonymous).toContain("whitespace-nowrap");
    expect(anonymous).toContain("Loading account");
    expect(anonymous).not.toContain("Sign in");
    expect(anonymous).not.toContain("Create account");
    expect(anonymous).not.toContain("Account menu");
    expect(anonymous).not.toContain("visitor-a-secret-token");
    expect(anonymous).not.toContain("visitor-b-other-token");
    expect(anonymous).not.toContain("@");
    expect(anonymous).not.toContain("timely_session");
  });

  it("keeps /docs pages force-static and the layout off the session", () => {
    expect(docsIndex.dynamic).toBe("force-static");
    expect(docsSlug.dynamic).toBe("force-static");
    const root = process.cwd();
    const layout = readFileSync(path.join(root, "src/app/docs/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/cookies\(|getSessionUser|headers\(/);
    const slot = readFileSync(path.join(root, "src/components/DocsAuthSlot.tsx"), "utf8");
    expect(slot).toContain('fetch("/api/auth/me"');
    expect(slot).toContain('cache: "no-store"');
  });
});

describe("DocsAuthSlot", () => {
  it("shows a placeholder the same size as the account trigger until the check resolves", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
    render(<DocsAuthSlot />);
    const box = document.querySelector("[data-docs-auth-placeholder]");
    expect(box).not.toBeNull();
    for (const token of ACCOUNT_TRIGGER_SIZE_CLASS.split(" ")) {
      expect(box?.className.split(/\s+/)).toContain(token);
    }
    expect(box?.className).toContain("xl:w-[11.25rem]");
    const slot = document.querySelector("[data-docs-auth='pending']");
    expect(slot?.className).toContain("min-w-[10.21875rem]");
    expect(slot?.className).toContain("xl:min-w-0");
    expect(slot?.className).toContain("xl:w-[11.25rem]");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
    expect(document.body.textContent).not.toContain("@");
  });

  it("shows the account menu after a signed-in /api/auth/me", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ email: "ada@example.com", role: "user" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<DocsAuthSlot />);
    const trigger = await screen.findByRole("button", {
      name: "Account menu, ada@example.com",
    });
    for (const token of ACCOUNT_TRIGGER_SIZE_CLASS.split(" ")) {
      expect(trigger.className.split(/\s+/)).toContain(token);
    }
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
  });

  it("shows Admin in the menu when the signed-in user is an admin", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ email: "ada@example.com", role: "admin" }), {
        status: 200,
      }),
    );
    render(<DocsAuthSlot />);
    const trigger = await screen.findByRole("button", {
      name: "Account menu, ada@example.com",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Admin" })).toBeTruthy();
  });

  it("falls back to Sign in and Create account on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in" } }), {
        status: 401,
      }),
    );
    render(<DocsAuthSlot />);
    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/login");
    const create = screen.getByRole("link", { name: "Create account" });
    expect(create.getAttribute("href")).toBe("/register");
    expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
    const slot = document.querySelector("[data-docs-auth='signed-out']");
    expect(slot?.className).toContain("min-w-[10.21875rem]");
    expect(slot?.className).toContain("xl:w-[11.25rem]");
    expect(screen.getByRole("link", { name: "Sign in" }).className).toContain("whitespace-nowrap");
    expect(screen.getByRole("link", { name: "Create account" }).className).toContain(
      "whitespace-nowrap",
    );
  });

  it("falls back to Sign in and Create account when the check fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network"));
    render(<DocsAuthSlot />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("@");
  });

  it("falls back to Sign in and Create account on a non-401 error response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    render(<DocsAuthSlot />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
  });
});
