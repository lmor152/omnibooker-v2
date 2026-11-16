import { useEffect, useMemo, useState } from "react";
import type { BookingTask } from "../../types";
import { useData } from "../../app/data";
import { addDays, startOfDay, toTime } from "../../lib/datetime";
import { NativeSelect } from "../../components/ui/native-select";
import { cn } from "../../components/ui/utils";
import { DayLabel } from "./AgendaView";
import { BookingRow } from "./BookingRow";
import { useTaskActions } from "./TaskActions";
import { taskKind, type TaskKind } from "./taskModel";
import { EmptyNote, groupByDay, SectionHeading, useNow } from "./shared";

const PAGE_DAYS = 90;

type Filter = "all" | "booked" | "failed" | "skipped" | "cancelled";

const FILTERS: { value: Filter; label: string; kinds: TaskKind[] }[] = [
  { value: "all", label: "All", kinds: [] },
  { value: "booked", label: "Booked", kinds: ["booked", "needs_confirming", "cancelling", "cancel_problem"] },
  { value: "failed", label: "Failed", kinds: ["failed"] },
  { value: "skipped", label: "Skipped", kinds: ["skipped"] },
  { value: "cancelled", label: "Cancelled", kinds: ["booking_cancelled"] },
];

/** Everything that has already happened, newest first, loaded 90 days at a time. */
export function HistoryView() {
  const { slots, fetchTaskRange, tasks: storeTasks } = useData();
  const { getTask, remember } = useTaskActions();
  const now = useNow(60_000);
  const [pages, setPages] = useState(1);
  const [loaded, setLoaded] = useState<BookingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sessionId, setSessionId] = useState<string>("all");

  const until = useMemo(() => addDays(startOfDay(new Date()), 1), []);
  const from = addDays(until, -PAGE_DAYS * pages);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTaskRange(from, until)
      .then((tasks) => {
        if (cancelled) return;
        setLoaded(tasks);
        remember(tasks);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load history"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pages, storeTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const kinds = FILTERS.find((f) => f.value === filter)!.kinds;
  const items = useMemo(
    () =>
      loaded
        .map((t) => getTask(t.id))
        .filter((t): t is BookingTask => Boolean(t))
        .filter((t) => toTime(t.scheduledDate) <= now)
        .filter((t) => sessionId === "all" || t.bookingSlotId === Number(sessionId))
        .filter((t) => kinds.length === 0 || kinds.includes(taskKind(t)))
        .sort((a, b) => toTime(b.scheduledDate) - toTime(a.scheduledDate)),
    [getTask, kinds, loaded, now, sessionId],
  );
  const days = useMemo(() => groupByDay(items), [items]);

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === f.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {slots.length > 1 && (
          <NativeSelect aria-label="Session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="all">All sessions</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="space-y-5">
        {!loading && days.length === 0 && <EmptyNote>Nothing in the last {PAGE_DAYS * pages} days.</EmptyNote>}
        {days.map(([key, dayItems]) => (
          <section key={key}>
            <SectionHeading>
              <DayLabel dayKey={key} now={now} />
            </SectionHeading>
            <div className="space-y-2">
              {dayItems.map((task) => (
                <BookingRow key={task.id} task={task} inlineActions={[]} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPages((p) => p + 1)}
        disabled={loading}
        className="mt-5 h-11 w-full rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 disabled:text-gray-400"
      >
        {loading ? "Loading…" : `Show older (before ${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`}
      </button>
    </div>
  );
}
