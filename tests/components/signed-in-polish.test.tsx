// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExportPage from "@/app/app/export/page";
import ProjectsPanel from "@/components/ProjectsPanel";
import TimerBar from "@/components/TimerBar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("projects add row", () => {
  it("lets the inline Add button wrap inside the card at tablet width", () => {
    render(<ProjectsPanel initial={[]} clients={[]} />);
    const button = screen.getByRole("button", { name: "Add" });
    const form = button.closest("form");
    expect(form?.className).toContain("md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]");
    expect(button.parentElement?.className).toContain("flex-wrap");
    expect(button.parentElement?.className).toContain("min-w-0");
  });
});

describe("export download buttons", () => {
  it("gives Download CSV and Download PDF the same 48px minimum height", () => {
    render(<ExportPage />);
    const csv = screen.getByRole("button", { name: "Download CSV" });
    const pdf = screen.getByRole("button", { name: "Download PDF" });
    expect(csv.className).toContain("min-h-[48px]");
    expect(pdf.className).toContain("min-h-[48px]");
  });
});

function installMatchMedia(matchesNarrow: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matchesNarrow && query.includes("max-width: 767px"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe("timer placeholder at 390", () => {
  it("uses the short invitation and keeps the description accessible name", async () => {
    installMatchMedia(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/timer")) {
          return { ok: true, json: async () => null };
        }
        return { ok: true, json: async () => ({ projects: [] }) };
      }),
    );
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const invitation = await screen.findByRole("button", {
      name: "What are you working on?",
    });
    expect(invitation).toHaveTextContent("What are you on?");
    expect(invitation).not.toHaveTextContent("What are you working on?");
    expect(invitation.className).toContain("flex-1");
    expect(invitation.className).toContain("min-w-0");
    expect(invitation.className).not.toMatch(/min-w-\[|max-w-/);
    const label = invitation.querySelector("span");
    expect(label?.className).toContain("flex-1");
    expect(label?.className).toContain("min-w-0");
    expect(label?.className).toContain("truncate");
    expect(label?.className).not.toMatch(/min-w-\[|max-w-/);
    const field = screen.getByRole("textbox", { name: "Timer description" });
    expect(field).toHaveAttribute("placeholder", "What are you on?");
    expect(field).toHaveAttribute("aria-label", "Timer description");
  });

  it("keeps the longer placeholder from the md breakpoint up", async () => {
    installMatchMedia(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/timer")) {
          return { ok: true, json: async () => null };
        }
        return { ok: true, json: async () => ({ projects: [] }) };
      }),
    );
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const field = await screen.findByRole("textbox", { name: "Timer description" });
    expect(field).toHaveAttribute("placeholder", "What are you working on?");
  });
});
