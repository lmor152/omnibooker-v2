import { useCallback, useEffect, useState } from "react";
import { Bell, Link2, MessageSquare, RefreshCw, Send, Trash2, Unlink } from "lucide-react";
import type { ChatDestination, ChatIdentity, ChatLinkCode, UserPreferences } from "../../types";
import * as api from "../../lib/api";
import { ChipsList } from "../ChipsList";
import { Alert, AlertDescription } from "../ui/alert";
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
      <Alert>
        <AlertDescription>Log in to set up Discord notifications and booking confirmations.</AlertDescription>
      </Alert>
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Notifications</h2>
          <p className="text-gray-600">
            Get booking updates in Discord and confirm bookings there, or let unconfirmed ones be cancelled for a
            refund.
          </p>
        </div>
        <button
          onClick={() => reload()}
          className="flex items-center gap-2 px-3 py-2 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 self-start"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {/* Discord account */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-green-700" />
          <h3 className="text-lg font-semibold text-gray-800">Discord account</h3>
        </div>

        {identities.length > 0 ? (
          <ul className="space-y-2">
            {identities.map((identity) => (
              <li key={identity.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Linked as <strong>{identity.externalUsername ?? "Discord user"}</strong>
                </span>
                <button
                  onClick={() => handleUnlink(identity)}
                  className="flex items-center gap-1 text-gray-600 hover:text-red-600"
                >
                  <Unlink className="w-4 h-4" />
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Not linked yet. Linking lets you keep or cancel bookings from Discord.</p>
        )}

        {linkCode && secondsLeft > 0 ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
            <p className="text-sm text-gray-700">In Discord, run:</p>
            <p className="font-mono text-xl font-semibold tracking-wider text-gray-900">/bookie link {linkCode.code}</p>
            <p className="text-xs text-gray-600">
              Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}. Then refresh this
              page.
            </p>
          </div>
        ) : (
          <button
            onClick={handleGenerateCode}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            {identities.length > 0 ? "Link another account" : "Generate link code"}
          </button>
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
      </section>

      {/* Channels */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-green-700" />
          <h3 className="text-lg font-semibold text-gray-800">Channels</h3>
        </div>
        <p className="text-sm text-gray-600">
          Run <code className="font-mono">/bookie channel</code> in a Discord channel to add it here. Sessions post to
          your default channel unless you choose another one in the session.
        </p>
        {destinations.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No channels yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {destinations.map((destination) => {
              const isDefault = prefs?.defaultDestinationId === destination.id;
              return (
                <li key={destination.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="default-channel"
                      checked={isDefault}
                      onChange={() => savePrefs({ defaultDestinationId: destination.id })}
                    />
                    <span className="font-medium text-gray-800">{destination.name}</span>
                    {isDefault && <span className="text-xs text-green-700">default</span>}
                  </label>
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={() => handleTestChannel(destination)}
                      className="flex items-center gap-1 text-gray-600 hover:text-green-700"
                    >
                      <Send className="w-4 h-4" />
                      Test
                    </button>
                    <button
                      onClick={() => handleRemoveChannel(destination)}
                      className="flex items-center gap-1 text-gray-600 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Defaults */}
      {prefs && (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-green-700" />
            <h3 className="text-lg font-semibold text-gray-800">Defaults for all sessions</h3>
            {isSaving && <span className="text-xs text-gray-500">Saving…</span>}
          </div>
          <p className="text-sm text-gray-600">Each session can override these in its settings.</p>

          <ToggleRow
            label="Post booking updates"
            description="Send a message when a booking is made, kept or cancelled."
            checked={prefs.notificationsEnabled}
            onChange={(value) => savePrefs({ notificationsEnabled: value })}
          />
          <ToggleRow
            label="Ask me to confirm bookings"
            description="Unconfirmed bookings are cancelled at the deadline, while they can still be refunded."
            checked={prefs.autoCancelDefault}
            onChange={(value) => savePrefs({ autoCancelDefault: value })}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">Confirmation deadline</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="deadline-mode"
                className="mt-1"
                checked={deadlineMode === "auto"}
                onChange={() => savePrefs({ confirmDeadlineHours: null })}
              />
              <span>
                Automatic: the provider's refund deadline, minus{" "}
                <NumberInput
                  value={prefs.refundBufferHours}
                  min={0}
                  max={48}
                  onCommit={(value) => savePrefs({ refundBufferHours: value })}
                />{" "}
                hours
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="deadline-mode"
                className="mt-1"
                checked={deadlineMode === "fixed"}
                onChange={() => savePrefs({ confirmDeadlineHours: 24 })}
              />
              <span>
                <NumberInput
                  value={prefs.confirmDeadlineHours ?? 24}
                  min={0}
                  max={336}
                  disabled={deadlineMode !== "fixed"}
                  onCommit={(value) => savePrefs({ confirmDeadlineHours: value })}
                />{" "}
                hours before the session (never later than the refund deadline)
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">Reminders (hours before the deadline)</p>
            <ChipsList
              items={prefs.reminderHours.map(String)}
              onChange={(items) => savePrefs({ reminderHours: items.map(Number) })}
              placeholder="e.g. 12"
              onAddAttempt={parseHours}
              onError={setError}
            />
          </div>

          <label className="flex flex-wrap items-center gap-2 text-sm">
            Keep bookings without asking if they're made less than
            <NumberInput
              value={prefs.shortNoticeMinHours}
              min={0}
              max={48}
              onCommit={(value) => savePrefs({ shortNoticeMinHours: value })}
            />
            hours before their deadline
          </label>
        </section>
      )}
    </div>
  );
}

function parseHours(value: string): { value: string } | { error: string } {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 0 || hours > 336) {
    return { error: "Reminders must be whole hours between 0 and 336" };
  }
  return { value: String(hours) };
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Small number field that saves on blur/Enter rather than on every keystroke. */
function NumberInput({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
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
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
      className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
    />
  );
}
