import { notFound } from "next/navigation";
import { readDocPage } from "@/lib/docs-content";

export const dynamic = "force-static";

export default function DocsIndexPage(): JSX.Element {
  const page = readDocPage("");
  if (!page) notFound();
  return (
    <div
      // The HTML comes from markdown shipped in the repo, not user input.
      dangerouslySetInnerHTML={{ __html: page.html }}
    />
  );
}
