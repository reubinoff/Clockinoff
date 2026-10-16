// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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

function installMatchMedia(width: number): void {
  vi.stubGlobal("matchMedia", (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  });
}

function idleFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/timer")) {
        return { ok: true, json: async () => null };
      }
      return { ok: true, json: async () => ({ projects: [] }) };
    }),
  );
}

function runningFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/projects")) {
        return { ok: true, json: async () => ({ projects: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          id: "entry-1",
          description: "",
          start_at: "2026-10-16T12:00:00.000Z",
          end_at: null,
          project_id: null,
          project_name: null,
          billable: true,
          running: true,
        }),
      };
    }),
  );
}

function collapsedBar(): HTMLElement {
  const bar = document.querySelector("[data-timer-mobile-collapsed]");
  if (!(bar instanceof HTMLElement)) throw new Error("collapsed bar missing");
  return bar;
}

function classTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe("timer placeholder at 390", () => {
  it("uses the short invitation and keeps the description accessible name", async () => {
    installMatchMedia(390);
    idleFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const invitation = await screen.findByRole("button", {
      name: "What are you working on?",
    });
    expect(invitation).toHaveTextContent("What are you on?");
    expect(invitation).not.toHaveTextContent("What are you working on?");
    const field = screen.getByRole("textbox", { name: "Timer description" });
    expect(field).toHaveAttribute("placeholder", "What are you on?");
    expect(field).toHaveAttribute("aria-label", "Timer description");
  });

  it("keeps the longer placeholder from the md breakpoint up", async () => {
    installMatchMedia(768);
    idleFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const field = await screen.findByRole("textbox", { name: "Timer description" });
    expect(field).toHaveAttribute("placeholder", "What are you working on?");
  });
});

describe("collapsed timer bar", () => {
  it("keeps px-4 and gap-2 on the collapsed band", async () => {
    installMatchMedia(390);
    idleFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    await screen.findByRole("button", { name: "What are you working on?" });
    const tokens = classTokens(collapsedBar().className);
    expect(tokens.has("px-4")).toBe(true);
    expect(tokens.has("gap-2")).toBe(true);
    expect(tokens.has("px-2")).toBe(false);
    expect(tokens.has("gap-px")).toBe(false);
    expect(tokens.has("gap-1")).toBe(false);
  });

  it("uses a round icon-only Start below 400", async () => {
    installMatchMedia(390);
    idleFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const start = await within(collapsedBar()).findByRole("button", {
      name: "Start timer",
    });
    expect(start).not.toHaveTextContent("Start");
    expect(start.querySelector("svg")).toBeTruthy();
    expect(start.className).toContain("!rounded-full");
    expect(start.className).toContain("!h-11");
    expect(start.className).toContain("!w-11");
    expect(start.getAttribute("aria-label")).toBe("Start timer");
  });

  it("keeps the labelled Start from 400px up", async () => {
    installMatchMedia(400);
    idleFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const start = await within(collapsedBar()).findByRole("button", {
      name: "Start timer",
    });
    expect(start).toHaveTextContent("Start");
    expect(start.className).toContain("!px-4");
    expect(start.className).not.toContain("!rounded-full");
    expect(start.getAttribute("aria-label")).toBe("Start timer");
  });

  it("uses a round icon-only Stop below 400 while running", async () => {
    installMatchMedia(360);
    runningFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const stop = await within(collapsedBar()).findByRole("button", {
      name: "Stop timer",
    });
    expect(stop).not.toHaveTextContent("Stop");
    expect(stop.querySelector("svg")).toBeTruthy();
    expect(stop.className).toContain("!rounded-full");
    expect(stop.className).toContain("!h-11");
    expect(stop.className).toContain("!w-11");
    expect(stop.getAttribute("aria-label")).toBe("Stop timer");
  });

  it("keeps the labelled Stop from 400px up", async () => {
    installMatchMedia(400);
    runningFetch();
    render(<TimerBar timezone="Asia/Jerusalem" />);
    const stop = await within(collapsedBar()).findByRole("button", {
      name: "Stop timer",
    });
    expect(stop).toHaveTextContent("Stop");
    expect(stop.className).toContain("!px-4");
    expect(stop.getAttribute("aria-label")).toBe("Stop timer");
  });
});
