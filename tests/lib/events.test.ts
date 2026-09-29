import { describe, expect, it, beforeEach } from "vitest";
import {
  emitProjectsChanged,
  onProjectsChanged,
  _resetProjectsChangedListenersForTests,
} from "@/lib/events";

describe("projects-changed event bus", () => {
  beforeEach(() => {
    _resetProjectsChangedListenersForTests();
  });

  it("notifies subscribers when a project change is emitted", () => {
    let count = 0;
    onProjectsChanged(() => {
      count += 1;
    });
    emitProjectsChanged();
    emitProjectsChanged();
    expect(count).toBe(2);
  });

  it("supports multiple concurrent subscribers", () => {
    const seen: string[] = [];
    onProjectsChanged(() => seen.push("a"));
    onProjectsChanged(() => seen.push("b"));
    emitProjectsChanged();
    expect(seen).toEqual(["a", "b"]);
  });

  it("unsubscribes cleanly and stops receiving events", () => {
    let count = 0;
    const off = onProjectsChanged(() => {
      count += 1;
    });
    emitProjectsChanged();
    off();
    emitProjectsChanged();
    expect(count).toBe(1);
  });

  it("keeps calling later subscribers when one throws", () => {
    let reached = false;
    onProjectsChanged(() => {
      throw new Error("boom");
    });
    onProjectsChanged(() => {
      reached = true;
    });
    expect(() => emitProjectsChanged()).not.toThrow();
    expect(reached).toBe(true);
  });
});
