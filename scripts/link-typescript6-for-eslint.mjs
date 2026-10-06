// typescript-eslint loads `typescript` via Node resolution and rejects 7.0,
// which ships no compiler API. Nest the 6.0 API package where that require
// looks first so the root `typescript` dependency can stay on 7.0's `tsc`.
import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const linkPath = join(
  "node_modules",
  "eslint-config-next",
  "node_modules",
  "typescript",
);
const target = join("..", "..", "@typescript", "typescript6");

function ensureLink(link, dest) {
  mkdirSync(dirname(link), { recursive: true });
  try {
    if (lstatSync(link).isSymbolicLink() && readlinkSync(link) === dest) return;
  } catch {
    // Missing link is the common case.
  }
  rmSync(link, { recursive: true, force: true });
  symlinkSync(dest, link);
}

ensureLink(linkPath, target);
// Hoisted `ts-api-utils` (pulled in by typescript-eslint) also
// `require`s `typescript`. Nest the 6.0 API there too; the root copy
// stays TypeScript 7, which has no compiler API.
ensureLink(
  join("node_modules", "ts-api-utils", "node_modules", "typescript"),
  join("..", "..", "@typescript", "typescript6"),
);
// `@typescript/typescript6` depends on `@typescript/old` (the TS 6 package),
// which also publishes a `tsc` bin and can overwrite `node_modules/.bin/tsc`.
// Typecheck and Next must keep using TypeScript 7.
ensureLink(
  join("node_modules", ".bin", "tsc"),
  join("..", "typescript", "bin", "tsc"),
);
