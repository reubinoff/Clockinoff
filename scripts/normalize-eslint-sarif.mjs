#!/usr/bin/env node
// @microsoft/eslint-formatter-sarif writes artifact URIs as absolute
// file:// URLs (url.pathToFileURL). GitHub code scanning only maps
// results onto the repo when those URIs are repo-relative POSIX paths.
// Rewrite them in place before upload-sarif.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * @param {string} uri
 * @param {string} repoRoot
 * @returns {string}
 */
export function toRepoRelativeUri(uri, repoRoot) {
  if (typeof uri !== "string" || uri.length === 0) return uri;
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;

  let absolute;
  if (uri.startsWith("file:")) {
    absolute = fileURLToPath(uri);
  } else if (path.isAbsolute(uri)) {
    absolute = uri;
  } else {
    return uri.replaceAll("\\", "/").replace(/^\.\//, "");
  }

  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return uri;
  return relative.split(path.sep).join("/");
}

/**
 * @param {unknown} node
 * @param {string} repoRoot
 * @returns {unknown}
 */
export function normalizeSarifDocument(node, repoRoot) {
  if (Array.isArray(node)) {
    return node.map((item) => normalizeSarifDocument(item, repoRoot));
  }
  if (node === null || typeof node !== "object") return node;

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "uri" && typeof value === "string") {
      out[key] = toRepoRelativeUri(value, repoRoot);
    } else {
      out[key] = normalizeSarifDocument(value, repoRoot);
    }
  }
  return out;
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: normalize-eslint-sarif.mjs <file.sarif> [repoRoot]");
    process.exit(1);
  }
  const repoRoot = path.resolve(process.argv[3] ?? process.cwd());
  const raw = fs.readFileSync(file, "utf8");
  const normalized = normalizeSarifDocument(JSON.parse(raw), repoRoot);
  fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
}

if (isCliEntry()) main();
