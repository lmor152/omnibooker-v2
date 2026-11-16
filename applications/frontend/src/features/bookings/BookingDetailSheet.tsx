import { useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { BookingTask } from "../../types";
import { closeOverlay, navigate } from "../../app/router";
import { deviceTimezone, formatMoment, formatMoney, formatRelative, toTime } from "../../lib/datetime";
import { FormSheet } from "../../components/common/FormSheet";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import { StatusChip, TONE_CHIP } from "./BookingRow";
import { ACTION_LABELS, busyLabel, useTaskActions } from "./TaskActions";
import { taskActions, taskKind, type TaskAction } from "./taskModel";

const ACTOR: Record<string, string> = { web: "in the app", auto: "automatically", assistant: "by the assistant" };
const describeActor = (actor: string) => (actor.startsWith("discord:") ? "in Discord" : ACTOR[actor] ?? actor);

/** Everything about one booking, plus every action available for it. Opened at #/bookings/:id. */
export function BookingDetailSheet({ taskId }: { taskId: number }) {
  const { getTask } = useTaskActions();
  const task = getTask(taskId);
  const close = () => closeOverlay("/bookings");

  if (!task) {
    return (
      <FormSheet title="Booking" onClose={close}>
        <p className="text-sm text-gray-600">This booking isn't loaded. It may have been deleted, or it's older than the history you've opened.</p>
      </FormSheet>
    );
  }
  return <Detail task={task} onClose={close} />;
}

function Detail({ task, onClose }: { task: BookingTask; onClose: () => void }) {
  const { perform, busy, slotFor, providerFor } = useTaskActions();
  const [copied, setCopied] = useState(false);
  const slot = slotFor(task);
  const provider = providerFor(task);
  const tz = deviceTimezone();
  const sessionTz = slot?.timezone;
  const kind = taskKind(task);
  const actions = taskActions(task);
  const busyAction = busy(task.id);
  const now = Date.now();

  const when = (value: string) => {
    const relative = formatRelative(value, now);
    return `${formatMoment(value, tz)} (${relative})`;
  };

  const copyCode = async () => {
    if (!task.confirmationCode) return;
    try {
      await navigator.clipboard.writeText(task.confirmationCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code is selectable anyway.
    }
  };

  const rows: [string, ReactNode][] = [];
  rows.push(["When", formatMoment(task.scheduledDate, tz)]);
  if (sessionTz && sessionTz !== tz) rows.push(["Local time", `${formatMoment(task.scheduledDate, sessionTz)} (${sessionTz})`]);
  if (task.bookedResource) rows.push(["Court", task.bookedResource]);
  if (task.bookedTime) rows.push(["Booked time", task.bookedTime]);
  if (task.cost != null) rows.push(["Cost", formatMoney(task.cost, task.currency)]);
  if (task.confirmationCode)
    rows.push([
      "Reference",
      <button type="button" onClick={copyCode} className="inline-flex items-center gap-1.5 font-mono text-gray-900 hover:text-green-700">
        <span className="select-all break-all">{task.confirmationCode}</span>
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-400" />}
      </button>,
    ]);
  rows.push(["Provider", provider?.name ?? "Unknown provider"]);
  if (task.status === "pending" && task.attemptAt) rows.push(["Books at", when(task.attemptAt)]);
  if (task.attemptedAt) rows.push(["Attempted", formatMoment(task.attemptedAt, tz)]);
  if (task.confirmedAt && task.confirmedBy && task.confirmationStatus === "confirmed")
    rows.push(["Kept", `${formatMoment(task.confirmedAt, tz)}, ${describeActor(task.confirmedBy)}`]);
  if (task.cancelledAt) rows.push(["Cancelled", formatMoment(task.cancelledAt, tz)]);
  rows.push(["ID", `#${String(task.id).padStart(4, "0")}`]);

  const primary = actions.filter((a) => a !== "delete");
  const showDeadline = kind === "needs_confirming" && task.confirmDeadlineAt;
  const urgent = showDeadline && toTime(task.confirmDeadlineAt!) - now < 2 * 3_600_000;
  const showRefund =
    task.refundDeadlineAt && task.status === "success" && actions.includes("cancel_booking") && toTime(task.refundDeadlineAt) > now;

  return (
    <FormSheet
      title={slot?.name ?? "Booking"}
      description={formatMoment(task.scheduledDate, tz)}
      onClose={onClose}
      footer={
        primary.length > 0 ? (
          <div className="flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
            {primary.map((action) => (
              <ActionButton key={action} action={action} busy={busyAction} onClick={() => perform(task, action)} />
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <StatusChip task={task} />
          {kind === "attempt" && task.attemptAt && toTime(task.attemptAt) > now && (
            <span className="text-sm text-gray-600">Books {formatRelative(task.attemptAt, now)}</span>
          )}
        </div>

        {showDeadline && (
          <Callout tone={urgent ? "red" : "amber"}>
            Keep it by <strong>{formatMoment(task.confirmDeadlineAt!, tz)}</strong> ({formatRelative(task.confirmDeadlineAt!, now)}), or
            it will be cancelled while it can still be refunded.
          </Callout>
        )}
        {kind === "failed" && task.errorMessage && <Callout tone="red">{task.errorMessage}</Callout>}
        {task.cancelMessage && <Callout tone={kind === "cancel_problem" ? "red" : "gray"}>{task.cancelMessage}</Callout>}
        {kind === "failed" && actions.includes("retry") && (
          <p className="text-sm text-gray-600">Retry puts it back in the queue. If booking has already opened for this date it's tried again within a minute.</p>
        )}

        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-gray-500">{label}</dt>
              <dd className="min-w-0 break-words text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
        {showRefund && <p className="text-sm text-gray-600">Refundable if cancelled before {when(task.refundDeadlineAt!)}.</p>}

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {slot && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/sessions?edit=${slot.id}`, { replace: true })}
            >
              <ExternalLink className="h-4 w-4" />
              Edit session
            </Button>
          )}
          {actions.includes("delete") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={busyAction !== null}
              onClick={() => perform(task, "delete")}
            >
              {busyAction === "delete" ? busyLabel("delete") : "Delete from history"}
            </Button>
          )}
        </div>
      </div>
    </FormSheet>
  );
}

function ActionButton({ action, busy, onClick }: { action: TaskAction; busy: TaskAction | null; onClick: () => void }) {
  const variant = action === "cancel_booking" ? "destructive" : action === "keep" || action === "retry" || action === "undo_skip" ? "default" : "outline";
  return (
    <Button type="button" size="lg" variant={variant} disabled={busy !== null} onClick={onClick}>
      {busy === action ? busyLabel(action) : ACTION_LABELS[action]}
    </Button>
  );
}

function Callout({ tone, children }: { tone: "amber" | "red" | "gray"; children: ReactNode }) {
  return <div className={cn("rounded-lg p-3 text-sm", TONE_CHIP[tone])}>{children}</div>;
}
