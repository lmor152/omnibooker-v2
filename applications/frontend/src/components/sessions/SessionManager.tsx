import { useState } from "react";
import { Calendar, CalendarSync, Plus, Edit2, Trash2, Power, PowerOff, RefreshCw } from "lucide-react";
import type { BookingSlot, BookingSlotInput, Provider } from "../../types";
import { SessionModal } from "./SessionModal";

interface SessionManagerProps {
  bookingSlots: BookingSlot[];
  providers: Provider[];
  onAddSlot: (slot: BookingSlotInput) => Promise<void>;
  onUpdateSlot: (id: number, updates: Partial<BookingSlotInput>) => Promise<void>;
  onDeleteSlot: (id: number) => Promise<void>;
  onResyncSlot: (id: number) => Promise<void>;
}

export function SessionManager({
  bookingSlots,
  providers,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
  onResyncSlot,
}: SessionManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<BookingSlot | null>(null);

  const handleAddSession = () => {
    setEditingSlot(null);
    setIsModalOpen(true);
  };

  const handleEditSession = (slot: BookingSlot) => {
    setEditingSlot(slot);
    setIsModalOpen(true);
  };

  const handleDeleteSession = async (slotId: number) => {
    if (confirm("Are you sure you want to delete this booking session?")) {
      try {
        await onDeleteSlot(slotId);
      } catch (error) {
        // Error handled by parent
      }
    }
  };

  const handleToggleActive = async (slot: BookingSlot) => {
    try {
      await onUpdateSlot(slot.id, { isActive: !slot.isActive });
    } catch (error) {
      // Error handled by parent
    }
  };

  const handleResyncSession = async (slotId: number) => {
    try {
      await onResyncSlot(slotId);
    } catch (error) {
      // Error handled by parent
    }
  };

  const handleSaveSession = async (slotInput: BookingSlotInput) => {
    try {
      if (editingSlot) {
        await onUpdateSlot(editingSlot.id, slotInput);
      } else {
        await onAddSlot(slotInput);
      }
      setIsModalOpen(false);
    } catch (error) {
      // Error is handled by parent, rethrow to show in modal
      throw error;
    }
  };

  const activeSessions = bookingSlots.filter((s) => s.isActive);
  const inactiveSessions = bookingSlots.filter((s) => !s.isActive);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Booking Sessions</h2>
          <p className="text-gray-600">Create and manage your recurring booking sessions.</p>
        </div>
        <button
          onClick={handleAddSession}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors self-start sm:self-auto font-medium"
          disabled={providers.length === 0}
        >
          <Plus className="w-5 h-5" />
          Add Session
        </button>
      </div>

      {providers.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            You need to add a provider before you can create booking sessions.
          </p>
        </div>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Active Sessions</h3>
          <div className="grid gap-4">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                provider={providers.find((p) => p.id === session.providerId)}
                onEdit={() => handleEditSession(session)}
                onDelete={() => handleDeleteSession(session.id)}
                onToggleActive={() => handleToggleActive(session)}
                onResync={() => handleResyncSession(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Sessions */}
      {inactiveSessions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Inactive Sessions</h3>
          <div className="grid gap-4">
            {inactiveSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                provider={providers.find((p) => p.id === session.providerId)}
                onEdit={() => handleEditSession(session)}
                onDelete={() => handleDeleteSession(session.id)}
                onToggleActive={() => handleToggleActive(session)}
                onResync={() => handleResyncSession(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {bookingSlots.length === 0 && providers.length > 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CalendarSync className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-800">No Booking Sessions Yet</h3>
          <p className="text-gray-600 mb-6">
            Create your first recurring booking session to get started!
          </p>
          <button
            onClick={handleAddSession}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            Add First Session
          </button>
        </div>
      )}

      {isModalOpen && (
        <SessionModal
          slot={editingSlot}
          providers={providers}
          onSave={handleSaveSession}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function SessionCard({
  session,
  provider,
  onEdit,
  onDelete,
  onToggleActive,
  onResync,
}: {
  session: BookingSlot;
  provider?: Provider;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onResync: () => void;
}) {
  const frequencyLabels = {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    monthly: "Monthly",
  };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const getDayName = () =>
    typeof session.dayOfWeek === "number" && session.dayOfWeek >= 0 && session.dayOfWeek <= 6
      ? dayNames[session.dayOfWeek]
      : null;

  const getScheduleText = () => {
    if (session.frequency === "monthly" && session.dayOfMonth) {
      return `${frequencyLabels[session.frequency]} on day ${session.dayOfMonth}`;
    }
    if (
      (session.frequency === "weekly" || session.frequency === "fortnightly") &&
      typeof session.dayOfWeek === "number"
    ) {
      return `${frequencyLabels[session.frequency]} on ${getDayName()}`;
    }
    return frequencyLabels[session.frequency];
  };

  const getAttemptText = () => {
    if (session.attemptStrategy === "offset") {
      const parts = [];
      if (session.attemptOffsetDays > 0) parts.push(`${session.attemptOffsetDays}d`);
      if (session.attemptOffsetHours > 0) parts.push(`${session.attemptOffsetHours}h`);
      if (session.attemptOffsetMinutes > 0) parts.push(`${session.attemptOffsetMinutes}m`);
      return parts.length > 0 ? `${parts.join(" ")} before` : "At booking time";
    }
    return `${session.releaseDaysBefore}d before @ ${session.releaseTime || "00:00"}`;
  };

  const formatProviderOptions = () => {
    if (!session.providerOptions || Object.keys(session.providerOptions).length === 0) {
      return null;
    }

    const options: string[] = [];
    const opts = session.providerOptions as any;

    // Format Clubspark options
    if (opts.courtSlug) {
      options.push(`Court: ${opts.courtSlug}`);
    }
    if (opts.doubleSession) {
      options.push("Double session");
    }
    if (opts.targetTimes && Array.isArray(opts.targetTimes) && opts.targetTimes.length > 0) {
      options.push(`Times: ${opts.targetTimes.join(", ")}`);
    }
    if (opts.targetCourts && Array.isArray(opts.targetCourts) && opts.targetCourts.length > 0) {
      options.push(`Courts: ${opts.targetCourts.join(", ")}`);
    }

    return options.length > 0 ? options.join(" • ") : null;
  };

  const iconWrapperClasses = session.isActive ? "bg-emerald-500" : "bg-slate-300";
  const iconColor = session.isActive ? "text-white" : "text-gray-600";

  const renderActionButtons = () => (
    <>
      <button
        onClick={onToggleActive}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
          session.isActive ? "text-orange-600 hover:bg-orange-50" : "text-green-600 hover:bg-green-50"
        }`}
        title={session.isActive ? "Deactivate" : "Activate"}
      >
        {session.isActive ? (
          <>
            <PowerOff className="w-4 h-4" />
            <span className="hidden sm:inline">Deactivate</span>
          </>
        ) : (
          <>
            <Power className="w-4 h-4" />
            <span className="hidden sm:inline">Activate</span>
          </>
        )}
      </button>
      <button
        onClick={onResync}
        className="flex items-center gap-2 px-3 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors text-sm font-medium"
        title="Resync tasks"
      >
        <RefreshCw className="w-4 h-4" />
        <span className="hidden sm:inline">Resync</span>
      </button>
      <button
        onClick={onEdit}
        className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
      >
        <Edit2 className="w-4 h-4" />
        <span className="hidden sm:inline">Edit</span>
      </button>
      <button
        onClick={onDelete}
        className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
      >
        <Trash2 className="w-4 h-4" />
        <span className="hidden sm:inline">Delete</span>
      </button>
    </>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="grid grid-cols-[auto,1fr] gap-3 items-start mb-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transform -rotate-6 ${iconWrapperClasses}`}
            >
              <CalendarSync className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4 className="text-lg font-semibold text-gray-800">{session.name}</h4>
              </div>
              <p className="text-sm text-gray-600">{provider?.name || "Unknown provider"}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{getScheduleText()}</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-gray-400" />
              <span>Attempt: {getAttemptText()}</span>
            </div>
          </div>
        </div>
        <div className="hidden lg:flex flex-wrap items-center gap-2">{renderActionButtons()}</div>
      </div>

      {formatProviderOptions() && (
        <div className="mt-4 text-sm text-gray-600 leading-relaxed break-words">
          <span className="font-semibold text-gray-700">Options:</span> {formatProviderOptions()}
        </div>
      )}

      <div className={`mt-4 flex flex-wrap items-center gap-2 lg:hidden ${formatProviderOptions() ? "pt-1" : ""}`}>
        {renderActionButtons()}
      </div>
    </div>
  );
}
