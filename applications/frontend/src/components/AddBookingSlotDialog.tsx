import { useEffect, useMemo, useState } from "react";
import type { BookingSlot, BookingSlotInput, Provider } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { Separator } from "./ui/separator";
import { Alert, AlertDescription } from "./ui/alert";
import { Switch } from "./ui/switch";
import { Clock, Calendar } from "lucide-react";
import { ChipsList } from "./ChipsList";

interface AddBookingSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Provider[];
  mode?: "create" | "edit";
  slot?: BookingSlot;
  onSave: (payload: BookingSlotInput, slotId?: number) => Promise<void>;
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
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Chicago", label: "Chicago (CST/CDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { value: "America/Toronto", label: "Toronto (EST/EDT)" },
  { value: "America/Vancouver", label: "Vancouver (PST/PDT)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEDT/AEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "UTC", label: "UTC" },
];

export function AddBookingSlotDialog({
  open,
  onOpenChange,
  providers,
  mode = "create",
  slot,
  onSave,
}: AddBookingSlotDialogProps) {
  const [form, setForm] = useState<BookingSlotInput>(defaultSlotValues);
  const [clubCourtSlug, setClubCourtSlug] = useState("");
  const [clubDoubleSession, setClubDoubleSession] = useState(false);
  const [clubTargetTimes, setClubTargetTimes] = useState<string[]>([]);
  const [clubTargetCourts, setClubTargetCourts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slot && open) {
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
      setClubTargetTimes(Array.isArray((opts as any).targetTimes) ? (opts as any).targetTimes : []);
      setClubTargetCourts(
        Array.isArray((opts as any).targetCourts)
          ? (opts as any).targetCourts.map((c: number | string) => String(c))
          : [],
      );
    } else if (open) {
      setForm(defaultSlotValues);
      setClubCourtSlug("");
      setClubDoubleSession(false);
      setClubTargetTimes([]);
      setClubTargetCourts([]);
    }
  }, [slot, open]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === form.providerId),
    [providers, form.providerId],
  );

  const handleNumberChange = (key: keyof BookingSlotInput) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: Number(value) }));
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
    }

    const bookingTime =
      (selectedProvider?.type === "Clubspark" && clubTargetTimes[0]) || form.time || "09:00";

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
      await onSave(payload, slot?.id);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save booking slot";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Booking Slot" : "Edit Booking Slot"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a recurring automated booking"
              : "Update the details for this recurring booking"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium">Common settings</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="slot-name">Name</Label>
                <Input
                  id="slot-name"
                  placeholder="e.g., Monday Tennis"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={form.providerId ? String(form.providerId) : ""}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, providerId: Number(val) }))}
                  disabled={providers.length === 0}
                  required
                >
                  <SelectTrigger id="provider">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(value: BookingSlot["frequency"]) =>
                    setForm((prev) => ({ ...prev, frequency: value }))
                  }
                >
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={form.timezone}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, timezone: value }))}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.frequency === "weekly" || form.frequency === "fortnightly") && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfWeek">Day of Week</Label>
                  <Select
                    value={String(form.dayOfWeek ?? 0)}
                    onValueChange={(val) => setForm((prev) => ({ ...prev, dayOfWeek: Number(val) }))}
                  >
                    <SelectTrigger id="dayOfWeek">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.frequency === "monthly" && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth">Day of Month</Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min="1"
                    max="31"
                    value={form.dayOfMonth ?? 1}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, dayOfMonth: Number(e.target.value) }))
                    }
                    required
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Release behaviour</h3>
              <p className="text-sm text-gray-500">When to attempt the booking.</p>
            </div>
            <div className="space-y-2">
              <Label>Attempt strategy</Label>
              <div className="grid grid-cols-2 gap-3">
                <Card
                  className={`cursor-pointer transition-all ${
                    form.attemptStrategy === "offset"
                      ? "ring-2 ring-blue-600 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "offset" }))}
                >
                  <CardContent className="flex items-center gap-2 p-4">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <span>Time Offset</span>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all ${
                    form.attemptStrategy === "release"
                      ? "ring-2 ring-blue-600 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, attemptStrategy: "release" }))}
                >
                  <CardContent className="flex items-center gap-2 p-4">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <span>Release Schedule</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {form.attemptStrategy === "offset" && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="offset-days">Days before</Label>
                  <Input
                    id="offset-days"
                    type="number"
                    min="0"
                    value={form.attemptOffsetDays}
                    onChange={(e) => handleNumberChange("attemptOffsetDays")(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offset-hours">Hours before</Label>
                  <Input
                    id="offset-hours"
                    type="number"
                    min="0"
                    max="23"
                    value={form.attemptOffsetHours}
                    onChange={(e) => handleNumberChange("attemptOffsetHours")(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offset-minutes">Minutes before</Label>
                  <Input
                    id="offset-minutes"
                    type="number"
                    min="0"
                    max="59"
                    value={form.attemptOffsetMinutes}
                    onChange={(e) => handleNumberChange("attemptOffsetMinutes")(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {form.attemptStrategy === "release" && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="release-days">Days before release</Label>
                  <Input
                    id="release-days"
                    type="number"
                    min="0"
                    value={form.releaseDaysBefore}
                    onChange={(e) => handleNumberChange("releaseDaysBefore")(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="release-time">Release time (HH:MM)</Label>
                  <Input
                    id="release-time"
                    type="time"
                    value={form.releaseTime ?? "00:00"}
                    onChange={(e) => setForm((prev) => ({ ...prev, releaseTime: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {selectedProvider?.type === "Clubspark" && (
            <>
              <Separator />
              <div className="space-y-4">
              <div>
                    <h3 className="font-medium">Provider options (Clubspark)</h3>
                    <p className="text-sm text-gray-500">Ordered preferences are used as listed.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="court-slug">Court slug</Label>
                <Input
                  id="court-slug"
                  placeholder="e.g., clissoldparkhackney"
                  value={clubCourtSlug}
                  onChange={(e) => setClubCourtSlug(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="double-session">Book back-to-back</Label>
                <Switch
                  id="double-session"
                  checked={clubDoubleSession}
                  onCheckedChange={setClubDoubleSession}
                />
              </div>

              <div className="space-y-2">
                <Label>Target times</Label>
                <ChipsList
                  items={clubTargetTimes}
                  onChange={setClubTargetTimes}
                  placeholder="HH:MM"
                  note="Use 24hr time; order = preference."
                  onAddAttempt={handleAddTargetTime}
                  onError={setError}
                />
              </div>

              <div className="space-y-2">
                <Label>Target courts</Label>
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
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || providers.length === 0}>
              {isSubmitting ? "Saving..." : mode === "create" ? "Add Booking Slot" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
