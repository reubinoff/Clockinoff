// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

afterEach(() => {
  cleanup();
  nav.params = new URLSearchParams();
});

describe("login deleted banner", () => {
  it("shows a neutral banner that does not name the account", () => {
    nav.params = new URLSearchParams("deleted=1");
    render(<LoginPage />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      "Your account has been deleted. Thanks for trying Clockinoff.",
    );
    expect(banner.className).toContain("bg-canvas-2");
    expect(banner.className).not.toContain("danger");
    expect(banner.textContent).not.toMatch(/@/);
    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
  });

  it("leaves the login card unchanged when deleted is absent", () => {
    render(<LoginPage />);
    expect(screen.queryByText(/Your account has been deleted/)).toBeNull();
  });
});
