import { useEffect, useMemo, useState } from "react";
import { Clock, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import type { BookingSlot, BookingSlotInput, ChatDestination, Provider, UserPreferences } from "../../types";
import { ChipsList } from "../ChipsList";
import { Field, ToggleRow } from "../common/Field";
import { FormSection } from "../common/FormSection";
import { FormSheet, FormSheetActions } from "../common/FormSheet";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Switch } from "../ui/switch";
import { cn } from "../ui/utils";

interface SessionModalProps {
  slot: BookingSlot | null;
  providers: Provider[];
  destinations: ChatDestination[];
  preferences: UserPreferences | null;
  onSave: (slotInput: BookingSlotInput) => Promise<void>;
  onClose: () => void;
  onTest: (payload: {
    providerId: number;
    providerOptions: Record<string, unknown>;
  }) => Promise<{ success: boolean; message: string }>;
}

const defaultSlotValues: BookingSlotInput = {
  name: "",
  providerId: 0,
  frequency: "weekly",
  dayOfWeek: 1,
  dayOfMonth: null,
  oneOffDate: null,
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

type TestStatus = "idle" | "loading" | "success" | "error";

export function SessionModal({ slot, providers, destinations, preferences, onSave, onClose, onTest }: SessionModalProps) {
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
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string>("");

  useEffect(() => {
    if (slot) {
      setForm({
        name: slot.name,
        providerId: slot.providerId,
        frequency: slot.frequency,
        dayOfWeek: slot.dayOfWeek ?? undefined,
        dayOfMonth: slot.dayOfMonth ?? undefined,
        oneOffDate: slot.oneOffDate ?? null,
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
        notificationsEnabled: slot.notificationsEnabled ?? null,
        notifyDestinationId: slot.notifyDestinationId ?? null,
        autoCancelEnabled: slot.autoCancelEnabled ?? null,
        confirmDeadlineHours: slot.confirmDeadlineHours ?? null,
        reminderHours: slot.reminderHours ?? null,
        confirmationPolicy: slot.confirmationPolicy ?? "owner_only",
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

  const supportsTest =
    selectedProvider?.type === "Better" || selectedProvider?.type === "Clubspark";

  const handleTest = async () => {
    if (!form.providerId) return;
    setTestStatus("loading");
    setTestMessage("");
    const providerOptions: Record<string, unknown> = {};
    if (selectedProvider?.type === "Clubspark" && clubCourtSlug) {
      providerOptions.courtSlug = clubCourtSlug;
    } else if (selectedProvider?.type === "Better") {
      if (betterVenueSlug) providerOptions.venueSlug = betterVenueSlug.trim();
      if (betterActivitySlug) providerOptions.activitySlug = betterActivitySlug.trim();
    }
    try {
      const result = await onTest({ providerId: form.providerId, providerOptions });
      if (result.success) {
        setTestStatus("success");
        setTestMessage(result.message);
        setTimeout(() => setTestStatus("idle"), 4000);
      } else {
        setTestStatus("error");
        setTestMessage(result.message);
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Failed to reach server");
    }
  };

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
      oneOffDate: form.frequency === "one_off" ? form.oneOffDate ?? null : null,
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

  const setNumber = (key: keyof BookingSlotInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: Number(e.target.value) }));

  const releaseSummary =
    form.attemptStrategy === "offset"
      ? `${form.attemptOffsetDays}d ${form.attemptOffsetHours}h ${form.attemptOffsetMinutes}m before the session`
      : `${form.releaseDaysBefore} days before, at ${form.releaseTime ?? "00:00"}`;

  const slugInputProps = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

  return (
    <FormSheet
      title={slot ? "Edit booking session" : "Add booking session"}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <FormSheetActions
          message={
            testStatus === "success" || testStatus === "error" ? (
              <p
                className={cn(
                  "text-sm font-medium text-center",
                  testStatus === "success" ? "text-green-600" : "text-red-600",
                )}
              >
                {testMessage}
              </p>
            ) : null
          }
        >
          <Button type="button" variant="outline" size="lg" onClick={onClose} className="hidden sm:inline-flex">
            Cancel
          </Button>
          {supportsTest && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleTest}
              disabled={testStatus === "loading" || !form.providerId}
            >
              {testStatus === "loading" ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Testing…
                </>
              ) : (
                "Test"
              )}
            </Button>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting || providers.length === 0}>
            {isSubmitting ? "Saving…" : slot ? "Save changes" : "Add session"}
          </Button>
        </FormSheetActions>
      }
    >
      <div className="space-y-5">
        <FormSection title="Session">
          <Field label="Name" htmlFor="session-name" required>
            <Input
              id="session-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Monday Tennis"
              required
            />
          </Field>

          <Field label="Provider" htmlFor="session-provider" required>
            <NativeSelect
              id="session-provider"
              value={form.providerId || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, providerId: Number(e.target.value) }))}
              required
              disabled={providers.length === 0}
            >
              <option value="">Select a provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeats" htmlFor="session-frequency" required>
              <NativeSelect
                id="session-frequency"
                value={form.frequency}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    frequency: e.target.value as BookingSlot["frequency"],
                  }))
                }
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="one_off">One-off</option>
              </NativeSelect>
            </Field>

            {(form.frequency === "weekly" || form.frequency === "fortnightly") && (
              <Field label="Day" htmlFor="session-day" required>
                <NativeSelect
                  id="session-day"
                  value={form.dayOfWeek ?? 0}
                  onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: Number(e.target.value) }))}
                >
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </NativeSelect>
              </Field>
            )}

            {form.frequency === "monthly" && (
              <Field label="Day of month" htmlFor="session-day-of-month" required>
                <Input
                  id="session-day-of-month"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={form.dayOfMonth ?? 1}
                  onChange={setNumber("dayOfMonth")}
                  required
                />
              </Field>
            )}

            {form.frequency === "one_off" && (
              <Field label="Date" htmlFor="session-date" required>
                <Input
                  id="session-date"
                  type="date"
                  value={form.oneOffDate ?? ""}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm((prev) => ({ ...prev, oneOffDate: e.target.value || null }))}
                  required
                />
              </Field>
            )}
          </div>
        </FormSection>

        {/* Clubspark Options */}
        {selectedProvider?.type === "Clubspark" && (
          <FormSection title="Clubspark options" description="Times are tried before courts, each in the order listed.">
            <Field label="Court slug" htmlFor="club-court-slug" hint="From the booking page URL, e.g. clubspark.lta.org.uk/finsburypark">
              <Input
                id="club-court-slug"
                type="text"
                value={clubCourtSlug}
                onChange={(e) => setClubCourtSlug(e.target.value)}
                placeholder="e.g., clissoldparkhackney"
                {...slugInputProps}
              />
            </Field>

            <ToggleRow label="Double session" description="Book two-hour slots." htmlFor="double-session">
              <Switch id="double-session" checked={clubDoubleSession} onCheckedChange={setClubDoubleSession} />
            </ToggleRow>

            <Field label="Target times" htmlFor="club-target-times">
              <ChipsList
                id="club-target-times"
                items={clubTargetTimes}
                onChange={setClubTargetTimes}
                placeholder="HH:MM"
                inputType="time"
                note="24-hour time. The first time listed is tried first."
                onAddAttempt={handleAddTargetTime}
                onError={setError}
              />
            </Field>

            <Field label="Target courts" htmlFor="club-target-courts">
              <ChipsList
                id="club-target-courts"
                items={clubTargetCourts}
                onChange={setClubTargetCourts}
                placeholder="Court #"
                inputMode="numeric"
                note="The first court listed is tried first."
                onAddAttempt={handleAddTargetCourt}
                onError={setError}
              />
            </Field>
          </FormSection>
        )}

        {/* Better Options */}
        {selectedProvider?.type === "Better" && (
          <FormSection title="Better options" description="Slugs come from the Better booking page URL.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue slug" htmlFor="better-venue" required>
                <Input
                  id="better-venue"
                  type="text"
                  value={betterVenueSlug}
                  onChange={(e) => setBetterVenueSlug(e.target.value)}
                  placeholder="e.g., islington-tennis-centre"
                  required
                  {...slugInputProps}
                />
              </Field>

              <Field label="Activity slug" htmlFor="better-activity" required>
                <Input
                  id="better-activity"
                  type="text"
                  value={betterActivitySlug}
                  onChange={(e) => setBetterActivitySlug(e.target.value)}
                  placeholder="e.g., highbury-tennis"
                  required
                  {...slugInputProps}
                />
              </Field>
            </div>

            <ToggleRow label="Use account credit" description="Spend available credit before charging your card." htmlFor="better-credits">
              <Switch id="better-credits" checked={betterUseCredits} onCheckedChange={setBetterUseCredits} />
            </ToggleRow>

            <Field label="Target times" htmlFor="better-target-times" optional>
              <ChipsList
                id="better-target-times"
                items={betterTargetTimes}
                onChange={setBetterTargetTimes}
                placeholder="HH:MM"
                inputType="time"
                note="The first time listed is tried first."
                onAddAttempt={handleAddTargetTime}
                onError={setError}
              />
            </Field>

            <Field label="Target courts" htmlFor="better-target-courts" optional>
              <ChipsList
                id="better-target-courts"
                items={betterTargetCourts}
                onChange={setBetterTargetCourts}
                placeholder="Court name or number"
                note="Matches by keyword, e.g. '1' or 'Court 1'."
                onAddAttempt={handleAddBetterCourt}
                onError={setError}
              />
            </Field>
          </FormSection>
        )}

        {/* Release Behaviour */}
        <FormSection
          title="When to book"
          description="When Bookie Monster should attempt the booking."
          summary={releaseSummary}
          collapsible
          defaultOpen={!slot}
        >
          <div className="grid grid-cols-2 gap-2">
            <StrategyOption
              active={form.attemptStrategy === "release"}
              onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "release" }))}
              icon={<CalendarIcon className="w-4 h-4 text-green-600" />}
              title="At release"
              description="A set time, days before"
            />
            <StrategyOption
              active={form.attemptStrategy === "offset"}
              onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "offset" }))}
              icon={<Clock className="w-4 h-4 text-green-600" />}
              title="Time offset"
              description="A fixed time before"
            />
          </div>

          {form.attemptStrategy === "offset" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Days" htmlFor="offset-days">
                <Input id="offset-days" type="number" inputMode="numeric" min="0" value={form.attemptOffsetDays} onChange={setNumber("attemptOffsetDays")} />
              </Field>
              <Field label="Hours" htmlFor="offset-hours">
                <Input id="offset-hours" type="number" inputMode="numeric" min="0" max="23" value={form.attemptOffsetHours} onChange={setNumber("attemptOffsetHours")} />
              </Field>
              <Field label="Minutes" htmlFor="offset-minutes">
                <Input id="offset-minutes" type="number" inputMode="numeric" min="0" max="59" value={form.attemptOffsetMinutes} onChange={setNumber("attemptOffsetMinutes")} />
              </Field>
            </div>
          )}

          {form.attemptStrategy === "release" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Days before" htmlFor="release-days">
                <Input id="release-days" type="number" inputMode="numeric" min="0" value={form.releaseDaysBefore} onChange={setNumber("releaseDaysBefore")} />
              </Field>
              <Field label="At" htmlFor="release-time">
                <Input
                  id="release-time"
                  type="time"
                  value={form.releaseTime ?? "00:00"}
                  onChange={(e) => setForm((prev) => ({ ...prev, releaseTime: e.target.value }))}
                />
              </Field>
            </div>
          )}

          <Field label="Timezone" htmlFor="session-timezone">
            <NativeSelect
              id="session-timezone"
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FormSection>

        <NotificationSettingsSection
          value={form}
          destinations={destinations}
          defaults={preferences}
          onChange={(updates) => setForm((prev) => ({ ...prev, ...updates }))}
          onError={setError}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </div>
    </FormSheet>
  );
}

function StrategyOption({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border-2 p-3 text-left transition-colors",
        active ? "border-green-600 bg-green-50" : "border-gray-200 hover:border-gray-300",
      )}
    >
      <span className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-gray-800">
        {icon}
        {title}
      </span>
      <span className="block text-xs text-gray-600">{description}</span>
    </button>
  );
}
