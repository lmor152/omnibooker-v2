import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BookingTask } from "../../types";
import { useData } from "../../app/data";
import { addDays, dayKey, startOfDay, startOfWeek } from "../../lib/datetime";
import { cn } from "../../components/ui/utils";
import { DayLabel } from "./AgendaView";
import { BookingRow } from "./BookingRow";
import { useTaskActions } from "./TaskActions";
import { dayMark } from "./taskModel";
import { byScheduled, DayDot, EmptyNote, groupByDay, SectionHeading, useNow } from "./shared";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** A month grid with a dot per day; tap a day to list what's on it. */
export function MonthView() {
  const { tasks: storeTasks, fetchTaskRange } = useData();
  const { getTask, remember } = useTaskActions();
  const now = useNow(60_000);
  const today = startOfDay(new Date(now));
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today));
  const [monthTasks, setMonthTasks] = useState<BookingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const gridStart = startOfWeek(month);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTaskRange(month, nextMonth)
      .then((loaded) => {
        if (cancelled) return;
        setMonthTasks(loaded);
        remember(loaded);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load this month"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // storeTasks: reload when the store changes (e.g. after keeping or skipping something).
  }, [month.getTime(), storeTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show each task's latest state (actions update the store / remembered tasks, not this snapshot).
  const current = useMemo(
    () => monthTasks.map((t) => getTask(t.id)).filter((t): t is BookingTask => Boolean(t)).sort(byScheduled),
    [getTask, monthTasks],
  );
  const byDay = useMemo(() => new Map(groupByDay(current)), [current]);
  const selectedTasks = byDay.get(selected) ?? [];

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    const isThisMonth = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth();
    setSelected(dayKey(isThisMonth ? today : next));
  };

  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Drop a trailing week that's entirely next month.
  const visible = cells.slice(0, cells[35].getMonth() === month.getMonth() ? 42 : 35);

  return (
    <div>
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-base font-semibold text-gray-900">
            {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            {loading && <span className="ml-2 text-xs font-normal text-gray-400">Loading…</span>}
          </h3>
          <button type="button" onClick={() => shiftMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-gray-400">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {visible.map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === month.getMonth();
            const isSelected = key === selected;
            const mark = dayMark(byDay.get(key) ?? [], now);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-sm tabular-nums transition-colors",
                  inMonth ? "text-gray-800 hover:bg-gray-50" : "text-gray-300",
                  key === dayKey(today) && !isSelected && "font-bold text-green-700",
                  isSelected && "bg-green-600 font-semibold text-white hover:bg-green-600",
                )}
              >
                {date.getDate()}
                <DayDot mark={mark} className={cn(isSelected && mark === "booked" && "bg-white")} />
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
          <Legend mark="booked" label="Booked" />
          <Legend mark="attempt" label="Will book" />
          <Legend mark="attention" label="Needs you" />
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section className="mt-5">
        <SectionHeading>
          <DayLabel dayKey={selected} now={now} />
        </SectionHeading>
        {selectedTasks.length === 0 ? (
          <EmptyNote>Nothing on this day.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((task) => (
              <BookingRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Legend({ mark, label }: { mark: "booked" | "attempt" | "attention"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <DayDot mark={mark} />
      {label}
    </span>
  );
}
