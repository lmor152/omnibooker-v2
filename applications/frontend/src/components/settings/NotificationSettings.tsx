import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, Link2, MessageSquare, RefreshCw, Send, Star, Trash2, Unlink, X } from "lucide-react";
import type { ChatDestination, ChatIdentity, ChatLinkCode, UserPreferences } from "../../types";
import * as api from "../../lib/api";
import { ChipsList } from "../ChipsList";
import { ActionMenu } from "../common/ActionMenu";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Field, ToggleRow } from "../common/Field";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Switch } from "../ui/switch";

interface NotificationSettingsProps {
  isAuthenticated: boolean;
  getAccessToken: () => Promise<string>;
  destinations: ChatDestination[];
  onDestinationsChange: (destinations: ChatDestination[]) => void;
  onPreferencesChange: (preferences: UserPreferences) => void;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

export function NotificationSettings({
  isAuthenticated,
  getAccessToken,
  destinations,
  onDestinationsChange,
  onPreferencesChange,
}: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [identities, setIdentities] = useState<ChatIdentity[]>([]);
  const [linkCode, setLinkCode] = useState<ChatLinkCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [removingChannel, setRemovingChannel] = useState<ChatDestination | null>(null);

  const run = useCallback(
    async <T,>(action: (token: string) => Promise<T>): Promise<T | undefined> => {
      try {
        const token = await getAccessToken();
        const result = await action(token);
        setError(null);
        return result;
      } catch (err) {
        setError(getErrorMessage(err));
        return undefined;
      }
    },
    [getAccessToken],
  );

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    await run(async (token) => {
      const [prefsData, identityData, destinationData] = await Promise.all([
        api.fetchPreferences(token),
        api.fetchChatIdentities(token),
        api.fetchChatDestinations(token),
      ]);
      setPrefs(prefsData);
      onPreferencesChange(prefsData);
      setIdentities(identityData);
      onDestinationsChange(destinationData);
    });
  }, [isAuthenticated, onDestinationsChange, onPreferencesChange, run]);

  useEffect(() => {
    reload().catch(() => null);
  }, [reload]);

  // Tick while a link code is showing so the countdown updates.
  useEffect(() => {
    if (!linkCode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [linkCode]);

  if (!isAuthenticated) {
    return (
      <div>
        <PageHeader title="Notifications" />
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Log in to set up Discord notifications and booking confirmations.
        </p>
      </div>
    );
  }

  const secondsLeft = linkCode ? Math.max(0, Math.round((Date.parse(linkCode.expiresAt) - now) / 1000)) : 0;
  const deadlineMode = prefs?.confirmDeadlineHours == null ? "auto" : "fixed";

  const handleGenerateCode = async () => {
    const code = await run((token) => api.createDiscordLinkCode(token));
    if (code) setLinkCode(code);
  };

  const handleUnlink = async (identity: ChatIdentity) => {
    await run((token) => api.deleteChatIdentity(token, identity.id));
    setIdentities((prev) => prev.filter((item) => item.id !== identity.id));
  };

  const handleRemoveChannel = async (destination: ChatDestination) => {
    await run((token) => api.deleteChatDestination(token, destination.id));
    await reload();
  };

  const handleTestChannel = async (destination: ChatDestination) => {
    const ok = await run(async (token) => {
      await api.testChatDestination(token, destination.id);
      return true;
    });
    if (ok) setNotice(`Sent a test message to ${destination.name}.`);
  };

  const savePrefs = async (updates: Partial<UserPreferences>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, ...updates });
    setIsSaving(true);
    const saved = await run((token) => api.updatePreferences(token, updates));
    if (saved) {
      setPrefs(saved);
      onPreferencesChange(saved);
    }
    setIsSaving(false);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Get booking updates in Discord and confirm bookings there, or let unconfirmed ones be cancelled for a refund."
        actions={
          <Button variant="outline" size="icon" onClick={() => reload()} aria-label="Refresh notification settings">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <div className="space-y-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 break-words">
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="min-w-0 flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-green-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Discord account */}
        <SettingsCard icon={Link2} title="Discord account">
          {identities.length > 0 ? (
            <ul className="space-y-1">
              {identities.map((identity) => (
                <li key={identity.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    Linked as <strong>{identity.externalUsername ?? "Discord user"}</strong>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleUnlink(identity)} className="text-gray-600 hover:text-red-600">
                    <Unlink className="w-4 h-4" />
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">Not linked yet. Linking lets you keep or cancel bookings from Discord.</p>
          )}

          {linkCode && secondsLeft > 0 ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-1.5">
              <p className="text-sm text-gray-700">In Discord, run:</p>
              <p className="font-mono text-lg font-semibold tracking-wider text-gray-900 break-all select-all">
                /bookie link {linkCode.code}
              </p>
              <p className="text-xs text-gray-600">
                Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}. Then refresh this
                page.
              </p>
            </div>
          ) : (
            <Button onClick={handleGenerateCode} className="w-full sm:w-auto">
              {identities.length > 0 ? "Link another account" : "Generate link code"}
            </Button>
          )}

          {linkCode?.botInviteUrl && (
            <p className="text-sm text-gray-600">
              Bot not in your server yet?{" "}
              <a href={linkCode.botInviteUrl} target="_blank" rel="noreferrer" className="text-green-700 underline">
                Add Bookie Monster to a server
              </a>
              . See the Discord guide for step-by-step instructions.
            </p>
          )}
        </SettingsCard>

        {/* Channels */}
        <SettingsCard
          icon={MessageSquare}
          title="Channels"
          description={
            <>
              Run <code className="font-mono">/bookie channel</code> in a Discord channel to add it here. Sessions post to
              your default channel unless you choose another one in the session.
            </>
          }
        >
          {destinations.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No channels yet.</p>
          ) : (
            <ul className="-my-1 divide-y divide-gray-100">
              {destinations.map((destination) => {
                const isDefault = prefs?.defaultDestinationId === destination.id;
                return (
                  <li key={destination.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="truncate font-medium text-gray-800">{destination.name}</span>
                      {isDefault && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Default
                        </span>
                      )}
                    </div>
                    <ActionMenu
                      label={`Actions for ${destination.name}`}
                      items={[
                        {
                          label: "Make default",
                          icon: Star,
                          onSelect: () => savePrefs({ defaultDestinationId: destination.id }),
                          disabled: isDefault,
                        },
                        { label: "Send test message", icon: Send, onSelect: () => handleTestChannel(destination) },
                        {
                          label: "Remove",
                          icon: Trash2,
                          onSelect: () => setRemovingChannel(destination),
                          destructive: true,
                        },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsCard>

        {/* Defaults */}
        {prefs && (
          <SettingsCard
            icon={Bell}
            title="Defaults for all sessions"
            description="Each session can override these in its settings."
            status={isSaving ? "Saving…" : undefined}
          >
            <ToggleRow
              label="Post booking updates"
              description="Send a message when a booking is made, kept or cancelled."
              htmlFor="pref-notifications"
            >
              <Switch
                id="pref-notifications"
                checked={prefs.notificationsEnabled}
                onCheckedChange={(value) => savePrefs({ notificationsEnabled: value })}
              />
            </ToggleRow>
            <ToggleRow
              label="Ask me to confirm bookings"
              description="Unconfirmed bookings are cancelled at the deadline, while they can still be refunded."
              htmlFor="pref-auto-cancel"
            >
              <Switch
                id="pref-auto-cancel"
                checked={prefs.autoCancelDefault}
                onCheckedChange={(value) => savePrefs({ autoCancelDefault: value })}
              />
            </ToggleRow>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Confirmation deadline" htmlFor="pref-deadline-mode">
                <NativeSelect
                  id="pref-deadline-mode"
                  value={deadlineMode}
                  onChange={(event) =>
                    savePrefs({ confirmDeadlineHours: event.target.value === "auto" ? null : 24 })
                  }
                >
                  <option value="auto">Before the refund deadline</option>
                  <option value="fixed">Before the session</option>
                </NativeSelect>
              </Field>
              {deadlineMode === "auto" ? (
                <Field
                  label="Hours before the refund deadline"
                  htmlFor="pref-refund-buffer"
                  hint="Uses each provider's refund deadline."
                >
                  <NumberInput
                    id="pref-refund-buffer"
                    value={prefs.refundBufferHours}
                    min={0}
                    max={48}
                    onCommit={(value) => savePrefs({ refundBufferHours: value })}
                  />
                </Field>
              ) : (
                <Field
                  label="Hours before the session"
                  htmlFor="pref-deadline-hours"
                  hint="Never later than the refund deadline."
                >
                  <NumberInput
                    id="pref-deadline-hours"
                    value={prefs.confirmDeadlineHours ?? 24}
                    min={0}
                    max={336}
                    onCommit={(value) => savePrefs({ confirmDeadlineHours: value })}
                  />
                </Field>
              )}
            </div>

            <Field label="Reminders" htmlFor="pref-reminders" hint="Hours before the confirmation deadline.">
              <ChipsList
                id="pref-reminders"
                items={prefs.reminderHours.map(String)}
                onChange={(items) => savePrefs({ reminderHours: items.map(Number) })}
                placeholder="e.g. 12"
                inputMode="numeric"
                onAddAttempt={parseHours}
                onError={setError}
              />
            </Field>

            <Field
              label="Short-notice bookings"
              htmlFor="pref-short-notice"
              hint="Bookings made less than this many hours before their deadline are kept without asking."
            >
              <NumberInput
                id="pref-short-notice"
                value={prefs.shortNoticeMinHours}
                min={0}
                max={48}
                onCommit={(value) => savePrefs({ shortNoticeMinHours: value })}
              />
            </Field>
          </SettingsCard>
        )}
      </div>

      <ConfirmDialog
        open={removingChannel !== null}
        onOpenChange={(open) => !open && setRemovingChannel(null)}
        title="Remove this channel?"
        description={
          removingChannel
            ? `Bookie Monster will stop posting to ${removingChannel.name}. You can add it again with /bookie channel.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => removingChannel && handleRemoveChannel(removingChannel)}
      />
    </div>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  status,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-green-700" />
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          {status && <span className="text-xs text-gray-500">{status}</span>}
        </div>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function parseHours(value: string): { value: string } | { error: string } {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 0 || hours > 336) {
    return { error: "Reminders must be whole hours between 0 and 336" };
  }
  return { value: String(hours) };
}

/** Small number field that saves on blur/Enter rather than on every keystroke. */
function NumberInput({
  id,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
      className="w-24"
    />
  );
}
