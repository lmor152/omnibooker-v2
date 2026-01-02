import { useEffect, useMemo, useState } from "react";
import { X, Clock, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import type { BookingSlot, BookingSlotInput, Provider } from "../../types";
import { ChipsList } from "../ChipsList";
import { Switch } from "../ui/switch";

interface SessionModalProps {
  slot: BookingSlot | null;
  providers: Provider[];
  onSave: (slotInput: BookingSlotInput) => Promise<void>;
  onClose: () => void;
}

const defaultSlotValues: BookingSlotInput = {
  name: "",
  providerId: 0,
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: null,
  time: "09:00",
  timezone: "Europe/London",
  isActive: true,
  attemptStrategy: "offset",
  attemptOffsetDays: 0,
  attemptOffsetHours: 0,
  attemptOffsetMinutes: 0,
  releaseDaysBefore: 0,
  releaseTime: "00:00",
  providerOptions: {},
};

// Common timezones for booking automation
const COMMON_TIMEZONES = [
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
  { value: "UTC", label: "UTC" },
];

export function SessionModal({ slot, providers, onSave, onClose }: SessionModalProps) {
  const [form, setForm] = useState<BookingSlotInput>(defaultSlotValues);
  const [clubCourtSlug, setClubCourtSlug] = useState("");
  const [clubDoubleSession, setClubDoubleSession] = useState(false);
  const [clubTargetTimes, setClubTargetTimes] = useState<string[]>([]);
  const [clubTargetCourts, setClubTargetCourts] = useState<string[]>([]);
  const [betterVenueSlug, setBetterVenueSlug] = useState("");
  const [betterActivitySlug, setBetterActivitySlug] = useState("");
  const [betterUseCredits, setBetterUseCredits] = useState(true);
  const [betterTargetTimes, setBetterTargetTimes] = useState<string[]>([]);
  const [betterTargetCourts, setBetterTargetCourts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slot) {
      setForm({
        name: slot.name,
        providerId: slot.providerId,
        frequency: slot.frequency,
        dayOfWeek: slot.dayOfWeek ?? undefined,
        dayOfMonth: slot.dayOfMonth ?? undefined,
        time: slot.time,
        timezone: slot.timezone,
        isActive: slot.isActive,
        attemptStrategy: slot.attemptStrategy,
        attemptOffsetDays: slot.attemptOffsetDays,
        attemptOffsetHours: slot.attemptOffsetHours,
        attemptOffsetMinutes: slot.attemptOffsetMinutes,
        releaseDaysBefore: slot.releaseDaysBefore,
        releaseTime: slot.releaseTime ?? "00:00",
        providerOptions: slot.providerOptions ?? {},
      });
      const opts = slot.providerOptions ?? {};
      setClubCourtSlug((opts as any).courtSlug ?? "");
      setClubDoubleSession(Boolean((opts as any).doubleSession));
      setClubTargetTimes(
        Array.isArray((opts as any).targetTimes) ? (opts as any).targetTimes : []
      );
      setClubTargetCourts(
        Array.isArray((opts as any).targetCourts)
          ? (opts as any).targetCourts.map((c: number | string) => String(c))
          : []
      );
      setBetterVenueSlug((opts as any).venueSlug ?? "");
      setBetterActivitySlug((opts as any).activitySlug ?? "");
      setBetterUseCredits((opts as any).useCredits ?? true);
      setBetterTargetTimes(
        Array.isArray((opts as any).targetTimes) ? (opts as any).targetTimes : []
      );
      setBetterTargetCourts(
        Array.isArray((opts as any).targetCourts)
          ? (opts as any).targetCourts.map((c: string | number) => String(c))
          : []
      );
    } else {
      setForm(defaultSlotValues);
      setClubCourtSlug("");
      setClubDoubleSession(false);
      setClubTargetTimes([]);
      setClubTargetCourts([]);
      setBetterVenueSlug("");
      setBetterActivitySlug("");
      setBetterUseCredits(true);
      setBetterTargetTimes([]);
      setBetterTargetCourts([]);
    }
  }, [slot]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === form.providerId),
    [providers, form.providerId]
  );

  const handleAddTargetTime = (value: string) => {
    if (!/^[0-2]\d:[0-5]\d$/.test(value)) {
      return { error: "Use HH:MM format for target times (e.g., 07:30)" } as const;
    }
    return { value } as const;
  };

  const handleAddTargetCourt = (value: string) => {
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) {
      return { error: "Court numbers must be positive integers" } as const;
    }
    return { value: String(n) } as const;
  };

  const handleAddBetterCourt = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return { error: "Enter a court keyword" } as const;
    }
    return { value: trimmed } as const;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.providerId) return;

    const providerOptions: BookingSlotInput["providerOptions"] = {};
    if (selectedProvider?.type === "Clubspark") {
      if (clubCourtSlug) providerOptions.courtSlug = clubCourtSlug;
      providerOptions.doubleSession = clubDoubleSession;
      if (clubTargetTimes.length) providerOptions.targetTimes = clubTargetTimes;
      const parsedCourts = clubTargetCourts
        .map((c) => Number(c))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (parsedCourts.length) providerOptions.targetCourts = parsedCourts;
    } else if (selectedProvider?.type === "Better") {
      if (betterVenueSlug) providerOptions.venueSlug = betterVenueSlug.trim();
      if (betterActivitySlug) providerOptions.activitySlug = betterActivitySlug.trim();
      providerOptions.useCredits = betterUseCredits;
      if (betterTargetTimes.length) providerOptions.targetTimes = betterTargetTimes;
      const betterCourts = betterTargetCourts
        .map((c) => c.trim())
        .filter((value) => value.length > 0);
      if (betterCourts.length) providerOptions.targetCourts = betterCourts;
    }

    const bookingTime = (() => {
      if (selectedProvider?.type === "Clubspark") {
        return clubTargetTimes[0] || form.time || "09:00";
      }
      if (selectedProvider?.type === "Better") {
        return betterTargetTimes[0] || form.time || "09:00";
      }
      return form.time || "09:00";
    })();

    const payload: BookingSlotInput = {
      ...form,
      time: bookingTime,
      providerOptions,
      dayOfWeek:
        form.frequency === "weekly" || form.frequency === "fortnightly"
          ? form.dayOfWeek ?? 0
          : null,
      dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth ?? 1 : null,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save booking slot";
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-2xl z-10">
          <h3 className="text-xl font-bold text-gray-800">
            {slot ? "Edit Booking Session" : "Add Booking Session"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(90vh-140px)] overflow-y-auto">
          {/* Common Settings */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-800">Common Settings</h4>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Monday Tennis"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider <span className="text-red-500">*</span>
              </label>
              <select
                value={form.providerId || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, providerId: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
                disabled={providers.length === 0}
              >
                <option value="">Select a provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frequency <span className="text-red-500">*</span>
              </label>
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    frequency: e.target.value as BookingSlot["frequency"],
                  }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Day of Week for weekly/fortnightly */}
            {(form.frequency === "weekly" || form.frequency === "fortnightly") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day of Week <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.dayOfWeek ?? 0}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dayOfWeek: Number(e.target.value) }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </div>
            )}

            {/* Day of Month for monthly */}
            {form.frequency === "monthly" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day of Month <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dayOfMonth ?? 1}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dayOfMonth: Number(e.target.value) }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>
            )}
          </div>

          {/* Release Behaviour */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <div>
              <h4 className="font-semibold text-gray-800 mb-1">Release Behaviour</h4>
              <p className="text-sm text-gray-500">When to attempt the booking.</p>
            </div>

            {/* Attempt Strategy */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Attempt Strategy
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "offset" }))}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    form.attemptStrategy === "offset"
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-5 h-5 text-green-600" />
                    <span className="font-medium">Time Offset</span>
                  </div>
                  <p className="text-xs text-gray-600">Book X time before</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "release" }))}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    form.attemptStrategy === "release"
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="w-5 h-5 text-green-600" />
                    <span className="font-medium">Release Schedule</span>
                  </div>
                  <p className="text-xs text-gray-600">Book at specific time</p>
                </button>
              </div>
            </div>

            {/* Time Offset Settings */}
            {form.attemptStrategy === "offset" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days before
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.attemptOffsetDays}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        attemptOffsetDays: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hours before
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={form.attemptOffsetHours}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        attemptOffsetHours: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minutes before
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={form.attemptOffsetMinutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        attemptOffsetMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Release Schedule Settings */}
            {form.attemptStrategy === "release" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days before release
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.releaseDaysBefore}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        releaseDaysBefore: Number(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Release time (HH:MM)
                  </label>
                  <input
                    type="time"
                    value={form.releaseTime ?? "00:00"}
                    onChange={(e) => setForm((prev) => ({ ...prev, releaseTime: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {/* Clubspark Options */}
          {selectedProvider?.type === "Clubspark" && (
            <div className="border-t border-gray-200 pt-6 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Provider Options (Clubspark)</h4>
                <p className="text-sm text-gray-500">Ordered preferences are used as listed.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Court Slug</label>
                <input
                  type="text"
                  value={clubCourtSlug}
                  onChange={(e) => setClubCourtSlug(e.target.value)}
                  placeholder="e.g., clissoldparkhackney"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label htmlFor="double-session" className="text-sm font-medium text-gray-700">
                  Double session
                </label>
                <Switch
                  id="double-session"
                  checked={clubDoubleSession}
                  onCheckedChange={setClubDoubleSession}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Times
                </label>
                <ChipsList
                  items={clubTargetTimes}
                  onChange={setClubTargetTimes}
                  placeholder="HH:MM"
                  note="Use 24hr time; order = preference."
                  onAddAttempt={handleAddTargetTime}
                  onError={setError}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Courts
                </label>
                <ChipsList
                  items={clubTargetCourts}
                  onChange={setClubTargetCourts}
                  placeholder="Court #"
                  note="Order matters; first choice first."
                  onAddAttempt={handleAddTargetCourt}
                  onError={setError}
                />
              </div>
            </div>
          )}

          {/* Better Options */}
          {selectedProvider?.type === "Better" && (
            <div className="border-t border-gray-200 pt-6 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Provider Options (Better)</h4>
                <p className="text-sm text-gray-500">
                  Specify the venue + activity slugs from Better along with your preferred courts and times.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Venue Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={betterVenueSlug}
                  onChange={(e) => setBetterVenueSlug(e.target.value)}
                  placeholder="e.g., islington-tennis-centre"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={betterActivitySlug}
                  onChange={(e) => setBetterActivitySlug(e.target.value)}
                  placeholder="e.g., highbury-tennis"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label htmlFor="better-credits" className="text-sm font-medium text-gray-700">
                  Use available credits before charging card
                </label>
                <Switch id="better-credits" checked={betterUseCredits} onCheckedChange={setBetterUseCredits} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Times</label>
                <ChipsList
                  items={betterTargetTimes}
                  onChange={setBetterTargetTimes}
                  placeholder="HH:MM"
                  note="Optional. Ordered preferences."
                  onAddAttempt={handleAddTargetTime}
                  onError={setError}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Courts</label>
                <ChipsList
                  items={betterTargetCourts}
                  onChange={setBetterTargetCourts}
                  placeholder="Court name or number"
                  note="Matches by keyword, e.g., '1' or 'Court 1'."
                  onAddAttempt={handleAddBetterCourt}
                  onError={setError}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </form>

        <div className="border-t border-gray-200 p-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || providers.length === 0}
            className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : slot ? "Save Changes" : "Add Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
