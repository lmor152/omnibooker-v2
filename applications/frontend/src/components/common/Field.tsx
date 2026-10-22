import type { ReactNode } from "react";
import { cn } from "../ui/utils";

/** Label + control + hint, with consistent spacing across every form. */
export function Field({
  label,
  htmlFor,
  required,
  optional,
  hint,
  disabled,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className={cn("mb-1.5 block text-sm font-medium", disabled ? "text-gray-400" : "text-gray-700")}
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {optional && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/** A label/description on the left with a switch (or other small control) on the right. */
export function ToggleRow({
  label,
  description,
  htmlFor,
  disabled,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className={cn("block text-sm font-medium", disabled ? "text-gray-400" : "text-gray-800")}>
          {label}
        </label>
        {description && <p className={cn("text-sm", disabled ? "text-gray-400" : "text-gray-600")}>{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
