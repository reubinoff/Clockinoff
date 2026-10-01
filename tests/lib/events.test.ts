import { describe, expect, it, beforeEach } from "vitest";
import {
  emitEntryAdded,
  emitProjectsChanged,
  emitTimerChanged,
  emitToast,
  onEntryAdded,
  onProjectsChanged,
  onTimerChanged,
  onToast,
  _resetProjectsChangedListenersForTests,
  _resetToastBufferForTests,
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

describe("toast event bus (V2-6)", () => {
  beforeEach(() => {
    _resetProjectsChangedListenersForTests();
    _resetToastBufferForTests();
  });

  it("delivers kind + monotonically increasing id to subscribers", () => {
    const seen: Array<{ id: number; kind: string }> = [];
    onToast((evt) => seen.push({ id: evt.id, kind: evt.kind }));
    const a = emitToast("Logged");
    const b = emitToast("Saved");
    expect(seen).toEqual([
      { id: a.id, kind: "Logged" },
      { id: b.id, kind: "Saved" },
    ]);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("replays buffered events on late subscribe", () => {
    emitToast("Discarded");
    const seen: string[] = [];
    onToast((evt) => seen.push(evt.kind));
    expect(seen).toEqual(["Discarded"]);
  });

  it("keeps calling later listeners when one throws (emit + replay)", () => {
    onToast(() => {
      throw new Error("boom");
    });
    let ok = 0;
    onToast(() => {
      ok += 1;
    });
    expect(() => emitToast("Logged")).not.toThrow();
    expect(ok).toBe(1);
    expect(() =>
      onToast(() => {
        throw new Error("boom-replay");
      }),
    ).not.toThrow();
  });
});

describe("entry-added event bus (V2-6/V2-7)", () => {
  beforeEach(() => {
    _resetProjectsChangedListenersForTests();
  });

  it("delivers the emitted entry payload to subscribers", () => {
    const seen: Array<{ id: string }> = [];
    const off = onEntryAdded<{ id: string }>((e) => seen.push(e));
    emitEntryAdded({ id: "a" });
    emitEntryAdded({ id: "b" });
    off();
    emitEntryAdded({ id: "c" });
    expect(seen).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("keeps calling later listeners when one throws", () => {
    onEntryAdded(() => {
      throw new Error("boom");
    });
    let ok = 0;
    onEntryAdded(() => {
      ok += 1;
    });
    expect(() => emitEntryAdded({ id: "x" })).not.toThrow();
    expect(ok).toBe(1);
  });
});

// #84 play-to-resume bus: EntryList emits when it starts a new timer from a
// row, TimerBar re-reads /api/timer on the ping. Shape mirrors
// `onProjectsChanged` exactly, so the contract we care about is: multiple
// subscribers, clean unsubscribe, no payload, and listener errors never
// break the fan-out.
describe("timer-changed event bus (#84)", () => {
  beforeEach(() => {
    _resetProjectsChangedListenersForTests();
  });

  it("fans out emits to all subscribers", () => {
    const seen: string[] = [];
    onTimerChanged(() => seen.push("a"));
    onTimerChanged(() => seen.push("b"));
    emitTimerChanged();
    expect(seen).toEqual(["a", "b"]);
  });

  it("unsubscribes cleanly", () => {
    let count = 0;
    const off = onTimerChanged(() => {
      count += 1;
    });
    emitTimerChanged();
    off();
    emitTimerChanged();
    expect(count).toBe(1);
  });

  it("keeps calling later subscribers when one throws", () => {
    onTimerChanged(() => {
      throw new Error("boom");
    });
    let reached = false;
    onTimerChanged(() => {
      reached = true;
    });
    expect(() => emitTimerChanged()).not.toThrow();
    expect(reached).toBe(true);
  });
});
