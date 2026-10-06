import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCES,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  _resetAppearanceListenersForTests,
  appearanceBootScript,
  applyTheme,
  commitAppearance,
  emitAppearance,
  isAppearance,
  readAppearance,
  resolveTheme,
  subscribeAppearance,
  writeAppearance,
} from "@/lib/appearance";

function makeStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    getItem: (k: string): string | null => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string): void => {
      store.set(k, v);
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
  };
}

function makeThrowingStorage() {
  return {
    getItem: (_k: string): string | null => {
      throw new Error("blocked");
    },
    setItem: (_k: string, _v: string): void => {
      throw new Error("blocked");
    },
    removeItem: (_k: string): void => {
      throw new Error("blocked");
    },
  };
}

describe("appearance constants", () => {
  it("locks the storage key to timely.appearance", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("timely.appearance");
  });
  it("exposes exactly the three-way enum", () => {
    expect([...APPEARANCES]).toEqual(["system", "light", "dark"]);
    expect(DEFAULT_APPEARANCE).toBe("system");
  });
});

describe("isAppearance", () => {
  it("accepts locked enum values", () => {
    expect(isAppearance("system")).toBe(true);
    expect(isAppearance("light")).toBe(true);
    expect(isAppearance("dark")).toBe(true);
  });
  it("rejects anything else — no raw injection", () => {
    expect(isAppearance("Dark")).toBe(false);
    expect(isAppearance("")).toBe(false);
    expect(isAppearance(null)).toBe(false);
    expect(isAppearance(undefined)).toBe(false);
    expect(isAppearance(42)).toBe(false);
    expect(isAppearance({ toString: () => "dark" })).toBe(false);
  });
});

describe("readAppearance", () => {
  it("returns default when storage is missing", () => {
    expect(readAppearance(null)).toBe("system");
    expect(readAppearance(undefined)).toBe("system");
  });
  it("returns default when key is unset", () => {
    expect(readAppearance(makeStorage())).toBe("system");
  });
  it("returns default (never the raw string) when stored value is invalid", () => {
    expect(readAppearance(makeStorage({ [APPEARANCE_STORAGE_KEY]: "auto" }))).toBe(
      "system",
    );
    expect(
      readAppearance(makeStorage({ [APPEARANCE_STORAGE_KEY]: "<script>" })),
    ).toBe("system");
  });
  it("returns the stored value when it is a locked enum member", () => {
    expect(readAppearance(makeStorage({ [APPEARANCE_STORAGE_KEY]: "dark" }))).toBe(
      "dark",
    );
    expect(readAppearance(makeStorage({ [APPEARANCE_STORAGE_KEY]: "light" }))).toBe(
      "light",
    );
    expect(
      readAppearance(makeStorage({ [APPEARANCE_STORAGE_KEY]: "system" })),
    ).toBe("system");
  });
  it("swallows storage errors and falls back to default", () => {
    expect(readAppearance(makeThrowingStorage())).toBe("system");
  });
});

describe("writeAppearance", () => {
  it("no-ops when storage is missing", () => {
    expect(() => writeAppearance(null, "dark")).not.toThrow();
    expect(() => writeAppearance(undefined, "light")).not.toThrow();
  });
  it("persists explicit light/dark under the locked key", () => {
    const s = makeStorage();
    writeAppearance(s, "dark");
    expect(s.store.get(APPEARANCE_STORAGE_KEY)).toBe("dark");
    writeAppearance(s, "light");
    expect(s.store.get(APPEARANCE_STORAGE_KEY)).toBe("light");
  });
  it("removes the key when writing the default (system tracks OS)", () => {
    const s = makeStorage({ [APPEARANCE_STORAGE_KEY]: "dark" });
    writeAppearance(s, "system");
    expect(s.store.has(APPEARANCE_STORAGE_KEY)).toBe(false);
  });
  it("swallows storage errors (private mode is best-effort)", () => {
    expect(() => writeAppearance(makeThrowingStorage(), "dark")).not.toThrow();
    expect(() => writeAppearance(makeThrowingStorage(), "system")).not.toThrow();
  });
});

