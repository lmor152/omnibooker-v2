import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { cn } from "../ui/utils";

/**
 * A titled group of fields. When `collapsible`, it folds away behind its heading and shows `summary`
 * while closed. Collapsed content is unmounted, so never put `required` fields in a collapsed section.
 */
export function FormSection({
  title,
  description,
  summary,
  collapsible = false,
  defaultOpen = true,
  divider = true,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  divider?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapper = cn(divider && "border-t border-gray-200 pt-5 first:border-t-0 first:pt-0");

  if (!collapsible) {
    return (
      <section className={wrapper}>
        <div className="mb-4">
          <h4 className="text-base font-semibold text-gray-800">{title}</h4>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className={wrapper}>
        <CollapsibleTrigger className="-mx-1 flex w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
          <span className="min-w-0">
            <span className="block text-base font-semibold text-gray-800">{title}</span>
            {!open && summary && <span className="mt-0.5 block truncate text-sm text-gray-500">{summary}</span>}
            {open && description && <span className="mt-0.5 block text-sm text-gray-500">{description}</span>}
          </span>
          <ChevronDown
            className={cn("mt-0.5 h-5 w-5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
