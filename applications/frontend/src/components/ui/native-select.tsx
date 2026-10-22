import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "./utils";

/** Native <select> styled to match Input. Native keeps the iOS wheel picker on mobile. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          "border-input bg-input-background flex h-11 w-full min-w-0 appearance-none rounded-lg border pl-3 pr-9 py-2 text-base text-gray-900 outline-none transition-[color,box-shadow] md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
    </div>
  );
}

export { NativeSelect };
