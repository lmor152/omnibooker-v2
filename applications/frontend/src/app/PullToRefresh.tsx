import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isStandalone } from "../lib/push";
import { cn } from "../components/ui/utils";

const THRESHOLD = 70; // px of pull needed to refresh
const MAX_PULL = 110;

/**
 * Pull-to-refresh for the Home Screen app. iOS only gives Safari its own pull-to-refresh, so
 * the installed app (display-mode: standalone) needs this. Inactive in a normal browser tab,
 * and while a sheet or dialog is open so it never fights with swiping those closed.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!isStandalone() || !("ontouchstart" in window)) return;

    const overlayOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [data-vaul-drawer]'));

    const onStart = (event: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || event.touches.length !== 1 || overlayOpen()) {
        start.current = null;
        return;
      }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (start.current === null) return;
      const distance = event.touches[0].clientY - start.current.y;
      const sideways = Math.abs(event.touches[0].clientX - start.current.x);
      if (pullRef.current === 0 && sideways > Math.abs(distance)) {
        start.current = null; // a horizontal swipe (e.g. the week strip): leave it alone
        return;
      }
      if (distance <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistance, so it feels like pulling against something.
      const eased = Math.min(MAX_PULL, distance * 0.5);
      pullRef.current = eased;
      setPull(eased);
      if (event.cancelable) event.preventDefault(); // stop the page bouncing while we show the spinner
    };

    const onEnd = async () => {
      if (start.current === null) return;
      start.current = null;
      const pulled = pullRef.current;
      pullRef.current = 0;
      if (pulled < THRESHOLD) {
        setPull(0);
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await Promise.all([onRefresh(), checkForNewVersion()]);
      } finally {
        busy.current = false;
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);

  if (pull === 0 && !refreshing) return null;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + 3.5rem + ${Math.max(0, pull - 40)}px)` }}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md transition-opacity",
          progress < 0.3 && "opacity-0",
        )}
      >
        <RefreshCw
          className={cn("h-4 w-4", progress >= 1 ? "text-green-700" : "text-gray-500", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
        <span className="sr-only">{refreshing ? "Refreshing" : "Pull to refresh"}</span>
      </span>
    </div>
  );
}

/** If a new version of the app has been deployed, load it (once) after the refresh. */
async function checkForNewVersion() {
  try {
    const response = await fetch(`/index.html?check=${Date.now()}`, { cache: "no-store" });
    const html = await response.text();
    const latest = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    const current = [...document.scripts].map((s) => s.src).find((src) => /\/assets\/index-[\w-]+\.js/.test(src));
    if (latest && current && !current.endsWith(latest)) {
      await navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => null);
      window.location.reload();
    }
  } catch {
    // Offline or blocked: the data refresh still happened.
  }
}
