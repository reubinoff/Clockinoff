// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserActions, type AdminUser } from "@/components/admin/admin-ui";

afterEach(() => {
  cleanup();
});

const user: AdminUser = {
  id: "user-1",
  email: "ada@example.com",
  role: "user",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  blocked_at: null,
  entries_count: 2,
};

describe("UserActions", () => {
  it("shows a kebab with aria-label Actions and the same menu", () => {
    const onAsk = vi.fn();
    render(
      <UserActions user={user} actorId="actor-1" adminsCount={1} onAsk={onAsk} />,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.textContent).toBe("⋯");
    expect(trigger.getAttribute("aria-label")).toBe("Actions");
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);

    const menu = screen.getByRole("menu");
    const labels = Array.from(menu.querySelectorAll("[role='menuitem']")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["View", "Remove", "Block", "Promote"]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    expect(onAsk).toHaveBeenCalledWith("block", user);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
