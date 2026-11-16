import { useEffect, useState, type ReactNode } from "react";
import type { BookingTask } from "../../types";
import { dayKeyOf, toTime } from "../../lib/datetime";
import { cn } from "../../components/ui/utils";
import type { DayMark } from "./taskModel";

/** Re-render every `intervalMs` so relative times ("in 5h") stay current. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const byScheduled = (a: BookingTask, b: BookingTask) => toTime(a.scheduledDate) - toTime(b.scheduledDate);

/** Tasks grouped by local day, in the order given. */
export function groupByDay(tasks: BookingTask[]): [string, BookingTask[]][] {
  const groups = new Map<string, BookingTask[]>();
  for (const task of tasks) {
    const key = dayKeyOf(task.scheduledDate);
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  return [...groups.entries()];
}

export function DayDot({ mark, className }: { mark: DayMark; className?: string }) {
  if (!mark) return <span className={cn("block h-1.5 w-1.5", className)} />;
  return (
    <span
      className={cn(
        "block h-1.5 w-1.5 rounded-full",
        mark === "attention" && "bg-amber-500",
        mark === "booked" && "bg-green-600",
        mark === "attempt" && "border border-blue-400 bg-white",
        mark === "other" && "bg-gray-300",
        className,
      )}
    />
  );
}

export function SectionHeading({ children, count, id }: { children: ReactNode; count?: number; id?: string }) {
  return (
    <h3 id={id} className="mb-2 flex scroll-mt-40 items-baseline gap-2 text-sm font-semibold text-gray-700">
      {children}
      {count != null && <span className="font-normal text-gray-400">{count}</span>}
    </h3>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">{children}</p>;
}
