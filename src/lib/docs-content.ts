// Server-side renderer for the in-app user docs.
//
// The markdown source lives under `./docs/` and is also published as a
// Jekyll / just-the-docs site (when GitHub Pages is enabled). This module
// reads the same files, strips the Jekyll-specific syntax that `marked`
// does not understand, and renders HTML for the Next `/docs/*` routes.
//
// Keeping the authoritative source as plain markdown means the GitHub
// view keeps rendering, the Jekyll build keeps working, and the Next
// app has a durable `/docs` on its own origin that does not depend on
// GitHub Pages being enabled.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

export type DocPage = {
  slug: string;
  title: string;
  navOrder: number;
  description?: string;
};

export type RenderedDocPage = DocPage & {
  html: string;
};

// Hard-coded index so the sidebar order is deterministic without having
// to parse frontmatter for every page at request time, and so a missing
// file is a build-time failure rather than a silent dropout.
export const DOC_PAGES: readonly DocPage[] = [
  { slug: "", title: "Home", navOrder: 1 },
  { slug: "getting-started", title: "Getting started", navOrder: 2 },
  { slug: "timer", title: "Using the timer", navOrder: 3 },
  { slug: "entries", title: "Time entries", navOrder: 4 },
  { slug: "projects", title: "Projects", navOrder: 5 },
  { slug: "clients", title: "Clients", navOrder: 6 },
  { slug: "tags", title: "Tags", navOrder: 7 },
  { slug: "export", title: "Export CSV & PDF", navOrder: 8 },
  { slug: "account", title: "Account & timezone", navOrder: 9 },
  { slug: "faq", title: "FAQ", navOrder: 10 },
] as const;

export function listDocPages(): readonly DocPage[] {
  return DOC_PAGES;
}

export function findDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

// The repo-root path to the markdown source. During `next build` the
// Node process cwd is the project root, and these pages are rendered
// statically (see `generateStaticParams` in the route), so the files are
// read exactly once at build time and the standalone server never
// touches them at runtime.
const DOCS_DIR = path.join(process.cwd(), "docs");

function resolveFile(slug: string): string {
  const base = slug === "" ? "index" : slug;
  return path.join(DOCS_DIR, `${base}.md`);
}

type Frontmatter = {
  title?: string;
  description?: string;
};

function parseFrontmatter(src: string): { body: string; data: Frontmatter } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!match) return { body: src, data: {} };
  const data: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "title") data.title = value;
    else if (key === "description") data.description = value;
  }
  return { body: src.slice(match[0].length), data };
}

// Transforms Jekyll / just-the-docs syntax into something `marked` can
// render as plain markdown or HTML. The transforms are deliberately
// conservative — anything we do not recognise is passed through so the
// GitHub-rendered view stays authoritative for prose.
function preprocessMarkdown(src: string): string {
  let out = src;

  // `{{ '/path' | relative_url }}` -> `/docs/path`. In the Next app the
  // docs are mounted at `/docs/*`, so a Jekyll relative URL maps to a
  // `/docs` path. The index lives at `/docs`, not `/docs/`.
  out = out.replace(
    /\{\{\s*['"]([^'"]+)['"]\s*\|\s*relative_url\s*\}\}/g,
    (_m, p: string) => {
      const trimmed = p.startsWith("/") ? p.slice(1) : p;
      return trimmed ? `/docs/${trimmed}` : "/docs";
    },
  );

  // Drop the `<details open markdown="block">…{:toc}…</details>` TOC
  // placeholder entirely — just-the-docs expands it to an auto-generated
  // table of contents; marked does not, so leaving it would render a
  // literal "- TOC" bullet.
  out = out.replace(
    /<details[^>]*markdown="block"[^>]*>[\s\S]*?\{:toc\}[\s\S]*?<\/details>\s*/g,
    "",
  );

  // Strip inline attribute lists like `{: .no_toc }` or `{: #anchor }`.
  // marked would otherwise render them as literal text.
  out = out.replace(/^\s*\{:[^}]*\}\s*$/gm, "");
  out = out.replace(/[ \t]+\{:[^}]*\}/g, "");

  // Any leftover Liquid tag is a bug in a page we have not updated yet;
  // make it obvious in the rendered output instead of swallowing it.
  // (The replace above handles the only Liquid filter the docs use.)
  return out;
}

marked.setOptions({ gfm: true, breaks: false });

// Post-process the rendered HTML so that off-site links open in a new tab,
// matching the behaviour of the Docs link in the app shell. We do this
// as a string pass instead of a custom marked renderer because the
// renderer signature is unstable across marked majors.
function openExternalLinksInNewTab(html: string): string {
  return html.replace(
    /<a\s+href="(https?:\/\/[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"',
  );
}

export function renderDocMarkdown(src: string): string {
  const { body } = parseFrontmatter(src);
  const prepared = preprocessMarkdown(body);
  const html = marked.parse(prepared, { async: false }) as string;
  return openExternalLinksInNewTab(html);
}

export function readDocPage(slug: string): RenderedDocPage | undefined {
  const page = findDocPage(slug);
  if (!page) return undefined;
  const file = resolveFile(page.slug);
  if (!existsSync(file)) return undefined;
  const src = readFileSync(file, "utf8");
  const { data } = parseFrontmatter(src);
  return {
    ...page,
    title: data.title ?? page.title,
    description: data.description ?? page.description,
    html: renderDocMarkdown(src),
  };
}
