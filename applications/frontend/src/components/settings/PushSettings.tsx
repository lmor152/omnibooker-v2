import { useCallback, useEffect, useState } from "react";
import { BellRing, Share, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as api from "../../lib/api";
import { currentSubscription, deviceLabel, isIOS, pushSupport, subscribe } from "../../lib/push";
import { formatRelative } from "../../lib/datetime";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Button } from "../ui/button";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

/**
 * Phone notifications (Web Push). Shown above the Discord settings: it's the easiest channel for most
 * people, and on iPhone it works once the app is on the Home Screen.
 */
export function PushSettings({ getAccessToken }: { getAccessToken: () => Promise<string> }) {
  const support = pushSupport();
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined);
  const [devices, setDevices] = useState<api.PushDevice[]>([]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);
  const [removing, setRemoving] = useState<api.PushDevice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const [key, list, local] = await Promise.all([
        api.fetchPushPublicKey(token),
        api.fetchPushDevices(token),
        currentSubscription().catch(() => null),
      ]);
      setPublicKey(key);
      // Self-heal: this device is subscribed in the browser but the server lost it.
      if (local && key && !list.some((d) => d.endpoint === local.endpoint)) {
        await api.savePushSubscription(token, local, deviceLabel());
        setDevices(await api.fetchPushDevices(token));
      } else {
        setDevices(list);
      }
      setThisEndpoint(local?.endpoint ?? null);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const enable = async () => {
    if (!publicKey) return;
    setBusy("enable");
    try {
      const subscription = await subscribe(publicKey);
      const token = await getAccessToken();
      await api.savePushSubscription(token, subscription, deviceLabel());
      setThisEndpoint(subscription.endpoint);
      setDevices(await api.fetchPushDevices(token));
      toast.success("Notifications are on for this device");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    setBusy("disable");
    try {
      const subscription = await currentSubscription();
      const token = await getAccessToken();
      if (subscription) {
        await api.removePushSubscription(token, subscription.endpoint);
        await subscription.unsubscribe();
      }
      setThisEndpoint(null);
      setDevices(await api.fetchPushDevices(token));
      toast.success("Notifications are off for this device");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const sent = await api.sendTestPush(await getAccessToken());
      if (sent > 0) toast.success(`Sent a test to ${sent} ${sent === 1 ? "device" : "devices"}`);
      else toast.warning("No devices accepted the test. Try turning notifications off and on again.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const removeDevice = async (device: api.PushDevice) => {
    try {
      const token = await getAccessToken();
      await api.deletePushDevice(token, device.id);
      if (device.endpoint === thisEndpoint) {
        await (await currentSubscription())?.unsubscribe();
        setThisEndpoint(null);
      }
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const enabledHere = Boolean(thisEndpoint && devices.some((d) => d.endpoint === thisEndpoint));
  const blocked = support === "supported" && typeof Notification !== "undefined" && Notification.permission === "denied";

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-green-700" />
          <h3 className="text-base font-semibold text-gray-800">Phone notifications</h3>
          {enabledHere && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">On for this device</span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Get a notification when something's booked, needs confirming, fails or is cancelled. Tap it to keep or cancel.
        </p>
      </div>

      {loadError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{loadError}</p>}

      {publicKey === null ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          Push isn't set up on the server yet. It needs VAPID keys. See the Notifications guide.
        </p>
      ) : support === "needs_install" ? (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Add Bookie Monster to your Home Screen first</p>
          <p className="mt-1">
            On iPhone, notifications only work in the Home Screen app. In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" />{" "}
            Share, then <strong>Add to Home Screen</strong>. Open it from there and come back to this page.
          </p>
        </div>
      ) : support === "unsupported" ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">This browser doesn't support notifications.</p>
      ) : blocked ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Notifications are blocked.{" "}
          {isIOS()
            ? "Turn them on in Settings → Notifications → Bookie Monster, then reopen the app."
            : "Allow them for this site in your browser's settings, then reload."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {enabledHere ? (
            <>
              <Button variant="outline" onClick={test} disabled={busy !== null}>
                {busy === "test" ? "Sending…" : "Send a test"}
              </Button>
              <Button variant="ghost" onClick={disable} disabled={busy !== null} className="text-gray-600">
                {busy === "disable" ? "Turning off…" : "Turn off on this device"}
              </Button>
            </>
          ) : (
            <Button onClick={enable} disabled={busy !== null || publicKey === undefined} className="w-full sm:w-auto">
              {busy === "enable" ? "Turning on…" : "Turn on notifications"}
            </Button>
          )}
        </div>
      )}

      {devices.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Your devices</p>
          <ul className="-my-1 divide-y divide-gray-100">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate text-gray-800">{device.userAgent || "Device"}</span>
                  {device.endpoint === thisEndpoint && <span className="shrink-0 text-xs text-gray-500">(this one)</span>}
                  {device.lastUsedAt && (
                    <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">last sent {formatRelative(device.lastUsedAt)}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setRemoving(device)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${device.userAgent || "device"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Stop notifications on this device?"
        description={removing ? `${removing.userAgent || "This device"} won't get booking notifications any more.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => removing && removeDevice(removing)}
      />
    </section>
  );
}
