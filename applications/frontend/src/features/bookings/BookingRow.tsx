import type { MouseEvent } from "react";
import { AlertTriangle, CalendarCheck2, CalendarClock, CalendarX2, Loader2, Undo2 } from "lucide-react";
import type { BookingTask } from "../../types";
import { openOverlay } from "../../app/router";
import { formatMoment, formatMoney, formatRelative, formatTime, toTime } from "../../lib/datetime";
import { cn } from "../../components/ui/utils";
import { ACTION_LABELS, busyLabel, useTaskActions } from "./TaskActions";
import { kindLabel, kindTone, taskActions, taskKind, type TaskAction, type Tone } from "./taskModel";

export const TONE_CHIP: Record<Tone, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-50 text-blue-700",
  gray: "bg-gray-100 text-gray-600",
};

export function StatusChip({ task }: { task: BookingTask }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", TONE_CHIP[kindTone(task)])}>
      {kindLabel(task)}
    </span>
  );
}

/** The line under the session name: what was booked, when we'll try, or what went wrong. */
export function taskSummary(task: BookingTask, now = Date.now()): string {
  const kind = taskKind(task);
  const booked = [task.bookedResource, task.cost != null ? formatMoney(task.cost, task.currency) : null]
    .filter(Boolean)
    .join(" · ");
  switch (kind) {
    case "attempt":
      if (!task.attemptAt) return "Waiting to book";
      return toTime(task.attemptAt) <= now
        ? "Booking shortly"
        : `Books ${formatRelative(task.attemptAt, now)} · ${formatMoment(task.attemptAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}`;
    case "booking_now":
      return "Trying to book now…";
    case "needs_confirming":
      return [booked, task.confirmDeadlineAt && `Confirm ${formatRelative(task.confirmDeadlineAt, now)}`]
        .filter(Boolean)
        .join(" · ");
    case "failed":
      return `Booking attempt failed: ${task.errorMessage || "no reason given"}`;
    case "skipped":
      return "You skipped this date";
    case "cancel_problem":
      return task.cancelMessage || "Check this booking with the provider";
    default:
      return booked || (task.status === "success" ? "Booked" : "");
  }
}

const ICONS = {
  green: CalendarCheck2,
  amber: AlertTriangle,
  red: CalendarX2,
  blue: CalendarClock,
  gray: CalendarClock,
};

const ICON_TONE: Record<Tone, string> = {
  green: "text-green-600",
  amber: "text-amber-600",
  red: "text-red-600",
  blue: "text-blue-500",
  gray: "text-gray-400",
};

/** Buttons shown directly on a row, without opening it. */
const INLINE: TaskAction[] = ["keep", "cancel_booking", "retry", "skip", "undo_skip"];

export function BookingRow({
  task,
  showDate = false,
  inlineActions,
}: {
  task: BookingTask;
  /** Show the date as well as the time (for lists not grouped by day). */
  showDate?: boolean;
  /** Which actions get inline buttons. Defaults to the quick ones for the task's state. */
  inlineActions?: TaskAction[];
}) {
  const { perform, busy, slotFor } = useTaskActions();
  const slot = slotFor(task);
  const kind = taskKind(task);
  const tone = kindTone(task);
  const Icon = kind === "booking_now" ? Loader2 : kind === "skipped" ? Undo2 : ICONS[tone];
  const busyAction = busy(task.id);
  const allowed = taskActions(task);

  // Cancel-booking is only inline when a decision is due; otherwise it's tucked into the detail sheet.
  const defaults = kind === "needs_confirming" || kind === "cancel_problem" ? INLINE : INLINE.filter((a) => a !== "cancel_booking");
  const buttons = allowed.filter((a) => (inlineActions ?? defaults).includes(a));
  const muted = kind === "skipped" || kind === "booking_cancelled";

  const act = (action: TaskAction) => (event: MouseEvent) => {
    event.stopPropagation();
    perform(task, action);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openOverlay(`/bookings/${task.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openOverlay(`/bookings/${task.id}`);
        }
      }}
      className={cn(
        "block w-full cursor-pointer rounded-xl border bg-white p-3 text-left transition-colors hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
        tone === "amber" ? "border-amber-300 bg-amber-50/40" : tone === "red" && !muted ? "border-red-200" : "border-gray-200",
        muted && "bg-gray-50",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 pt-0.5 text-center">
          <div className={cn("text-sm font-semibold tabular-nums", muted ? "text-gray-400" : "text-gray-900")}>
            {task.bookedTime || formatTime(task.scheduledDate)}
          </div>
          <Icon className={cn("mx-auto mt-1 h-4 w-4", ICON_TONE[tone], kind === "booking_now" && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn("truncate font-medium", muted ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900")}>
              {slot?.name ?? "Unknown session"}
            </h4>
            <StatusChip task={task} />
          </div>
          {showDate && (
            <p className="text-sm text-gray-700">{formatMoment(task.scheduledDate, Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>
          )}
          <p className={cn("text-sm break-words", tone === "red" && !muted ? "text-red-700" : "text-gray-500")}>
            {taskSummary(task)}
          </p>
        </div>
      </div>

      {buttons.length > 0 && (
        <div className="mt-2.5 flex gap-2 pl-[3.75rem]">
          {buttons.map((action) => {
            const primary = action === "keep" || action === "retry";
            const danger = action === "cancel_booking";
            return (
              <button
                key={action}
                type="button"
                onClick={act(action)}
                disabled={busyAction !== null}
                className={cn(
                  "h-9 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60",
                  primary
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : danger
                      ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {busyAction === action ? busyLabel(action) : ACTION_LABELS[action]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
