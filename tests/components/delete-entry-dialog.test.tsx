// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeleteEntryDialog, {
  deleteEntryTimeRange,
} from "@/components/DeleteEntryDialog";

afterEach(() => {
  cleanup();
});

const entry = {
  projectName: "Design",
  description: "Spec review",
  startAt: "2026-10-06T06:15:00.000Z",
  endAt: "2026-10-06T07:45:00.000Z",
  durationSeconds: 5400,
};

describe("DeleteEntryDialog", () => {
  it("previews project, description, time range, and duration", () => {
    render(
      <DeleteEntryDialog
        entry={entry}
        timezone="Asia/Jerusalem"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Delete this entry?" })).toBeTruthy();
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.getByText("Spec review")).toBeTruthy();
    expect(screen.getByText("09:15–10:45")).toBeTruthy();
    expect(screen.getByText("1.50h")).toBeTruthy();
  });

  it("uses the empty placeholders when project and description are blank", () => {
    render(
      <DeleteEntryDialog
        entry={{
          ...entry,
          projectName: "  ",
          description: "",
        }}
        timezone="Asia/Jerusalem"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByText("No project")).toBeTruthy();
    expect(screen.getByText("No description")).toBeTruthy();
  });

  it("includes dates when the range crosses midnight in the user zone", () => {
    expect(
      deleteEntryTimeRange(
        "2026-10-06T20:30:00.000Z",
        "2026-10-06T21:30:00.000Z",
        "Asia/Jerusalem",
      ),
    ).toBe("2026-10-06 23:30–2026-10-07 00:30");
  });

  it("cancels from Cancel, Escape, and the backdrop, and deletes from Delete", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <DeleteEntryDialog
        entry={entry}
        timezone="Asia/Jerusalem"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);

    const backdrop = container.firstElementChild;
    expect(backdrop).toBeTruthy();
    fireEvent.mouseDown(backdrop as Element);
    expect(onCancel).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
