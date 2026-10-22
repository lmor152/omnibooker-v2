import { useState } from "react";
import type { BookingTask, ConfirmationStatus } from "../../types";
import { formatMoment, withZone } from "../../lib/datetime";
import { ConfirmDialog } from "../common/ConfirmDialog";

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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
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

  const canKeep = task.confirmationStatus === "awaiting" && onConfirm;
  const canCancel = CANCELLABLE.includes(task.confirmationStatus) && onCancelBooking;
  const footnote = [
    `#${String(task.id).padStart(4, "0")}`,
    task.confirmationStatus === "confirmed" && task.confirmedBy && `Kept ${describeActor(task.confirmedBy)}`,
    task.confirmationCode && `Ref ${task.confirmationCode}`,
  ].filter(Boolean);

  return (
    <div className={`mt-3 p-3 border rounded-lg text-sm ${status.className}`}>
      <div className="space-y-1 min-w-0">
        <div className="break-words">
          <span className="font-medium">{status.label}:</span>{" "}
          {[task.bookedResource, task.bookedTime && `at ${task.bookedTime}`].filter(Boolean).join(" ")}
          {task.cost != null && ` · £${task.cost.toFixed(2)}`}
        </div>
        {task.confirmationStatus === "awaiting" && task.confirmDeadlineAt && (
          <div>
            Confirm by <strong>{formatMoment(task.confirmDeadlineAt, timezone)}</strong> or it will be cancelled.
          </div>
        )}
        {task.cancelMessage && <div>{task.cancelMessage}</div>}
        {task.refundDeadlineAt && isUpcoming && CANCELLABLE.includes(task.confirmationStatus) && (
          <div className="text-xs opacity-80">Refundable until {formatMoment(task.refundDeadlineAt, timezone)}</div>
        )}
        {footnote.length > 0 && <div className="text-xs opacity-70 break-all">{footnote.join(" · ")}</div>}
      </div>

      {isUpcoming && (canKeep || canCancel) && (
        <div className="mt-3 flex gap-2">
          {canKeep && (
            <button
              onClick={() => act("keep", onConfirm)}
              disabled={busy !== null}
              className="flex-1 sm:flex-none h-10 px-4 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {busy === "keep" ? "Keeping…" : "Keep it"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => setConfirmingCancel(true)}
              disabled={busy !== null}
              className="flex-1 sm:flex-none h-10 px-4 text-sm font-medium text-red-700 bg-white/70 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-60"
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel booking"}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="Cancel this booking?"
        description={`This cancels ${task.bookedResource ?? "the booking"} with the provider. It's only cancelled automatically while it can still be refunded; otherwise you'll be asked to cancel it yourself.`}
        cancelLabel="Keep it"
        confirmLabel="Cancel booking"
        onConfirm={() => act("cancel", onCancelBooking)}
      />
    </div>
  );
}

function describeActor(actor: string): string {
  if (actor === "web") return "from the web app";
  if (actor.startsWith("discord:")) return "from Discord";
  if (actor === "assistant") return "by the assistant";
  return "";
}
