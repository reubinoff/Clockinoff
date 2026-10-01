import { notFound } from "next/navigation";
import { listDocPages, readDocPage } from "@/lib/docs-content";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listDocPages()
    .filter((p) => p.slug !== "")
    .map((p) => ({ slug: p.slug }));
}

export default async function DocsSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<JSX.Element> {
  const { slug } = await params;
  const page = readDocPage(slug);
  if (!page) notFound();
  return (
    <div
      // The HTML comes from markdown shipped in the repo, not user input.
      dangerouslySetInnerHTML={{ __html: page.html }}
    />
  );
}
