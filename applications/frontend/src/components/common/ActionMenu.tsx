import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** "⋯" button that tucks a card's secondary actions into a menu. Destructive items are listed last. */
export function ActionMenu({ items, label = "More actions" }: { items: ActionMenuItem[]; label?: string }) {
  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);

  const renderItem = (item: ActionMenuItem) => {
    const Icon = item.icon;
    return (
      <DropdownMenuItem
        key={item.label}
        onSelect={item.onSelect}
        disabled={item.disabled}
        variant={item.destructive ? "destructive" : "default"}
        className={`min-h-10 gap-3 rounded-md px-3 text-sm ${item.destructive ? "text-red-600 focus:bg-red-50 focus:text-red-700" : "text-gray-700"}`}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {item.label}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
        {regular.map(renderItem)}
        {regular.length > 0 && destructive.length > 0 && <DropdownMenuSeparator className="my-1 bg-gray-100" />}
        {destructive.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
