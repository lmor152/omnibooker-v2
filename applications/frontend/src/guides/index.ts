export interface Guide {
  slug: string;
  title: string;
  content: string;
  order: number;
}

const rawGuides = import.meta.glob<string>("./*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const headingRegex = /^#\s+(.+)$/m;

function extractTitle(markdown: string, fallback: string) {
  const match = markdown.match(headingRegex);
  return match ? match[1].trim() : fallback;
}

function parseOrder(filename: string) {
  const [maybeNumber] = filename.split("-");
  const parsed = Number(maybeNumber);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export const guides: Guide[] = Object.entries(rawGuides)
  .map(([path, content]) => {
    const filename = path.split("/").pop() ?? "guide.md";
    const order = parseOrder(filename.replace(/\.md$/, ""));
    const slug = filename
      .replace(/\.md$/, "")
      .replace(/^\d+-/, "")
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();

    return {
      slug,
      order,
      content,
      title: extractTitle(content, slug.replace(/-/g, " ")),
    } satisfies Guide;
  })
  .sort((a, b) => a.order - b.order);

export const getGuideBySlug = (slug: string) => guides.find((guide) => guide.slug === slug);
