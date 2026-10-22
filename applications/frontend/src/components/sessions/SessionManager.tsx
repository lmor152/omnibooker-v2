import { useState } from "react";
import { CalendarSync, ChevronDown, Edit2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { BookingSlot, BookingSlotInput, ChatDestination, Provider, UserPreferences } from "../../types";
import { ActionMenu } from "../common/ActionMenu";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { cn } from "../ui/utils";
import { SessionModal } from "./SessionModal";

interface SessionManagerProps {
  bookingSlots: BookingSlot[];
  providers: Provider[];
  destinations: ChatDestination[];
  preferences: UserPreferences | null;
  onAddSlot: (slot: BookingSlotInput) => Promise<void>;
  onUpdateSlot: (id: number, updates: Partial<BookingSlotInput>) => Promise<void>;
  onDeleteSlot: (id: number) => Promise<void>;
  onResyncSlot: (id: number) => Promise<void>;
  onTestSlot: (payload: {
    providerId: number;
    providerOptions: Record<string, unknown>;
  }) => Promise<{ success: boolean; message: string }>;
}

export function SessionManager({
  bookingSlots,
  providers,
  destinations,
  preferences,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
  onResyncSlot,
  onTestSlot,
}: SessionManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<BookingSlot | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<BookingSlot | null>(null);

  const handleAddSession = () => {
    setEditingSlot(null);
    setIsModalOpen(true);
  };

  const handleEditSession = (slot: BookingSlot) => {
    setEditingSlot(slot);
    setIsModalOpen(true);
  };

  const handleDeleteSession = async (slotId: number) => {
    try {
      await onDeleteSlot(slotId);
    } catch (error) {
      // Error handled by parent
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

  const renderCard = (session: BookingSlot) => (
    <SessionCard
      key={session.id}
      session={session}
      provider={providers.find((p) => p.id === session.providerId)}
      onEdit={() => handleEditSession(session)}
      onDelete={() => setDeletingSlot(session)}
      onToggleActive={() => handleToggleActive(session)}
      onResync={() => handleResyncSession(session.id)}
    />
  );

  return (
    <div>
      <PageHeader
        title="Booking Sessions"
        description="Create and manage your recurring booking sessions."
        actions={
          <Button onClick={handleAddSession} disabled={providers.length === 0}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
        }
      />

      {providers.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            You need to add a provider before you can create booking sessions.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {activeSessions.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2">
              <span className="text-base font-semibold text-gray-800">Active</span>
              <span className="text-sm text-gray-500">{activeSessions.length}</span>
            </h3>
            <div className="space-y-3">{activeSessions.map(renderCard)}</div>
          </section>
        )}

        {inactiveSessions.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2">
              <span className="text-base font-semibold text-gray-800">Inactive</span>
              <span className="text-sm text-gray-500">{inactiveSessions.length}</span>
            </h3>
            <div className="space-y-3">{inactiveSessions.map(renderCard)}</div>
          </section>
        )}
      </div>

      {bookingSlots.length === 0 && providers.length > 0 && (
        <div className="text-center py-12 px-4 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CalendarSync className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1 text-gray-800">No booking sessions yet</h3>
          <p className="text-gray-600 mb-5">Create your first recurring booking session to get started!</p>
          <Button size="lg" onClick={handleAddSession}>
            <Plus className="w-5 h-5" />
            Add first session
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deletingSlot !== null}
        onOpenChange={(open) => !open && setDeletingSlot(null)}
        title="Delete this booking session?"
        description={deletingSlot ? `"${deletingSlot.name}" and its upcoming tasks will be removed.` : undefined}
        confirmLabel="Delete"
        onConfirm={() => deletingSlot && handleDeleteSession(deletingSlot.id)}
      />

      {isModalOpen && (
        <SessionModal
          slot={editingSlot}
          providers={providers}
          destinations={destinations}
          preferences={preferences}
          onSave={handleSaveSession}
          onClose={() => setIsModalOpen(false)}
          onTest={onTestSlot}
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
  const frequencyLabels: Record<string, string> = {
    weekly: "Weekly",
    fortnightly: "Fortnightly",
    monthly: "Monthly",
    one_off: "One-off",
  };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const getDayName = () =>
    typeof session.dayOfWeek === "number" && session.dayOfWeek >= 0 && session.dayOfWeek <= 6
      ? dayNames[session.dayOfWeek]
      : null;

  const getScheduleText = () => {
    if (session.frequency === "one_off" && session.oneOffDate) {
      return `One-off on ${new Date(session.oneOffDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} at ${session.time}`;
    }
    if (session.frequency === "monthly" && session.dayOfMonth) {
      return `${frequencyLabels[session.frequency]} on day ${session.dayOfMonth} at ${session.time}`;
    }
    if (
      (session.frequency === "weekly" || session.frequency === "fortnightly") &&
      typeof session.dayOfWeek === "number"
    ) {
      return `${frequencyLabels[session.frequency]} on ${getDayName()} at ${session.time}`;
    }
    return frequencyLabels[session.frequency] ?? session.frequency;
  };

  const getAttemptText = () => {
    if (session.attemptStrategy === "offset") {
      const parts = [];
      if (session.attemptOffsetDays > 0) parts.push(`${session.attemptOffsetDays}d`);
      if (session.attemptOffsetHours > 0) parts.push(`${session.attemptOffsetHours}h`);
      if (session.attemptOffsetMinutes > 0) parts.push(`${session.attemptOffsetMinutes}m`);
      return parts.length > 0 ? `${parts.join(" ")} before the session` : "At the session time";
    }
    return `${session.releaseDaysBefore} days before, at ${session.releaseTime || "00:00"}`;
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

    return options.length > 0 ? options.join(" · ") : null;
  };

  const [showDetails, setShowDetails] = useState(false);
  const iconWrapperClasses = session.isActive ? "bg-emerald-500" : "bg-slate-300";
  const iconColor = session.isActive ? "text-white" : "text-gray-600";
  const options = formatProviderOptions();

  return (
    <div className={cn("bg-white border border-gray-200 rounded-xl p-3 sm:p-4", !session.isActive && "bg-gray-50")}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transform -rotate-6 ${iconWrapperClasses}`}
          >
            <CalendarSync className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-800 truncate">{session.name}</h4>
            <p className="text-sm text-gray-600">{getScheduleText()}</p>
            <p className="text-sm text-gray-500 truncate">{provider?.name || "Unknown provider"}</p>
          </div>
        </button>
        <ActionMenu
          items={[
            { label: "Edit", icon: Edit2, onSelect: onEdit },
            { label: "Resync tasks", icon: RefreshCw, onSelect: onResync },
            { label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true },
          ]}
        />
      </div>

      <div className="mt-2 -mb-1 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
          className="flex h-8 items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          Details
          <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
        </button>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          {session.isActive ? "Active" : "Paused"}
          <Switch
            checked={session.isActive}
            onCheckedChange={onToggleActive}
            aria-label={session.isActive ? "Deactivate session" : "Activate session"}
          />
        </label>
      </div>
      {showDetails && (
        <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Books</dt>
          <dd className="text-gray-800">{getAttemptText()}</dd>
          {options && (
            <>
              <dt className="text-gray-500">Options</dt>
              <dd className="text-gray-800 break-words">{options}</dd>
            </>
          )}
          <dt className="text-gray-500">Timezone</dt>
          <dd className="text-gray-800">{session.timezone}</dd>
        </dl>
      )}
    </div>
  );
}
