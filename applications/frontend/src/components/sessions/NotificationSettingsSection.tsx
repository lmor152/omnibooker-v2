import type { BookingSlotInput, ChatDestination, ConfirmationPolicy } from "../../types";
import { ChipsList } from "../ChipsList";

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
  onChange: (updates: Partial<NotificationFields>) => void;
  onError: (message: string | null) => void;
}

const selectClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm";

/** Session-level overrides for notifications and booking confirmation. Empty means "use my default". */
export function NotificationSettingsSection({
  value,
  destinations,
  onChange,
  onError,
}: NotificationSettingsSectionProps) {
  const autoCancelOff = value.autoCancelEnabled === false;

  return (
    <details className="border border-gray-200 rounded-lg" open={hasOverrides(value)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-800">
        Notifications &amp; confirmation
        <span className="ml-2 font-normal text-gray-500">{summarize(value, destinations)}</span>
      </summary>
      <div className="px-4 pb-4 space-y-4">
        <p className="text-xs text-gray-500">
          Defaults are set on the Notifications page. Anything left as "Default" follows them.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discord channel</label>
            <select
              className={selectClass}
              value={value.notifyDestinationId ?? ""}
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
            </select>
          </div>

          <TriState
            label="Post booking updates"
            value={value.notificationsEnabled}
            onChange={(notificationsEnabled) => onChange({ notificationsEnabled })}
          />

          <TriState
            label="Ask me to confirm (auto-cancel if not)"
            value={value.autoCancelEnabled}
            onChange={(autoCancelEnabled) => onChange({ autoCancelEnabled })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Who can confirm</label>
            <select
              className={selectClass}
              value={value.confirmationPolicy ?? "owner_only"}
              disabled={autoCancelOff}
              onChange={(event) => onChange({ confirmationPolicy: event.target.value as ConfirmationPolicy })}
            >
              <option value="owner_only">Only me</option>
              <option value="anyone">Anyone in the channel</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm by (hours before)</label>
            <input
              type="number"
              min={0}
              max={336}
              placeholder="Default"
              disabled={autoCancelOff}
              className={selectClass}
              value={value.confirmDeadlineHours ?? ""}
              onChange={(event) =>
                onChange({
                  confirmDeadlineHours: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
            <p className="mt-1 text-xs text-gray-500">Never later than the provider's refund deadline.</p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <input
              type="checkbox"
              checked={value.reminderHours != null}
              disabled={autoCancelOff}
              onChange={(event) => onChange({ reminderHours: event.target.checked ? [12, 2] : null })}
            />
            Custom reminders (hours before the deadline)
          </label>
          {value.reminderHours != null && (
            <ChipsList
              items={value.reminderHours.map(String)}
              onChange={(items) => onChange({ reminderHours: items.map(Number) })}
              placeholder="e.g. 6"
              onAddAttempt={(raw) => {
                const hours = Number(raw);
                return Number.isInteger(hours) && hours >= 0 && hours <= 336
                  ? { value: String(hours) }
                  : { error: "Reminders must be whole hours between 0 and 336" };
              }}
              onError={onError}
            />
          )}
        </div>
      </div>
    </details>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        className={selectClass}
        value={value == null ? "" : value ? "on" : "off"}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "on")}
      >
        <option value="">Default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </div>
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
  return parts.length ? `(${parts.join(", ")})` : "(using defaults)";
}
