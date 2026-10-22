import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, FileText, Info, Lightbulb, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

import { guides, type Guide } from "../../guides";
import { PageHeader } from "../common/PageHeader";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
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
        "my-4 rounded-lg border-l-4 p-3 sm:p-4 flex gap-3",
        config.bgColor,
        config.borderColor,
        config.textColor,
      )}
    >
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 min-w-0 prose-sm [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
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
    <div>
      <PageHeader
        title="Guides"
        description="Short walkthroughs that explain how to connect providers, design sessions, etc."
      />

      {/* Mobile: pick a guide from a dropdown */}
      <div className="mb-4 lg:hidden">
        <label htmlFor="guide-picker" className="sr-only">
          Choose a guide
        </label>
        <NativeSelect id="guide-picker" value={activeGuide?.slug ?? ""} onChange={(e) => setActiveSlug(e.target.value)}>
          {guides.map((guide) => (
            <option key={guide.slug} value={guide.slug}>
              {guide.title}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        {/* Desktop: searchable list */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3">
            <Input
              type="search"
              placeholder="Search guides"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <nav className="space-y-1">
              {filteredGuides.length === 0 && (
                <p className="px-3 text-sm text-gray-500">No guides match that search.</p>
              )}
              {filteredGuides.map((guide) => (
                <button
                  key={guide.slug}
                  type="button"
                  onClick={() => setActiveSlug(guide.slug)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2",
                    activeGuide?.slug === guide.slug
                      ? "bg-green-50 text-green-800"
                      : "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <FileText className="w-4 h-4 shrink-0 text-green-600" />
                  {guide.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 rounded-xl border border-gray-200 bg-white">
          {activeGuide ? (
            <article className="prose prose-sm max-w-none break-words px-4 py-5 sm:px-6 sm:py-6 prose-a:break-all prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto prose-headings:text-gray-900 prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-2 prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-green-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-strong:font-semibold prose-ul:my-4 prose-ol:my-4 prose-li:text-gray-700 prose-li:my-1 prose-code:text-green-700 prose-code:bg-green-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-l-green-500 prose-blockquote:bg-green-50/50 prose-blockquote:text-gray-700">
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
          ) : (
            <div className="py-10 text-center text-gray-500">No guides available yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
