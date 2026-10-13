// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminUsers from "@/components/admin/AdminUsers";

const replaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: replaceMock }),
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
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
];

function listResponse(url: string): Response {
  const parsed = new URL(url, "http://test");
  const page = Number(parsed.searchParams.get("page") ?? "1");
  const row = page === 1 ? users[0] : users[1];
  return new Response(
    JSON.stringify({
      users: row ? [row] : [],
      page,
      page_size: 1,
      total: users.length,
      admins_count: 1,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminUsers column sort", () => {
  it("resets to page 1 when the header sort changes and keeps the search", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => listResponse(String(input)));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminUsers actorId={actorId} timezone="Asia/Jerusalem" />);
    expect((await screen.findAllByText("me@ex.com")).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Created" }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: "Email" }).getAttribute("aria-sort")).toBe(
      "none",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("page=2"))).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("Search by email"), { target: { value: "ada" } });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => {
          const url = String(call[0]);
          return url.includes("q=ada") && url.includes("page=1") && url.includes("sort=created");
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => {
          const url = String(call[0]);
          return url.includes("q=ada") && url.includes("page=2");
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => {
          const url = String(call[0]);
          return (
            url.includes("sort=email") &&
            url.includes("dir=asc") &&
            url.includes("page=1") &&
            url.includes("q=ada")
          );
        }),
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.some((call) => {
        const url = String(call[0]);
        return url.includes("sort=email") && url.includes("page=2");
      }),
    ).toBe(false);
    expect(screen.getByRole("columnheader", { name: "Email" }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: "Created" }).getAttribute("aria-sort")).toBe(
      "none",
    );
    expect(replaceMock).toHaveBeenCalledWith("/admin/users?sort=email&dir=asc", { scroll: false });

    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "Email" }).getAttribute("aria-sort")).toBe(
        "descending",
      );
    });
  });
});
