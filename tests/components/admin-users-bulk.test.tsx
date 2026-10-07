// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "@/components/admin/AdminUsers";
import { emitToast } from "@/lib/events";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/users",
}));

vi.mock("@/lib/events", () => ({
  emitToast: vi.fn(),
}));

const actorId = "11111111-1111-4111-8111-111111111111";

const users = [
  {
    id: actorId,
    email: "me@ex.com",
    role: "admin" as const,
    status: "active" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    blocked_at: null,
    entries_count: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "ada@ex.com",
    role: "user" as const,
    status: "active" as const,
    created_at: "2026-01-02T00:00:00.000Z",
    blocked_at: null,
    entries_count: 2,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "blocked@ex.com",
    role: "user" as const,
    status: "blocked" as const,
    created_at: "2026-01-03T00:00:00.000Z",
    blocked_at: "2026-02-01T00:00:00.000Z",
    entries_count: 1,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "boss@ex.com",
    role: "admin" as const,
    status: "active" as const,
    created_at: "2026-01-04T00:00:00.000Z",
    blocked_at: null,
    entries_count: 4,
  },
];

function listResponse(): Response {
  return new Response(
    JSON.stringify({
      users,
      page: 1,
      page_size: 25,
      total: users.length,
      admins_count: 2,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminUsers bulk actions", () => {
  it("selects the current page and confirms an eligible-only remove", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/users/bulk")) {
        void init;
        return new Response(JSON.stringify({ applied: 3, skipped: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return listResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminUsers actorId={actorId} timezone="Asia/Jerusalem" />);
    expect((await screen.findAllByText("ada@ex.com")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select all on this page" })[0]);
    const toolbar = screen.getByRole("toolbar", { name: "Bulk user actions" });
    expect(toolbar.textContent).toContain("4 selected");

    const remove = within(toolbar).getByRole("button", { name: "Remove" });
    const block = within(toolbar).getByRole("button", { name: "Block" });
    const unblock = within(toolbar).getByRole("button", { name: "Unblock" });
    const promote = within(toolbar).getByRole("button", { name: "Promote" });
    const demote = within(toolbar).getByRole("button", { name: "Demote" });
    expect(remove.className).toContain("btn-danger-fill");
    expect(block.className).toContain("btn-danger-fill");
    expect(unblock.className).toContain("btn-accent-fill");
    expect(promote.className).toContain("btn-accent-fill");
    expect(demote.className).toContain("btn-secondary-solid");

    fireEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "Remove 3 users?" });
    expect(dialog.textContent).toContain("ada@ex.com");
    expect(dialog.textContent).toContain("blocked@ex.com");
    expect(dialog.textContent).toContain("boss@ex.com");
    expect(dialog.textContent).not.toContain("me@ex.com");
    expect(dialog.textContent).toContain("1 will be skipped.");
    expect(within(dialog).getByRole("button", { name: "Remove" }).className).toContain(
      "btn-danger-fill",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/bulk",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const bulkCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/bulk"));
    const sent = JSON.parse(String(bulkCall?.[1]?.body)) as { action: string; ids: string[] };
    expect(sent.action).toBe("remove");
    expect(sent.ids).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(emitToast).toHaveBeenCalledWith("Removed 3. Skipped 1.");
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Bulk user actions" })).toBeNull();
    });
  });

  it("clears the selection and hides actions nobody selected can take", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => listResponse()));
    render(<AdminUsers actorId={actorId} timezone="Asia/Jerusalem" />);
    expect((await screen.findAllByText("blocked@ex.com")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select blocked@ex.com" })[0]);
    const toolbar = screen.getByRole("toolbar", { name: "Bulk user actions" });
    expect(toolbar.textContent).toContain("1 selected");
    expect(within(toolbar).getByRole("button", { name: "Unblock" })).toBeTruthy();
    expect(within(toolbar).queryByRole("button", { name: "Block" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Demote" })).toBeNull();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("toolbar", { name: "Bulk user actions" })).toBeNull();
  });
});
