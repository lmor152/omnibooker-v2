import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, BookOpenCheck, FileText, Info, Lightbulb, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

import { guides, type Guide } from "../../guides";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../ui/utils";

// Remark plugin to transform directives into custom components
function remarkAdmonitions() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      if (
        node.type === "containerDirective" ||
        node.type === "leafDirective" ||
        node.type === "textDirective"
      ) {
        const data = node.data || (node.data = {});
        const tagName = node.type === "textDirective" ? "span" : "div";

        data.hName = tagName;
        data.hProperties = {
          ...node.attributes,
          className: `admonition admonition-${node.name}`,
          "data-admonition-type": node.name,
        };
      }
    });
  };
}

type AdmonitionType = "note" | "tip" | "important" | "warning" | "caution";

const admonitionConfig: Record<
  AdmonitionType,
  { icon: React.ElementType; bgColor: string; borderColor: string; textColor: string; iconColor: string }
> = {
  note: {
    icon: Info,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-900",
    iconColor: "text-blue-600",
  },
  tip: {
    icon: Lightbulb,
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    textColor: "text-green-900",
    iconColor: "text-green-600",
  },
  important: {
    icon: Zap,
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    textColor: "text-purple-900",
    iconColor: "text-purple-600",
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    textColor: "text-yellow-900",
    iconColor: "text-yellow-600",
  },
  caution: {
    icon: AlertCircle,
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-900",
    iconColor: "text-red-600",
  },
};

function Admonition({
  type,
  children,
}: {
  type: AdmonitionType;
  children: React.ReactNode;
}) {
  const config = admonitionConfig[type] || admonitionConfig.note;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "my-4 rounded-lg border-l-4 p-4 flex gap-3",
        config.bgColor,
        config.borderColor,
        config.textColor,
      )}
    >
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 prose-sm [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

export function GuidesTab() {
  const [search, setSearch] = useState("");
  const [activeSlug, setActiveSlug] = useState(guides[0]?.slug ?? "");

  const filteredGuides = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return guides;
    }

    return guides.filter((guide) =>
      [guide.title, guide.content].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [search]);

  const activeGuide: Guide | undefined = filteredGuides.find((guide) => guide.slug === activeSlug) ?? filteredGuides[0];

  useEffect(() => {
    if (!filteredGuides.length) {
      setActiveSlug("");
      return;
    }

    const isActiveVisible = filteredGuides.some((guide) => guide.slug === activeSlug);
    if (!isActiveVisible) {
      setActiveSlug(filteredGuides[0].slug);
    }
  }, [filteredGuides, activeSlug]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-widest text-green-600 font-semibold">Guides</p>
        <h2 className="text-3xl font-semibold text-gray-900 flex items-center gap-2">
          <BookOpenCheck className="w-7 h-7 text-green-600" />
          How to use Bookie Monster
        </h2>
        <p className="text-gray-600">
          Short walkthroughs that explain how to connect providers, design sessions, etc.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Browse guides</CardTitle>
            <CardDescription>Search tips or select a guide</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="search"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white"
            />
            <ScrollArea className="max-h-[420px] pr-2">
              <div className="space-y-1">
                {filteredGuides.length === 0 && (
                  <p className="text-sm text-muted-foreground">No guides match that search.</p>
                )}
                {filteredGuides.map((guide) => (
                  <button
                    key={guide.slug}
                    type="button"
                    onClick={() => setActiveSlug(guide.slug)}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-all",
                      activeGuide?.slug === guide.slug
                        ? "border-green-500 bg-green-50/80 text-green-900 shadow-sm"
                        : "border-transparent bg-white text-gray-800 hover:border-green-200 hover:bg-green-50/60",
                    )}
                  >
                    <span className="text-sm font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-500" />
                      {guide.title}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-green-100 overflow-hidden">
          <CardContent className="p-0">
            {activeGuide ? (
              <ScrollArea className="h-[700px]">
                <article className="prose prose-sm max-w-none px-6 py-6 prose-headings:text-gray-900 prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-2 prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-green-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-strong:font-semibold prose-ul:my-4 prose-ol:my-4 prose-li:text-gray-700 prose-li:my-1 prose-code:text-green-700 prose-code:bg-green-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-l-green-500 prose-blockquote:bg-green-50/50 prose-blockquote:text-gray-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkDirective, remarkAdmonitions]}
                    components={{
                      div: ({ node, className, children, ...props }: any) => {
                        if (className?.includes("admonition")) {
                          const type = (props as any)["data-admonition-type"] as AdmonitionType;
                          return <Admonition type={type}>{children}</Admonition>;
                        }
                        return <div className={className} {...props}>{children}</div>;
                      },
                    }}
                  >
                    {activeGuide.content}
                  </ReactMarkdown>
                </article>
              </ScrollArea>
            ) : (
              <div className="py-10 text-center text-muted-foreground">No guides available yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
