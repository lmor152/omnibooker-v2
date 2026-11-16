import type { BookingTask, ConfirmationStatus } from "../../types";
import { toTime } from "../../lib/datetime";

/**
 * The booking page's rules in one place: what a task means to the user and what they can do with it.
 *
 * A task is one dated occurrence of a session. Its `status` tracks the booking *attempt*
 * (pending → processing → success | failed, or cancelled = skipped), and once it succeeds its
 * `confirmationStatus` tracks the *booking* (awaiting a keep/cancel decision, kept, cancelled…).
 */
export type TaskKind =
  | "attempt" // pending: we'll try to book it at attemptAt
  | "booking_now" // processing
  | "needs_confirming" // booked, waiting for keep/cancel
  | "booked" // booked and kept (or no confirmation needed)
  | "cancelling" // cancel requested with the provider
  | "booking_cancelled" // booked, then cancelled with the provider
  | "cancel_problem" // provider cancel failed or must be done by hand
  | "failed" // attempt failed
  | "skipped"; // the user skipped this date (or the session was paused)

export type TaskAction = "keep" | "cancel_booking" | "skip" | "book_now" | "retry" | "undo_skip" | "delete";

const CANCELLABLE: ConfirmationStatus[] = [
  "awaiting",
  "confirmed",
  "auto_kept",
  "not_required",
  "cancel_failed",
  "manual_cancel_required",
];

export function taskKind(task: BookingTask): TaskKind {
  switch (task.status) {
    case "pending":
      return "attempt";
    case "processing":
      return "booking_now";
    case "failed":
      return "failed";
    case "cancelled":
      return "skipped";
    case "success":
      switch (task.confirmationStatus) {
        case "awaiting":
          return "needs_confirming";
        case "cancel_pending":
          return "cancelling";
        case "cancelled":
          return "booking_cancelled";
        case "cancel_failed":
        case "manual_cancel_required":
          return "cancel_problem";
        default:
          return "booked";
      }
  }
}

export const isUpcoming = (task: BookingTask, now = Date.now()) => toTime(task.scheduledDate) > now;

/** Things the user should look at now, shown above everything else. */
export function needsAttention(task: BookingTask, now = Date.now()): boolean {
  if (!isUpcoming(task, now)) return false;
  const kind = taskKind(task);
  return kind === "needs_confirming" || kind === "cancel_problem" || kind === "failed";
}

/** What the user can do with a task right now, most important first. */
export function taskActions(task: BookingTask, now = Date.now()): TaskAction[] {
  const upcoming = isUpcoming(task, now);
  const kind = taskKind(task);
  const actions: TaskAction[] = [];

  if (upcoming) {
    if (kind === "needs_confirming") actions.push("keep");
    if (task.status === "success" && CANCELLABLE.includes(task.confirmationStatus)) actions.push("cancel_booking");
    if (kind === "attempt") actions.push("skip", "book_now");
    if (kind === "failed") actions.push("retry");
    if (kind === "skipped") actions.push("undo_skip");
  }

  // Tidy up history. Upcoming bookings that are still on can't be deleted, so they're never lost track of.
  const finished = kind === "failed" || kind === "skipped" || kind === "booking_cancelled";
  if (finished || (task.status === "success" && !upcoming)) actions.push("delete");

  return actions;
}

/** Short label for the status chip. */
export function kindLabel(task: BookingTask): string {
  switch (taskKind(task)) {
    case "attempt":
      return "Scheduled";
    case "booking_now":
      return "Booking…";
    case "needs_confirming":
      return "Needs confirming";
    case "booked":
      if (task.confirmationStatus === "confirmed") return "Kept";
      if (task.confirmationStatus === "auto_kept") return "Kept";
      return "Booked";
    case "cancelling":
      return "Cancelling…";
    case "booking_cancelled":
      return "Cancelled";
    case "cancel_problem":
      return task.confirmationStatus === "manual_cancel_required" ? "Cancel it yourself" : "Cancel may have failed";
    case "failed":
      return "Not booked";
    case "skipped":
      return "Skipped";
  }
}

export type Tone = "green" | "amber" | "red" | "blue" | "gray";

export function kindTone(task: BookingTask): Tone {
  switch (taskKind(task)) {
    case "booked":
      return "green";
    case "needs_confirming":
      return "amber";
    case "failed":
    case "cancel_problem":
      return "red";
    case "attempt":
    case "booking_now":
      return "blue";
    default:
      return "gray";
  }
}

/** Calendar dot style for a day: the most important task on it wins. */
export type DayMark = "attention" | "booked" | "attempt" | "other" | null;

export function dayMark(tasks: BookingTask[], now = Date.now()): DayMark {
  if (tasks.length === 0) return null;
  if (tasks.some((t) => needsAttention(t, now))) return "attention";
  if (tasks.some((t) => taskKind(t) === "booked" || taskKind(t) === "cancelling")) return "booked";
  if (tasks.some((t) => taskKind(t) === "attempt" || taskKind(t) === "booking_now")) return "attempt";
  return "other"; // only skipped, failed in the past or cancelled
}
