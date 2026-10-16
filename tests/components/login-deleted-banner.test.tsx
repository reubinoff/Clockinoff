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

const DELETED_HEADING = "Your account is gone";
const DELETED_SUBTITLE =
  "Thanks for trying Clockinoff. You can create a new account anytime.";

afterEach(() => {
  cleanup();
  nav.params = new URLSearchParams();
});

describe("login deleted=1", () => {
  it("replaces the heading and subtitle and does not add a banner", () => {
    nav.params = new URLSearchParams("deleted=1");
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: DELETED_HEADING })).toBeTruthy();
    expect(screen.getByText(DELETED_SUBTITLE)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Your account has been deleted/)).toBeNull();
    expect(screen.queryByText("Welcome back")).toBeNull();
    expect(screen.queryByText("Sign in to keep your pulse going.")).toBeNull();
    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
  });

  it("keeps the welcome heading when deleted is absent", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByText("Sign in to keep your pulse going.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: DELETED_HEADING })).toBeNull();
    expect(screen.queryByText(DELETED_SUBTITLE)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
