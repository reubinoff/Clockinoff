// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeaderUserMenu from "@/components/HeaderUserMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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

beforeEach(() => {
  installMatchMedia();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function openMenu(): void {
  fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
}

function menuOrder(): string[] {
  const menu = screen.getByRole("menu", { name: "Account" });
  return [...menu.querySelectorAll("[role='menuitem'], [role='separator'], [data-appearance-control]")].map(
    (node) => {
      if (node.getAttribute("role") === "separator") return "separator";
      if (node.hasAttribute("data-appearance-control")) return "Appearance";
      return (node.textContent ?? "").trim();
    },
  );
}

describe("HeaderUserMenu", () => {
  it("lists Account, Docs, Admin, Appearance, and Log out for an admin", () => {
    render(<HeaderUserMenu email="ada@example.com" isAdmin />);
    openMenu();
    expect(menuOrder()).toEqual([
      "Account",
      "Docs",
      "Admin",
      "separator",
      "Appearance",
      "separator",
      "Log out",
    ]);
  });

  it("omits Admin for a non-admin", () => {
    render(<HeaderUserMenu email="ada@example.com" />);
    openMenu();
    expect(menuOrder()).toEqual([
      "Account",
      "Docs",
      "separator",
      "Appearance",
      "separator",
      "Log out",
    ]);
    expect(screen.queryByRole("menuitem", { name: "Admin" })).toBeNull();
  });

  it("uses one trigger that carries the email for the wide header", () => {
    render(<HeaderUserMenu email="ada@example.com" />);
    const trigger = screen.getByRole("button", { name: /Account menu, ada@example.com/ });
    expect(trigger.textContent).toContain("ada@example.com");
    expect(trigger.textContent).toContain("A");
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
  });
});
