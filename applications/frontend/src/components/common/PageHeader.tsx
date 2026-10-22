import type { ReactNode } from "react";

/** Title row shared by every dashboard tab. The description is desktop-only to save space on phones. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-gray-800 sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 hidden text-gray-600 sm:block">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
