import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { BookingSlot, BookingTask, Provider } from "../../types";
import { useData } from "../../app/data";
import { formatMoment, formatRelative, withZone } from "../../lib/datetime";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import type { TaskAction } from "./taskModel";

/**
 * Runs booking actions from anywhere on the Bookings page: one place for busy state, confirmation
 * prompts and success/error toasts, so rows in every view and the detail sheet all behave the same.
 */

interface TaskActionsValue {
  perform: (task: BookingTask, action: TaskAction) => void;
  busy: (taskId: number) => TaskAction | null;
  slotFor: (task: BookingTask) => BookingSlot | undefined;
  providerFor: (task: BookingTask) => Provider | undefined;
  /** A task by id, from the main store or from ranges loaded by History/Month. */
  getTask: (id: number) => BookingTask | undefined;
  /** Make tasks loaded outside the main store (older history) available to the detail sheet. */
  remember: (tasks: BookingTask[]) => void;
}

const TaskActionsContext = createContext<TaskActionsValue | null>(null);

export function useTaskActions(): TaskActionsValue {
  const value = useContext(TaskActionsContext);
  if (!value) throw new Error("useTaskActions must be used inside <TaskActionsProvider>");
  return value;
}

export const ACTION_LABELS: Record<TaskAction, string> = {
  keep: "Keep it",
  cancel_booking: "Cancel booking",
  skip: "Skip",
  book_now: "Book now",
  retry: "Retry",
  undo_skip: "Undo skip",
  delete: "Delete",
};

const BUSY_LABELS: Record<TaskAction, string> = {
  keep: "Keeping…",
  cancel_booking: "Cancelling…",
  skip: "Skipping…",
  book_now: "Booking…",
  retry: "Retrying…",
  undo_skip: "Restoring…",
  delete: "Deleting…",
};

export const busyLabel = (action: TaskAction) => BUSY_LABELS[action];

interface PendingConfirm {
  task: BookingTask;
  action: TaskAction;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const [busyMap, setBusyMap] = useState<Record<number, TaskAction>>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [remembered, setRemembered] = useState<Map<number, BookingTask>>(() => new Map());
  const storeById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const getTask = useCallback((id: number) => storeById.get(id) ?? remembered.get(id), [remembered, storeById]);
  const remember = useCallback((tasks: BookingTask[]) => {
    setRemembered((prev) => {
      const next = new Map(prev);
      tasks.forEach((t) => next.set(t.id, t));
      return next;
    });
  }, []);
  const forget = useCallback((id: number) => {
    setRemembered((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const slotById = useMemo(() => new Map(data.slots.map((s) => [s.id, s])), [data.slots]);
  const providerById = useMemo(() => new Map(data.providers.map((p) => [p.id, p])), [data.providers]);
  const slotFor = useCallback((task: BookingTask) => slotById.get(task.bookingSlotId), [slotById]);
  const providerFor = useCallback(
    (task: BookingTask) => {
      const slot = slotById.get(task.bookingSlotId);
      return slot ? providerById.get(slot.providerId) : undefined;
    },
    [providerById, slotById],
  );

  const execute = useCallback(
    async (task: BookingTask, action: TaskAction) => {
      const name = slotById.get(task.bookingSlotId)?.name ?? "Booking";
      setBusyMap((prev) => ({ ...prev, [task.id]: action }));
      try {
        switch (action) {
          case "keep":
            remember([await data.keepBooking(task.id)]);
            toast.success(`Kept ${name}`);
            break;
          case "cancel_booking": {
            const updated = await data.cancelBooking(task.id);
            remember([updated]);
            if (updated.confirmationStatus === "cancelled") toast.success(`Cancelled ${name}`, { description: updated.cancelMessage ?? undefined });
            else toast.warning(`Couldn't cancel ${name} automatically`, { description: updated.cancelMessage ?? undefined });
            break;
          }
          case "skip":
            remember([await data.skipTask(task.id)]);
            toast.success(`Skipped ${name}`, { description: "It won't be booked on that date." });
            break;
          case "undo_skip":
            remember([await data.reactivateTask(task.id)]);
            toast.success(`${name} is back on`);
            break;
          case "retry": {
            const updated = await data.reactivateTask(task.id);
            remember([updated]);
            toast.success(`Retrying ${name}`, {
              description: updated.attemptAt ? `Next attempt ${formatRelative(updated.attemptAt)}.` : undefined,
            });
            break;
          }
          case "book_now": {
            const updated = await data.bookNow(task.id);
            remember([updated]);
            toast.success(`Booked ${name}`, {
              description: [updated.bookedResource, updated.bookedTime].filter(Boolean).join(" at ") || undefined,
            });
            break;
          }
          case "delete":
            await data.deleteTask(task.id);
            forget(task.id);
            toast.success("Deleted");
            break;
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      } finally {
        setBusyMap((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
      }
    },
    [data, forget, remember, slotById],
  );

  const perform = useCallback(
    (task: BookingTask, action: TaskAction) => {
      const slot = slotById.get(task.bookingSlotId);
      const tz = slot?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const when = formatMoment(task.scheduledDate, tz);
      if (action === "cancel_booking") {
        setConfirm({
          task,
          action,
          title: "Cancel this booking?",
          description: `This cancels ${[task.bookedResource, when].filter(Boolean).join(", ")} with the provider. It's only cancelled automatically while it can still be refunded; otherwise you'll be asked to cancel it yourself.`,
          confirmLabel: "Cancel booking",
          cancelLabel: "Keep it",
          destructive: true,
        });
      } else if (action === "book_now") {
        setConfirm({
          task,
          action,
          title: "Try to book now?",
          description: `This tries to book ${slot?.name ?? "this session"} for ${when} straight away${
            task.attemptAt ? ` instead of ${formatRelative(task.attemptAt)}` : ""
          }. If bookings for that date haven't opened yet it will fail.`,
          confirmLabel: "Book now",
          cancelLabel: "Not now",
          destructive: false,
        });
      } else if (action === "retry") {
        const provider = slot ? data.providers.find((p) => p.id === slot.providerId) : undefined;
        const opened = task.attemptAt && Date.parse(withZone(task.attemptAt)) <= Date.now();
        setConfirm({
          task,
          action,
          title: "Try booking again?",
          description: `${
            opened ? "Booking for this date is already open, so this tries again straight away" : "This tries again when booking opens"
          }${task.attemptAt ? ` (${formatMoment(task.attemptAt, tz)})` : ""}. If you think the last attempt actually went through, check ${
            provider?.name ?? "the provider"
          } first so you don't book twice.`,
          confirmLabel: "Try again",
          cancelLabel: "Not now",
          destructive: false,
        });
      } else if (action === "delete") {
        setConfirm({
          task,
          action,
          title: "Delete this from your history?",
          description: "This only removes it from the app. It doesn't cancel anything with the provider.",
          confirmLabel: "Delete",
          cancelLabel: "Keep",
          destructive: true,
        });
      } else {
        execute(task, action);
      }
    },
    [data.providers, execute, slotById],
  );

  const value = useMemo<TaskActionsValue>(
    () => ({ perform, busy: (id) => busyMap[id] ?? null, slotFor, providerFor, getTask, remember }),
    [busyMap, getTask, perform, providerFor, remember, slotFor],
  );

  return (
    <TaskActionsContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={confirm?.cancelLabel}
        destructive={confirm?.destructive}
        onConfirm={() => confirm && execute(confirm.task, confirm.action)}
      />
    </TaskActionsContext.Provider>
  );
}
