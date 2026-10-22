import type { BookingSlotInput, ChatDestination, ConfirmationPolicy, UserPreferences } from "../../types";
import { ChipsList } from "../ChipsList";
import { Field, ToggleRow } from "../common/Field";
import { FormSection } from "../common/FormSection";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Switch } from "../ui/switch";

type NotificationFields = Pick<
  BookingSlotInput,
  | "notificationsEnabled"
  | "notifyDestinationId"
  | "autoCancelEnabled"
  | "confirmDeadlineHours"
  | "reminderHours"
  | "confirmationPolicy"
>;

interface NotificationSettingsSectionProps {
  value: NotificationFields;
  destinations: ChatDestination[];
  /** The user's defaults, used to show what "Default" means and which fields apply. */
  defaults: UserPreferences | null;
  onChange: (updates: Partial<NotificationFields>) => void;
  onError: (message: string | null) => void;
}

/** Session-level overrides for notifications and booking confirmation. Empty means "use my default". */
export function NotificationSettingsSection({
  value,
  destinations,
  defaults,
  onChange,
  onError,
}: NotificationSettingsSectionProps) {
  const defaultNotifications = defaults?.notificationsEnabled ?? true;
  const defaultAutoCancel = defaults?.autoCancelDefault ?? false;
  const notificationsOff = !(value.notificationsEnabled ?? defaultNotifications);
  const autoCancelOff = !(value.autoCancelEnabled ?? defaultAutoCancel);

  return (
    <FormSection
      title="Notifications & confirmation"
      description={`Defaults are set on the Notifications page. Anything left as "Default" follows them.`}
      summary={summarize(value, destinations)}
      collapsible
      defaultOpen={hasOverrides(value)}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TriState
          id="session-notifications"
          label="Post booking updates"
          value={value.notificationsEnabled}
          defaultValue={defaultNotifications}
          onChange={(notificationsEnabled) => onChange({ notificationsEnabled })}
        />

        <Field label="Discord channel" htmlFor="session-channel" disabled={notificationsOff}>
          <NativeSelect
            id="session-channel"
            value={value.notifyDestinationId ?? ""}
            disabled={notificationsOff}
            onChange={(event) =>
              onChange({ notifyDestinationId: event.target.value ? Number(event.target.value) : null })
            }
          >
            <option value="">Default channel</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <TriState
          id="session-auto-cancel"
          label="Ask me to confirm (auto-cancel if not)"
          value={value.autoCancelEnabled}
          defaultValue={defaultAutoCancel}
          onChange={(autoCancelEnabled) => onChange({ autoCancelEnabled })}
        />

        <Field label="Who can confirm" htmlFor="session-policy" disabled={autoCancelOff}>
          <NativeSelect
            id="session-policy"
            value={value.confirmationPolicy ?? "owner_only"}
            disabled={autoCancelOff}
            onChange={(event) => onChange({ confirmationPolicy: event.target.value as ConfirmationPolicy })}
          >
            <option value="owner_only">Only me</option>
            <option value="anyone">Anyone in the channel</option>
          </NativeSelect>
        </Field>

        <Field
          label="Confirm by (hours before)"
          htmlFor="session-deadline"
          disabled={autoCancelOff}
          hint="Never later than the provider's refund deadline."
        >
          <Input
            id="session-deadline"
            type="number"
            inputMode="numeric"
            min={0}
            max={336}
            placeholder="Default"
            disabled={autoCancelOff}
            value={value.confirmDeadlineHours ?? ""}
            onChange={(event) =>
              onChange({
                confirmDeadlineHours: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </Field>
      </div>

      {autoCancelOff && (
        <p className="text-xs text-gray-500">
          Turn on "Ask me to confirm" to choose who can confirm, the deadline and reminders.
        </p>
      )}

      <ToggleRow
        label="Custom reminders"
        description="Hours before the confirmation deadline."
        htmlFor="session-custom-reminders"
        disabled={autoCancelOff}
      >
        <Switch
          id="session-custom-reminders"
          checked={value.reminderHours != null}
          disabled={autoCancelOff}
          onCheckedChange={(checked) => onChange({ reminderHours: checked ? [12, 2] : null })}
        />
      </ToggleRow>
      {value.reminderHours != null && !autoCancelOff && (
        <ChipsList
          items={value.reminderHours.map(String)}
          onChange={(items) => onChange({ reminderHours: items.map(Number) })}
          placeholder="e.g. 6"
          inputMode="numeric"
          onAddAttempt={(raw) => {
            const hours = Number(raw);
            return Number.isInteger(hours) && hours >= 0 && hours <= 336
              ? { value: String(hours) }
              : { error: "Reminders must be whole hours between 0 and 336" };
          }}
          onError={onError}
        />
      )}
    </FormSection>
  );
}

function TriState({
  id,
  label,
  value,
  defaultValue,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null | undefined;
  defaultValue: boolean;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <NativeSelect
        id={id}
        value={value == null ? "" : value ? "on" : "off"}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "on")}
      >
        <option value="">Default ({defaultValue ? "on" : "off"})</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </NativeSelect>
    </Field>
  );
}

function hasOverrides(value: NotificationFields): boolean {
  return (
    value.notificationsEnabled != null ||
    value.notifyDestinationId != null ||
    value.autoCancelEnabled != null ||
    value.confirmDeadlineHours != null ||
    value.reminderHours != null ||
    (value.confirmationPolicy ?? "owner_only") !== "owner_only"
  );
}

function summarize(value: NotificationFields, destinations: ChatDestination[]): string {
  const parts: string[] = [];
  if (value.autoCancelEnabled === true) parts.push("confirmation on");
  if (value.autoCancelEnabled === false) parts.push("confirmation off");
  const channel = destinations.find((destination) => destination.id === value.notifyDestinationId);
  if (channel) parts.push(channel.name);
  return parts.length ? parts.join(", ") : "Using your defaults";
}
