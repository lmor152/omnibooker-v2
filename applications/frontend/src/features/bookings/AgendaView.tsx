import { useMemo, useState } from "react";
import type { BookingTask } from "../../types";
import { useData } from "../../app/data";
import { addDays, dayKey, formatDayHeading, fromDayKey, startOfDay, startOfWeek, toTime } from "../../lib/datetime";
import { cn } from "../../components/ui/utils";
import { BookingRow } from "./BookingRow";
import { dayMark } from "./taskModel";
import { byScheduled, DayDot, EmptyNote, groupByDay, SectionHeading, useNow } from "./shared";

const WEEKS_IN_STRIP = 6;

/** Week strip + day-by-day list of everything from today onwards. */
export function AgendaView() {
  const { tasks } = useData();
  const now = useNow(60_000);
  const today = startOfDay(new Date(now));
  const [selected, setSelected] = useState(() => dayKey(today));

  const upcoming = useMemo(
    () => tasks.filter((t) => toTime(t.scheduledDate) >= today.getTime()).sort(byScheduled),
    [tasks, today.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const days = useMemo(() => groupByDay(upcoming), [upcoming]);
  const byDay = useMemo(() => new Map(days), [days]);

  const jumpTo = (key: string) => {
    setSelected(key);
    // Scroll to that day, or the next day that has something on.
    const target = days.find(([day]) => day >= key)?.[0];
    if (!target) return;
    document.getElementById(`agenda-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <WeekStrip start={startOfWeek(today)} today={dayKey(today)} selected={selected} byDay={byDay} onSelect={jumpTo} now={now} />

      <div className="mt-4 space-y-5">
        {days.length === 0 && <EmptyNote>Nothing scheduled from today. Add a session to start booking.</EmptyNote>}
        {days.map(([key, items]) => (
          <section key={key}>
            <SectionHeading id={`agenda-${key}`}>
              <DayLabel dayKey={key} now={now} />
            </SectionHeading>
            <div className="space-y-2">
              {items.map((task) => (
                <BookingRow key={task.id} task={task} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** "Tomorrow  Tue 18 Nov", or just "Sat 22 Nov" when there's no friendlier name. */
export function DayLabel({ dayKey: key, now }: { dayKey: string; now: number }) {
  const label = formatDayHeading(key, new Date(now));
  const date = fromDayKey(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <>
      {label}
      {label !== date && <span className="font-normal text-gray-400">{date}</span>}
    </>
  );
}

function WeekStrip({
  start,
  today,
  selected,
  byDay,
  onSelect,
  now,
}: {
  start: Date;
  today: string;
  selected: string;
  byDay: Map<string, BookingTask[]>;
  onSelect: (key: string) => void;
  now: number;
}) {
  const weeks = Array.from({ length: WEEKS_IN_STRIP }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );

  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] snap-x snap-mandatory sm:mx-0 sm:px-0">
      <div className="flex w-max gap-3">
        {weeks.map((week) => (
          <div
            key={dayKey(week[0])}
            className="grid w-[calc(100vw-2rem)] max-w-xl shrink-0 snap-start grid-cols-7 gap-1 rounded-xl border border-gray-200 bg-white p-1.5"
          >
            {week.map((date) => {
              const key = dayKey(date);
              const isPast = key < today;
              const mark = isPast ? null : dayMark(byDay.get(key) ?? [], now);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  disabled={isPast}
                  aria-label={formatDayHeading(key)}
                  aria-pressed={key === selected}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
                    isPast ? "text-gray-300" : "text-gray-700 hover:bg-gray-50",
                    key === selected && !isPast && "bg-green-600 text-white hover:bg-green-600",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase opacity-70">
                    {date.toLocaleDateString("en-GB", { weekday: "narrow" })}
                  </span>
                  <span className={cn("text-sm font-semibold tabular-nums", key === today && key !== selected && "text-green-700")}>
                    {date.getDate()}
                  </span>
                  <DayDot mark={mark} className={key === selected && mark === "booked" ? "bg-white" : undefined} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
