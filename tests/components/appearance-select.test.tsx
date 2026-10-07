// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AppearanceSelect from "@/components/AppearanceSelect";
import {
  _resetAppearanceListenersForTests,
  APPEARANCE_STORAGE_KEY,
} from "@/lib/appearance";

function installMatchMedia(prefersDark = false): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: prefersDark && query.includes("prefers-color-scheme: dark"),
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
  _resetAppearanceListenersForTests();
  installMatchMedia(false);
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  _resetAppearanceListenersForTests();
  window.localStorage.clear();
});

function appearanceButtons(): HTMLElement[] {
  return screen.getAllByRole("button", { name: "Appearance" });
}

describe("AppearanceSelect", () => {
  it("exposes a stable Appearance button and is usable before hydration settles", () => {
    render(<AppearanceSelect />);
    const button = screen.getByRole("button", { name: "Appearance" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("data-appearance-value")).toBe("system");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens an in-page listbox and applies Dark from a click", () => {
    render(<AppearanceSelect />);
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    const list = screen.getByRole("listbox", { name: "Appearance" });
    expect(list).toBeTruthy();
    expect(screen.getAllByRole("option").map((node) => node.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
    fireEvent.click(screen.getByRole("option", { name: "Dark" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Appearance" }).getAttribute("data-appearance-value"),
    ).toBe("dark");
  });

  it("selects Dark from the keyboard without a native popup", () => {
    render(<AppearanceSelect variant="menu" />);
    const button = screen.getByRole("button", { name: "Appearance" });
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const system = screen.getByRole("option", { name: "System" });
    expect(document.activeElement).toBe(system);
    fireEvent.keyDown(system, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: "Light" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: "Dark" }), { key: "Enter" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button.getAttribute("data-appearance-value")).toBe("dark");
  });

  it("keeps the desktop and menu controls in sync", () => {
    render(
      <>
        <AppearanceSelect />
        <AppearanceSelect variant="menu" />
      </>,
    );
    fireEvent.click(appearanceButtons()[0]);
    fireEvent.click(screen.getByRole("option", { name: "Light" }));
    expect(appearanceButtons().map((node) => node.getAttribute("data-appearance-value"))).toEqual([
      "light",
      "light",
    ]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("closes on Escape without changing the stored choice", () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "light");
    render(<AppearanceSelect />);
    const button = screen.getByRole("button", { name: "Appearance" });
    fireEvent.click(button);
    expect(screen.getByRole("listbox", { name: "Appearance" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(button.getAttribute("data-appearance-value")).toBe("light");
  });
});
