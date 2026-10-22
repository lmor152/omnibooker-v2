import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CalendarMinus,
  CalendarSync,
  CalendarX2,
  ChevronDown,
  Filter,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { BookingTask, BookingSlot, Provider } from "../../types";
import { deviceTimezone, formatMoment } from "../../lib/datetime";
import { ActionMenu, type ActionMenuItem } from "../common/ActionMenu";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Field } from "../common/Field";
import { FormSheet, FormSheetActions } from "../common/FormSheet";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { cn } from "../ui/utils";
import { BookingConfirmation } from "./BookingConfirmation";

interface UpcomingTasksProps {
  bookingTasks: BookingTask[];
  bookingSlots: BookingSlot[];
  providers: Provider[];
  onCancelTask: (taskId: number) => Promise<void>;
  onReactivateTask: (taskId: number) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
  onExecuteTask: (taskId: number) => Promise<void>;
  onConfirmBooking: (taskId: number) => Promise<void>;
  onCancelBooking: (taskId: number) => Promise<void>;
}

type StatusFilter = "all" | "pending" | "booked" | "failed" | "cancelled";

export function UpcomingTasks({
  bookingTasks,
  bookingSlots,
  providers,
  onCancelTask,
  onReactivateTask,
  onDeleteTask,
  onConfirmBooking,
  onCancelBooking,
}: UpcomingTasksProps) {
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterSession, setFilterSession] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Apply filters
  const filteredTasks = bookingTasks.filter((task) => {
    // Provider filter
    if (filterProvider !== "all") {
      const slot = bookingSlots.find((s) => s.id === task.bookingSlotId);
      if (slot?.providerId !== parseInt(filterProvider)) return false;
    }

    // Session filter
    if (filterSession !== "all") {
      if (task.bookingSlotId !== parseInt(filterSession)) return false;
    }

    // Date range filter
    const taskDate = new Date(task.scheduledDate);
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      if (taskDate < fromDate) return false;
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (taskDate > toDate) return false;
    }

    return true;
  });

  const sortedTasks = [...filteredTasks].sort(
    (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  );

  const pendingTasks = sortedTasks.filter((task) => task.status === "pending");
  const processingTasks = sortedTasks.filter((task) => task.status === "processing");
  const awaitingTasks = sortedTasks.filter(
    (task) => task.status === "success" && task.confirmationStatus === "awaiting",
  );
  const completedTasks = sortedTasks.filter(
    (task) => task.status === "success" && task.confirmationStatus !== "awaiting",
  );
  const failedTasks = sortedTasks.filter((task) => task.status === "failed");
  const cancelledTasks = sortedTasks.filter((task) => task.status === "cancelled");
  // Most recent first for history sections
  const recentCompleted = [...completedTasks].reverse();
  const recentCancelled = [...cancelledTasks].reverse();

  const clearFilters = () => {
    setFilterProvider("all");
    setFilterSession("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const activeFilterCount = [filterProvider !== "all", filterSession !== "all", filterDateFrom, filterDateTo].filter(
    Boolean,
  ).length;

  const show = (status: StatusFilter) => statusFilter === "all" || statusFilter === status;
  const toggleStatus = (status: StatusFilter) => setStatusFilter((prev) => (prev === status ? "all" : status));

  const findSlot = (task: BookingTask) => bookingSlots.find((s) => s.id === task.bookingSlotId);
  const renderTask = (task: BookingTask) => {
    const slot = findSlot(task);
    const isActionable = task.status === "pending" || task.status === "failed" || task.status === "cancelled";
    return (
      <TaskCard
        key={task.id}
        task={task}
        slot={slot}
        provider={providers.find((p) => p.id === slot?.providerId)}
        onCancel={task.status === "pending" ? () => onCancelTask(task.id) : undefined}
        onReactivate={
          task.status === "failed" || task.status === "cancelled" ? () => onReactivateTask(task.id) : undefined
        }
        onDelete={isActionable && task.status !== "pending" ? () => onDeleteTask(task.id) : undefined}
        onConfirmBooking={() => onConfirmBooking(task.id)}
        onCancelBooking={() => onCancelBooking(task.id)}
      />
    );
  };

  const activeFilterChips: { label: string; clear: () => void }[] = [
    filterProvider !== "all" && {
      label: providers.find((p) => p.id === parseInt(filterProvider))?.name ?? "Provider",
      clear: () => setFilterProvider("all"),
    },
    filterSession !== "all" && {
      label: bookingSlots.find((s) => s.id === parseInt(filterSession))?.name ?? "Session",
      clear: () => setFilterSession("all"),
    },
    filterDateFrom && {
      label: `From ${new Date(filterDateFrom).toLocaleDateString("en-GB")}`,
      clear: () => setFilterDateFrom(""),
    },
    filterDateTo && {
      label: `To ${new Date(filterDateTo).toLocaleDateString("en-GB")}`,
      clear: () => setFilterDateTo(""),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div>
      <PageHeader
        title="Upcoming Tasks"
        description="Each booking session creates a task for every upcoming date. Cancel a task if you don't want that booking made."
        actions={
          <button
            onClick={() => setShowFilters(true)}
            className={cn(
              "relative flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              activeFilterCount > 0
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
            aria-label="Filter tasks"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
          </button>
        }
      />

      {/* Status counts double as quick filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusChip
          label="Pending"
          count={pendingTasks.length + processingTasks.length}
          active={statusFilter === "pending"}
          onClick={() => toggleStatus("pending")}
          tone="blue"
        />
        <StatusChip
          label="Booked"
          count={awaitingTasks.length + completedTasks.length}
          active={statusFilter === "booked"}
          onClick={() => toggleStatus("booked")}
          tone="green"
        />
        <StatusChip
          label="Failed"
          count={failedTasks.length}
          active={statusFilter === "failed"}
          onClick={() => toggleStatus("failed")}
          tone="red"
        />
        <StatusChip
          label="Cancelled"
          count={cancelledTasks.length}
          active={statusFilter === "cancelled"}
          onClick={() => toggleStatus("cancelled")}
          tone="gray"
        />
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {activeFilterChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-green-100 py-1 pl-3 pr-1 text-green-800"
            >
              <span className="truncate">{chip.label}</span>
              <button
                onClick={chip.clear}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-green-200"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <span className="text-gray-500">
            {filteredTasks.length} of {bookingTasks.length}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {show("booked") && awaitingTasks.length > 0 && (
          <TaskSection title="Needs your confirmation" count={awaitingTasks.length}>
            {awaitingTasks.map(renderTask)}
          </TaskSection>
        )}

        {show("pending") && pendingTasks.length > 0 && (
          <TaskSection title="Pending" count={pendingTasks.length}>
            {pendingTasks.map(renderTask)}
          </TaskSection>
        )}

        {show("pending") && processingTasks.length > 0 && (
          <TaskSection title="Processing" count={processingTasks.length}>
            {processingTasks.map(renderTask)}
          </TaskSection>
        )}

        {show("failed") && failedTasks.length > 0 && (
          <TaskSection title="Failed" count={failedTasks.length}>
            {failedTasks.map(renderTask)}
          </TaskSection>
        )}

        {show("booked") && completedTasks.length > 0 && (
          <TaskSection
            title="Booked"
            count={completedTasks.length}
            collapsible
            defaultOpen={statusFilter === "booked"}
            limit={10}
          >
            {recentCompleted.map(renderTask)}
          </TaskSection>
        )}

        {show("cancelled") && cancelledTasks.length > 0 && (
          <TaskSection
            title="Cancelled"
            count={cancelledTasks.length}
            collapsible
            defaultOpen={statusFilter === "cancelled"}
            limit={10}
          >
            {recentCancelled.map(renderTask)}
          </TaskSection>
        )}
      </div>

      {bookingTasks.length === 0 && (
        <div className="text-center py-12 px-4 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1 text-gray-800">No booking tasks yet</h3>
          <p className="text-gray-600">Create a booking session to start seeing scheduled tasks here.</p>
        </div>
      )}

      {showFilters && (
        <FormSheet
          title="Filter tasks"
          onClose={() => setShowFilters(false)}
          onSubmit={(event) => {
            event.preventDefault();
            setShowFilters(false);
          }}
          footer={
            <FormSheetActions>
              <Button type="button" variant="outline" size="lg" onClick={clearFilters} disabled={activeFilterCount === 0}>
                Clear all
              </Button>
              <Button type="submit" size="lg">
                Show {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
              </Button>
            </FormSheetActions>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider" htmlFor="filter-provider">
              <NativeSelect id="filter-provider" value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)}>
                <option value="all">All providers</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Booking session" htmlFor="filter-session">
              <NativeSelect id="filter-session" value={filterSession} onChange={(e) => setFilterSession(e.target.value)}>
                <option value="all">All sessions</option>
                {bookingSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="From date" htmlFor="filter-from">
              <Input id="filter-from" type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </Field>
            <Field label="To date" htmlFor="filter-to">
              <Input id="filter-to" type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </Field>
          </div>
        </FormSheet>
      )}
    </div>
  );
}

const CHIP_TONES = {
  blue: { idle: "border-blue-200 bg-blue-50 text-blue-800", active: "border-blue-600 bg-blue-600 text-white" },
  green: { idle: "border-green-200 bg-green-50 text-green-800", active: "border-green-600 bg-green-600 text-white" },
  red: { idle: "border-red-200 bg-red-50 text-red-800", active: "border-red-600 bg-red-600 text-white" },
  gray: { idle: "border-gray-200 bg-gray-50 text-gray-700", active: "border-gray-600 bg-gray-600 text-white" },
};

function StatusChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: keyof typeof CHIP_TONES;
}) {
  if (count === 0 && !active) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? CHIP_TONES[tone].active : CHIP_TONES[tone].idle,
      )}
    >
      <span className="font-bold tabular-nums">{count}</span>
      {label}
    </button>
  );
}

function TaskSection({
  title,
  count,
  collapsible = false,
  defaultOpen = true,
  limit,
  children,
}: {
  title: string;
  count: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
  limit?: number;
  children: ReactNode[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const visible = limit && !showAll ? children.slice(0, limit) : children;

  const heading = (
    <>
      <span className="text-base font-semibold text-gray-800">{title}</span>
      <span className="text-sm font-normal text-gray-500">{count}</span>
    </>
  );

  return (
    <section>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="mb-3 flex w-full items-center gap-2 text-left"
        >
          {heading}
          <ChevronDown className={cn("ml-auto h-5 w-5 text-gray-400 transition-transform", open && "rotate-180")} />
        </button>
      ) : (
        <h3 className="mb-3 flex items-center gap-2">{heading}</h3>
      )}
      {open && (
        <>
          <div className="space-y-3">{visible}</div>
          {limit && children.length > limit && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="mt-3 h-10 w-full rounded-lg text-sm font-medium text-green-700 hover:bg-green-50"
            >
              {showAll ? "Show fewer" : `Show all ${children.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const STATUS_STYLE: Record<string, { icon: LucideIcon; background: string }> = {
  pending: { icon: CalendarClock, background: "bg-blue-500" },
  processing: { icon: CalendarSync, background: "bg-indigo-500" },
  success: { icon: CalendarCheck2, background: "bg-emerald-500" },
  failed: { icon: CalendarX2, background: "bg-rose-500" },
  cancelled: { icon: CalendarMinus, background: "bg-slate-500" },
};

function TaskCard({
  task,
  slot,
  provider,
  onCancel,
  onReactivate,
  onDelete,
  onConfirmBooking,
  onCancelBooking,
}: {
  task: BookingTask;
  slot?: BookingSlot;
  provider?: Provider;
  onCancel?: () => Promise<void>;
  onReactivate?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onConfirmBooking?: () => Promise<void>;
  onCancelBooking?: () => Promise<void>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const style = STATUS_STYLE[task.status] ?? STATUS_STYLE.pending;
  const StateIcon = style.icon;
  const timezone = slot?.timezone || deviceTimezone();
  const showTimezone = timezone !== deviceTimezone();
  const hasError = Boolean(task.errorMessage && task.errorMessage.trim().toLowerCase() !== "slot was deactivated");

  const run = (action?: () => Promise<void>) => () => {
    action?.().catch(() => null); // Dashboard surfaces the error
  };

  const menuItems: ActionMenuItem[] = [
    onReactivate && { label: "Reactivate", icon: RotateCcw, onSelect: run(onReactivate) },
    onCancel && { label: "Cancel task", icon: XCircle, onSelect: run(onCancel), destructive: true },
    onDelete && { label: "Delete", icon: Trash2, onSelect: () => setConfirmingDelete(true), destructive: true },
  ].filter(Boolean) as ActionMenuItem[];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div
          className={`${style.background} w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transform -rotate-6`}
        >
          <StateIcon className="w-5 h-5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-gray-800 truncate">{slot?.name || "Unknown session"}</h4>
          <p className="text-sm text-gray-600">{formatMoment(task.scheduledDate, timezone)}</p>
        </div>

        {menuItems.length > 0 && <ActionMenu items={menuItems} />}
      </div>

      {hasError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 break-words">
          {task.errorMessage}
        </div>
      )}

      {/* Booked details */}
      {task.status === "success" && (task.bookedTime || task.bookedResource) && (
        <BookingConfirmation
          task={task}
          timezone={timezone}
          onConfirm={onConfirmBooking}
          onCancelBooking={onCancelBooking}
        />
      )}

      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        aria-expanded={showDetails}
        className="mt-2 -mb-1 flex h-8 items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        Details
        <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
      </button>
      {showDetails && (
        <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Books at</dt>
          <dd className="text-gray-800">{formatMoment(task.attemptAt || task.scheduledDate, timezone)}</dd>
          {task.attemptedAt && (
            <>
              <dt className="text-gray-500">Attempted</dt>
              <dd className="text-gray-800">{formatMoment(task.attemptedAt, timezone)}</dd>
            </>
          )}
          <dt className="text-gray-500">Provider</dt>
          <dd className="text-gray-800 truncate">{provider?.name || "Unknown provider"}</dd>
          {showTimezone && (
            <>
              <dt className="text-gray-500">Timezone</dt>
              <dd className="text-gray-800">{timezone}</dd>
            </>
          )}
        </dl>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this task?"
        description="It will be removed from your task list."
        confirmLabel="Delete"
        onConfirm={run(onDelete)}
      />
    </div>
  );
}
