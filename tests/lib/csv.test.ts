import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("escapes commas, quotes, newlines", () => {
    expect(csvEscape("no special")).toBe("no special");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(42)).toBe("42");
  });

  it("emits header + rows with CRLF", () => {
    const csv = toCsv(
      [
        ["1", "hello"],
        ["2", "a,b"],
      ],
      ["id", "name"],
    );
    expect(csv).toBe(`id,name\r\n1,hello\r\n2,"a,b"\r\n`);
  });

  it("emits header-only when no rows", () => {
    const csv = toCsv([], ["a", "b"]);
    expect(csv).toBe("a,b\r\n");
  });

  it("skips header if not provided", () => {
    const csv = toCsv([["x", "y"]]);
    expect(csv).toBe("x,y\r\n");
  });

  it("neutralizes leading spreadsheet formula characters with a quote", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+cmd")).toBe("'+cmd");
    expect(csvEscape("-SUM(A1)")).toBe("'-SUM(A1)");
    expect(csvEscape("@IMPORT")).toBe("'@IMPORT");
    expect(csvEscape("\tTAB")).toBe("'\tTAB");
    expect(csvEscape("\rCR")).toBe("\"'\rCR\"");
  });

  it("neutralizes formula leaders before CSV quoting", () => {
    expect(csvEscape("=1,2")).toBe("\"'=1,2\"");
    expect(csvEscape('=says "hi"')).toBe("\"'=says \"\"hi\"\"\"");
  });

  it("leaves ordinary text and numbers untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("  =not-leading-ws")).toBe("  =not-leading-ws");
    expect(csvEscape(0)).toBe("0");
  });
});
