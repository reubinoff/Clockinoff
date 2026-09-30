import { describe, expect, it } from "vitest";
import {
  PASSWORD_COPY,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "@/lib/password";

describe("validatePassword", () => {
  it("accepts a reasonable 12+ char passphrase", () => {
    expect(validatePassword("correct-horse-battery")).toEqual({ ok: true });
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1) + "b")).toEqual({
      ok: true,
    });
  });

  it("rejects non-string input as too short", () => {
    for (const bad of [undefined, null, 12345, {}, []]) {
      expect(validatePassword(bad)).toEqual({
        ok: false,
        reason: "too_short",
        message: PASSWORD_COPY.tooShort,
      });
    }
  });

  it("rejects short passwords with the too-short copy", () => {
    expect(validatePassword("short")).toEqual({
      ok: false,
      reason: "too_short",
      message: PASSWORD_COPY.tooShort,
    });
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toMatchObject({
      reason: "too_short",
    });
  });

  it("rejects overly long inputs as weak", () => {
    expect(validatePassword("a1".repeat(500))).toMatchObject({ reason: "too_weak" });
  });

  it("rejects a single-character repeat like aaaaaaaaaaaa", () => {
    expect(validatePassword("aaaaaaaaaaaa")).toEqual({
      ok: false,
      reason: "too_weak",
      message: PASSWORD_COPY.tooWeak,
    });
    expect(validatePassword("############")).toMatchObject({ reason: "too_weak" });
  });

  it("rejects the classic trivial-passwords list case-insensitively", () => {
    for (const pw of [
      "password1234",
      "PASSWORD1234",
      "123456789012",
      "abcdefghijkl",
      "qwertyuiopas",
      "letmeinletmein",
    ]) {
      expect(validatePassword(pw)).toMatchObject({ reason: "too_weak" });
    }
  });

  it("rejects short-unit repeats like ababababab…", () => {
    expect(validatePassword("abababababab")).toMatchObject({ reason: "too_weak" });
    expect(validatePassword("xyzxyzxyzxyzxyz")).toMatchObject({ reason: "too_weak" });
  });

  it("rejects monotonic runs of characters", () => {
    // 12 chars, monotonic ascending letters; not in the trivial list.
    expect(validatePassword("mnopqrstuvwx")).toMatchObject({ reason: "too_weak" });
    // Same shape, descending.
    expect(validatePassword("xwvutsrqponm")).toMatchObject({ reason: "too_weak" });
  });

  it("does not fall back to an upper/number/symbol checklist", () => {
    // A long, lowercase-only passphrase with no digits or symbols is valid —
    // Dana + Ariel explicitly rejected the classic checklist.
    expect(validatePassword("chatterbox marches quietly")).toEqual({ ok: true });
    expect(validatePassword("purpleelephantsdream")).toEqual({ ok: true });
  });
});
