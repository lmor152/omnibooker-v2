import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CalendarMinus,
  CalendarSync,
  CalendarX2,
  Clock,
  XCircle,
  CheckCircle,
  AlertCircle,
  Filter,
  X,
} from "lucide-react";
import type { BookingTask, BookingSlot, Provider } from "../../types";

interface UpcomingTasksProps {
  bookingTasks: BookingTask[];
  bookingSlots: BookingSlot[];
  providers: Provider[];
  onCancelTask: (taskId: number) => Promise<void>;
  onReactivateTask: (taskId: number) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
  onExecuteTask: (taskId: number) => Promise<void>;
}

export function UpcomingTasks({
  bookingTasks,
  bookingSlots,
  providers,
  onCancelTask,
  onReactivateTask,
  onDeleteTask,
  onExecuteTask,
}: UpcomingTasksProps) {
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterSession, setFilterSession] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
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
  const completedTasks = sortedTasks.filter((task) => task.status === "success");
  const failedTasks = sortedTasks.filter((task) => task.status === "failed");
  const cancelledTasks = sortedTasks.filter((task) => task.status === "cancelled");

  const clearFilters = () => {
    setFilterProvider("all");
    setFilterSession("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasActiveFilters = filterProvider !== "all" || filterSession !== "all" || filterDateFrom || filterDateTo;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Upcoming Booking Tasks</h2>
            <p className="text-gray-600">
              Manage your scheduled bookings. Cancel individual tasks if you don't want a specific
              booking to be made.
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
              hasActiveFilters || showFilters
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Filter className="w-5 h-5" />
            <span className="hidden sm:inline">Filter</span>
            {hasActiveFilters && <span className="hidden sm:inline">({Object.values({ filterProvider, filterSession, filterDateFrom, filterDateTo }).filter(v => v && v !== "all").length})</span>}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Filter Tasks</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear all
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Provider Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={filterProvider}
                  onChange={(e) => setFilterProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Providers</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Session Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Booking Session
                </label>
                <select
                  value={filterSession}
                  onChange={(e) => setFilterSession(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Sessions</option>
                  {bookingSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Date To Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="mt-4 flex flex-wrap gap-2">
                {filterProvider !== "all" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    Provider: {providers.find(p => p.id === parseInt(filterProvider))?.name}
                    <button onClick={() => setFilterProvider("all")} className="hover:text-green-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterSession !== "all" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    Session: {bookingSlots.find(s => s.id === parseInt(filterSession))?.name}
                    <button onClick={() => setFilterSession("all")} className="hover:text-green-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterDateFrom && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    From: {new Date(filterDateFrom).toLocaleDateString()}
                    <button onClick={() => setFilterDateFrom("")} className="hover:text-green-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterDateTo && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    To: {new Date(filterDateTo).toLocaleDateString()}
                    <button onClick={() => setFilterDateTo("")} className="hover:text-green-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="mb-2">
        {hasActiveFilters && (
          <p className="text-sm text-gray-600">
            Showing {filteredTasks.length} of {bookingTasks.length} tasks
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending"
          value={pendingTasks.length}
          total={bookingTasks.filter(t => t.status === "pending").length}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Completed"
          value={completedTasks.length}
          total={bookingTasks.filter(t => t.status === "success").length}
          color="green"
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="Failed"
          value={failedTasks.length}
          total={bookingTasks.filter(t => t.status === "failed").length}
          color="red"
        />
        <StatCard
          icon={<XCircle className="w-5 h-5" />}
          label="Cancelled"
          value={cancelledTasks.length}
          total={bookingTasks.filter(t => t.status === "cancelled").length}
          color="gray"
        />
      </div>

      {/* Pending Tasks */}
      {pendingTasks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Pending Tasks</h3>
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                slot={bookingSlots.find((s) => s.id === task.bookingSlotId)}
                provider={providers.find(
                  (p) => p.id === bookingSlots.find((s) => s.id === task.bookingSlotId)?.providerId
                )}
                onCancel={() => onCancelTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Processing Tasks */}
      {processingTasks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Processing Tasks</h3>
          <div className="space-y-3">
            {processingTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                slot={bookingSlots.find((s) => s.id === task.bookingSlotId)}
                provider={providers.find(
                  (p) => p.id === bookingSlots.find((s) => s.id === task.bookingSlotId)?.providerId
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Failed Tasks */}
      {failedTasks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Failed Tasks</h3>
          <div className="space-y-3">
            {failedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                slot={bookingSlots.find((s) => s.id === task.bookingSlotId)}
                provider={providers.find(
                  (p) => p.id === bookingSlots.find((s) => s.id === task.bookingSlotId)?.providerId
                )}
                onReactivate={() => onReactivateTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Completed Tasks</h3>
          <div className="space-y-3">
            {completedTasks.slice(0, 10).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                slot={bookingSlots.find((s) => s.id === task.bookingSlotId)}
                provider={providers.find(
                  (p) => p.id === bookingSlots.find((s) => s.id === task.bookingSlotId)?.providerId
                )}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </div>
          {completedTasks.length > 10 && (
            <p className="text-sm text-gray-500 mt-3">
              Showing 10 of {completedTasks.length} completed tasks
            </p>
          )}
        </div>
      )}

      {/* Cancelled Tasks */}
      {cancelledTasks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Cancelled Tasks</h3>
          <div className="space-y-3">
            {cancelledTasks.slice(0, 5).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                slot={bookingSlots.find((s) => s.id === task.bookingSlotId)}
                provider={providers.find(
                  (p) => p.id === bookingSlots.find((s) => s.id === task.bookingSlotId)?.providerId
                )}
                onReactivate={() => onReactivateTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </div>
          {cancelledTasks.length > 5 && (
            <p className="text-sm text-gray-500 mt-3">
              Showing 5 of {cancelledTasks.length} cancelled tasks
            </p>
          )}
        </div>
      )}

      {bookingTasks.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-800">No Booking Tasks Yet</h3>
          <p className="text-gray-600">
            Create a booking session to start seeing scheduled tasks here.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  color: "blue" | "green" | "red" | "gray";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    green: "bg-green-100 text-green-800 border-green-200",
    red: "bg-red-100 text-red-800 border-red-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <div
      className={`${colorClasses[color]} border rounded-xl p-4 flex flex-col items-center justify-center`}
    >
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-bold">
        {value}
        {total !== undefined && total !== value && (
          <span className="text-sm font-normal text-gray-500 ml-1">/ {total}</span>
        )}
      </div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

function TaskCard({
  task,
  slot,
  provider,
  onCancel,
  onReactivate,
  onExecute,
  onDelete,
}: {
  task: BookingTask;
  slot?: BookingSlot;
  provider?: Provider;
  onCancel?: () => void;
  onReactivate?: () => void;
  onExecute?: () => void;
  onDelete?: () => void;
}) {
  const iconBackgroundClasses: Record<string, string> = {
    pending: "bg-blue-500",
    processing: "bg-indigo-500",
    success: "bg-emerald-500",
    failed: "bg-rose-500",
    cancelled: "bg-slate-500",
    default: "bg-slate-500",
  };

  const iconBackground = iconBackgroundClasses[task.status] || iconBackgroundClasses.default;

  const stateIconMap: Record<string, LucideIcon> = {
    pending: CalendarClock,
    processing: CalendarSync,
    success: CalendarCheck2,
    failed: CalendarX2,
    cancelled: CalendarMinus,
  };

  const StateIcon = stateIconMap[task.status] || CalendarClock;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
      .format(date);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${datePart} · ${timePart}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="grid grid-cols-[auto,1fr] gap-4">
        {/* Status Icon */}
        <div
          className={`${iconBackground} w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transform -rotate-6`}
        >
          <StateIcon className="w-6 h-6 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-800 text-lg mb-1">
                {slot?.name || "Unknown Session"}
              </h4>
              <div className="text-sm text-gray-600">
                {provider?.name || "Unknown Provider"}
              </div>
            </div>
            
            {/* Status Badge with Action Button */}
            <div className="flex items-center gap-2">
              {/* Action buttons */}
              {onCancel && (task.status === "pending" || task.status === "failed") && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                  title="Cancel task"
                >
                  Cancel Task
                </button>
              )}
              {onReactivate && task.status === "cancelled" && (
                <button
                  onClick={onReactivate}
                  className="px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors whitespace-nowrap"
                  title="Reactivate task"
                >
                  Reactivate
                </button>
              )}
              {onDelete && (task.status === "cancelled" || task.status === "failed") && (
                <button
                  onClick={onDelete}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                  title="Delete task"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dates - Full-width to sit beneath icon */}
      <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span>Executes: {formatDate(task.attemptAt || task.scheduledDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span>Target: {formatDate(task.scheduledDate)}</span>
        </div>
      </div>

      {/* Error Message */}
      {task.errorMessage && task.errorMessage.trim().toLowerCase() !== "slot was deactivated" && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <span className="font-medium">Error:</span> {task.errorMessage}
        </div>
      )}
    </div>
  );
}