describe("resolveTheme", () => {
  it("forces light and dark regardless of OS preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("follows OS preference under system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("appearance subscribers", () => {
  beforeEach(() => {
    _resetAppearanceListenersForTests();
  });

  it("notifies every subscriber and ignores a throwing one", () => {
    const seen: string[] = [];
    subscribeAppearance(() => {
      throw new Error("boom");
    });
    subscribeAppearance((value) => {
      seen.push(value);
    });
    emitAppearance("dark");
    expect(seen).toEqual(["dark"]);
  });

  it("stops notifying after unsubscribe", () => {
    let count = 0;
    const off = subscribeAppearance(() => {
      count += 1;
    });
    emitAppearance("light");
    off();
    emitAppearance("dark");
    expect(count).toBe(1);
  });
});

describe("commitAppearance", () => {
  beforeEach(() => {
    _resetAppearanceListenersForTests();
  });

  it("writes the key, flips the theme, and fans out to other selects", () => {
    const s = makeStorage();
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    const root = {
      getAttribute: (k: string): string | null => attrs[k] ?? null,
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
      style,
    };
    const seen: string[] = [];
    subscribeAppearance((value) => seen.push(value));
    commitAppearance(s, root, "dark", false);
    expect(s.store.get(APPEARANCE_STORAGE_KEY)).toBe("dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(style.colorScheme).toBe("dark");
    expect(seen).toEqual(["dark"]);
  });

  it("resolves system against the OS preference", () => {
    const s = makeStorage({ [APPEARANCE_STORAGE_KEY]: "dark" });
    const attrs: Record<string, string> = {};
    const root = {
      getAttribute: (k: string): string | null => attrs[k] ?? null,
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
      style: { colorScheme: "" },
    };
    commitAppearance(s, root, "system", true);
    expect(s.store.has(APPEARANCE_STORAGE_KEY)).toBe(false);
    expect(attrs["data-theme"]).toBe("dark");
    commitAppearance(s, root, "system", false);
    expect(attrs["data-theme"]).toBe("light");
  });
});

describe("applyTheme", () => {
  it("no-ops when root is missing", () => {
    expect(() => applyTheme(null, "dark")).not.toThrow();
    expect(() => applyTheme(undefined, "light")).not.toThrow();
  });
  it("sets data-theme and color-scheme in one flip", () => {
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    const root = {
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
      style,
    };
    applyTheme(root, "dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(style.colorScheme).toBe("dark");
    applyTheme(root, "light");
    expect(attrs["data-theme"]).toBe("light");
    expect(style.colorScheme).toBe("light");
  });
  it("does not rewrite data-theme when the signal is already set", () => {
    let writes = 0;
    const root = {
      getAttribute: (): string => "dark",
      setAttribute: (): void => {
        writes += 1;
      },
      style: { colorScheme: "dark" },
    };
    applyTheme(root, "dark");
    expect(writes).toBe(0);
  });
});

describe("appearanceBootScript", () => {
  const script = appearanceBootScript();

  it("references the locked storage key", () => {
    expect(script).toContain('"timely.appearance"');
  });

  it("never trusts an arbitrary stored string as a class/style value", () => {
    // The script must whitelist against the enum before touching the DOM.
    expect(script).toMatch(/s\s*===\s*"light"/);
    expect(script).toMatch(/s\s*===\s*"dark"/);
    expect(script).toMatch(/s\s*===\s*"system"/);
  });

  function runScript(opts: {
    stored?: string | null;
    prefersDark?: boolean;
    storageThrows?: boolean;
    matchMediaThrows?: boolean;
  }): { theme: string | null; colorScheme: string } {
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    const html = {
      setAttribute: (k: string, v: string): void => {
        attrs[k] = v;
      },
      style,
    };
    const win: Record<string, unknown> = {
      localStorage: {
        getItem: (_k: string): string | null => {
          if (opts.storageThrows) throw new Error("blocked");
          return opts.stored ?? null;
        },
      },
      matchMedia: (_q: string) => {
        if (opts.matchMediaThrows) throw new Error("nope");
        return { matches: Boolean(opts.prefersDark) };
      },
    };
    const doc = { documentElement: html };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function("window", "document", script)(win, doc);
    return { theme: attrs["data-theme"] ?? null, colorScheme: style.colorScheme };
  }

  it("resolves system → dark when the OS prefers dark", () => {
    expect(runScript({ stored: null, prefersDark: true })).toEqual({
      theme: "dark",
      colorScheme: "dark",
    });
  });
  it("resolves system → light when the OS prefers light", () => {
    expect(runScript({ stored: null, prefersDark: false })).toEqual({
      theme: "light",
      colorScheme: "light",
    });
  });
  it("forces dark when the stored pref is dark", () => {
    expect(runScript({ stored: "dark", prefersDark: false })).toEqual({
      theme: "dark",
      colorScheme: "dark",
    });
  });
  it("forces light when the stored pref is light", () => {
    expect(runScript({ stored: "light", prefersDark: true })).toEqual({
      theme: "light",
      colorScheme: "light",
    });
  });
  it("ignores stored garbage and falls back to system + OS", () => {
    expect(runScript({ stored: "auto", prefersDark: true })).toEqual({
      theme: "dark",
      colorScheme: "dark",
    });
    expect(runScript({ stored: "AUTO", prefersDark: false })).toEqual({
      theme: "light",
      colorScheme: "light",
    });
  });
  it("falls back to light when storage throws mid-boot", () => {
    expect(runScript({ storageThrows: true, prefersDark: false })).toEqual({
      theme: "light",
      colorScheme: "light",
    });
  });
  it("recovers to light if the whole resolver blows up", () => {
    // matchMedia throws + no stored pref → outer catch must still set light.
    expect(runScript({ stored: null, matchMediaThrows: true })).toEqual({
      theme: "light",
      colorScheme: "light",
    });
  });
});
