// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

describe("lockBodyScroll", () => {
  afterEach(() => {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  });

  it("hides overflow and pads by the scrollbar gap", () => {
    document.body.style.paddingRight = "4px";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 994,
    });

    const unlock = lockBodyScroll();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("10px");

    unlock();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("4px");
  });

  it("leaves padding alone when there is no scrollbar", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 800,
    });

    const unlock = lockBodyScroll();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("");
    unlock();
    expect(document.body.style.overflow).toBe("");
  });
});
