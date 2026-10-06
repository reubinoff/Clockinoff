import { describe, expect, it } from "vitest";
import {
  DOC_PAGES,
  findDocPage,
  listDocPages,
  readDocPage,
  renderDocMarkdown,
} from "@/lib/docs-content";

describe("docs-content", () => {
  describe("listDocPages / findDocPage", () => {
    it("exposes every markdown page shipped under /docs", () => {
      const pages = listDocPages();
      const slugs = pages.map((p) => p.slug);
      expect(slugs).toEqual([
        "",
        "getting-started",
        "timer",
        "entries",
        "projects",
        "clients",
        "tags",
        "reports",
        "export",
        "account",
        "faq",
      ]);
      expect(pages).toBe(DOC_PAGES);
    });

    it("sorts navOrder monotonically starting at 1", () => {
      const orders = listDocPages().map((p) => p.navOrder);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it("looks up pages by slug and returns undefined for unknown slugs", () => {
      expect(findDocPage("getting-started")?.title).toBe("Getting started");
      expect(findDocPage("")?.title).toBe("Home");
      expect(findDocPage("not-a-page")).toBeUndefined();
    });
  });

  describe("renderDocMarkdown", () => {
    it("strips YAML frontmatter before rendering", () => {
      const html = renderDocMarkdown(
        "---\ntitle: Example\ndescription: 'quoted'\n---\n# Hello\n",
      );
      expect(html).toContain("<h1>Hello</h1>");
      expect(html).not.toContain("---");
      expect(html).not.toContain("title:");
    });

    it("tolerates a document without frontmatter", () => {
      const html = renderDocMarkdown("# Just a heading\n\nBody text.\n");
      expect(html).toContain("<h1>Just a heading</h1>");
      expect(html).toContain("<p>Body text.</p>");
    });

    it("resolves Jekyll relative_url links into /docs paths", () => {
      const html = renderDocMarkdown(
        "See [the timer page]({{ '/timer' | relative_url }}).",
      );
      expect(html).toContain('href="/docs/timer"');
      expect(html).not.toContain("relative_url");
    });

    it("maps the root relative_url to /docs with no trailing slash", () => {
      const html = renderDocMarkdown(
        "Back to [home]({{ '/' | relative_url }}).",
      );
      expect(html).toContain('href="/docs"');
    });

    it("strips the just-the-docs auto-TOC block entirely", () => {
      const src =
        "# Title\n{: .no_toc }\n\n<details open markdown=\"block\">\n  <summary>On this page</summary>\n\n- TOC\n{:toc}\n</details>\n\n## Section";
      const html = renderDocMarkdown(src);
      expect(html).not.toContain("TOC");
      expect(html).not.toContain("{:toc}");
      expect(html).not.toContain("no_toc");
      expect(html).toContain("<h1>Title</h1>");
      expect(html).toContain("<h2>Section</h2>");
    });

    it("escapes decoded numeric character references in text", () => {
      const html = renderDocMarkdown(
        "&#60;script&#62;alert(1)&#60;/script&#62;\n",
      );
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).not.toContain("<script>");
    });

    it("marks external links as new-tab with noopener", () => {
      const html = renderDocMarkdown(
        "[GitHub](https://github.com/reubinoff/Clockinoff) and [local](/app)",
      );
      expect(html).toContain(
        'href="https://github.com/reubinoff/Clockinoff" target="_blank" rel="noopener noreferrer"',
      );
      expect(html).toContain('href="/app"');
      // Internal links keep their default navigation (no new-tab).
      expect(html).not.toMatch(/href="\/app"[^>]*target="_blank"/);
    });
  });

  describe("readDocPage", () => {
    it("renders the home page with its guide heading", () => {
      const page = readDocPage("");
      expect(page).toBeDefined();
      expect(page!.title).toBe("Home");
      expect(page!.html).toContain("Clockinoff user guide");
      expect(page!.html).not.toContain("{{ '/getting-started'");
    });

    it("renders every known slug without throwing", () => {
      for (const p of listDocPages()) {
        const rendered = readDocPage(p.slug);
        expect(rendered, `slug=${p.slug}`).toBeDefined();
        expect(rendered!.html.length, `slug=${p.slug}`).toBeGreaterThan(0);
        expect(rendered!.html).not.toContain("{:toc}");
        expect(rendered!.html).not.toContain("relative_url");
      }
    });

    it("prefers the frontmatter title when present", () => {
      const page = readDocPage("getting-started");
      expect(page!.title).toBe("Getting started");
    });

    it("returns undefined for an unknown slug", () => {
      expect(readDocPage("does-not-exist")).toBeUndefined();
    });
  });
});
