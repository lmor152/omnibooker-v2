import { useState } from "react";
import type { BookingTask, ConfirmationStatus } from "../../types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";

const STATUS: Record<ConfirmationStatus, { label: string; className: string }> = {
  not_required: { label: "Booked", className: "bg-green-50 border-green-200 text-green-800" },
  awaiting: { label: "Needs confirming", className: "bg-amber-50 border-amber-200 text-amber-900" },
  confirmed: { label: "Kept", className: "bg-green-50 border-green-200 text-green-800" },
  auto_kept: { label: "Kept (short notice)", className: "bg-green-50 border-green-200 text-green-800" },
  cancel_pending: { label: "Cancelling…", className: "bg-slate-50 border-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-50 border-slate-200 text-slate-700" },
  cancel_failed: { label: "Cancel may have failed", className: "bg-red-50 border-red-200 text-red-800" },
  manual_cancel_required: { label: "Cancel it yourself", className: "bg-red-50 border-red-200 text-red-800" },
};

const CANCELLABLE: ConfirmationStatus[] = [
  "awaiting",
  "confirmed",
  "auto_kept",
  "not_required",
  "cancel_failed",
  "manual_cancel_required",
];

interface BookingConfirmationProps {
  task: BookingTask;
  timezone: string;
  onConfirm?: () => Promise<void>;
  onCancelBooking?: () => Promise<void>;
}

/** Booked details plus keep/cancel controls for a successful booking task. */
export function BookingConfirmation({ task, timezone, onConfirm, onCancelBooking }: BookingConfirmationProps) {
  const [busy, setBusy] = useState<"keep" | "cancel" | null>(null);
  const status = STATUS[task.confirmationStatus] ?? STATUS.not_required;
  const isUpcoming = Date.parse(withZone(task.scheduledDate)) > Date.now();

  const act = async (kind: "keep" | "cancel", action?: () => Promise<void>) => {
    if (!action) return;
    setBusy(kind);
    try {
      await action();
    } catch {
      // Dashboard surfaces the error
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`mt-3 p-3 border rounded-lg text-sm ${status.className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div>
            <span className="font-mono text-xs mr-2">#{String(task.id).padStart(4, "0")}</span>
            <span className="font-medium">{status.label}:</span>{" "}
            {[task.bookedResource, task.bookedTime && `at ${task.bookedTime}`].filter(Boolean).join(" ")}
            {task.cost != null && ` · £${task.cost.toFixed(2)}`}
          </div>
          {task.confirmationStatus === "awaiting" && task.confirmDeadlineAt && (
            <div>
              Confirm by <strong>{formatMoment(task.confirmDeadlineAt, timezone)}</strong> or it will be cancelled.
            </div>
          )}
          {task.confirmationStatus === "confirmed" && task.confirmedBy && (
            <div className="text-xs opacity-80">Kept {describeActor(task.confirmedBy)}</div>
          )}
          {task.cancelMessage && <div>{task.cancelMessage}</div>}
          {task.refundDeadlineAt && isUpcoming && CANCELLABLE.includes(task.confirmationStatus) && (
            <div className="text-xs opacity-80">
              Refundable until {formatMoment(task.refundDeadlineAt, timezone)}
            </div>
          )}
          {task.confirmationCode && <div className="text-xs opacity-80 break-all">Ref: {task.confirmationCode}</div>}
        </div>

        {isUpcoming && (
          <div className="flex items-center gap-2">
            {task.confirmationStatus === "awaiting" && onConfirm && (
              <button
                onClick={() => act("keep", onConfirm)}
                disabled={busy !== null}
                className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
              >
                {busy === "keep" ? "Keeping…" : "Keep it"}
              </button>
            )}
            {CANCELLABLE.includes(task.confirmationStatus) && onCancelBooking && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={busy !== null}
                    className="px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-60"
                  >
                    {busy === "cancel" ? "Cancelling…" : "Cancel booking"}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cancels {task.bookedResource ?? "the booking"} with the provider. It's only cancelled
                      automatically while it can still be refunded; otherwise you'll be asked to cancel it yourself.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={() => act("cancel", onCancelBooking)}>
                      Cancel booking
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function withZone(value: string): string {
  // The API may return naive UTC strings; treat them as UTC.
  return /[Z+]|-\d\d:\d\d$/.test(value) ? value : `${value}Z`;
}

function formatMoment(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(withZone(value)));
}

function describeActor(actor: string): string {
  if (actor === "web") return "from the web app";
  if (actor.startsWith("discord:")) return "from Discord";
  if (actor === "assistant") return "by the assistant";
  return "";
}
