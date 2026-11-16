import { useEffect, useState } from "react";

/**
 * A tiny hash router. Routes live in the hash (e.g. `#/bookings/42?view=month`) so the app works on
 * static hosting and a home-screen relaunch reopens where you were.
 */
export interface Route {
  /** Path segments, e.g. ["bookings", "42"]. */
  segments: string[];
  query: URLSearchParams;
}

// Hashes from before the redesign, kept so old bookmarks still land somewhere sensible.
const LEGACY: Record<string, string> = {
  tasks: "/bookings",
  sessions: "/sessions",
  providers: "/providers",
  notifications: "/settings",
  guides: "/settings/guides",
};

export const DEFAULT_PATH = "/bookings";

function readHash(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw || raw === "/") return DEFAULT_PATH;
  if (!raw.startsWith("/")) return LEGACY[raw] ?? DEFAULT_PATH;
  return raw;
}

export function parseRoute(hashPath: string): Route {
  const [path, search = ""] = hashPath.split("?");
  return {
    segments: path.split("/").filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(search),
  };
}

/** Navigate within the app. `replace` swaps the current history entry instead of adding one. */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}) {
  const target = `#${path}`;
  if (window.location.hash === target) return;
  if (replace) {
    window.history.replaceState(window.history.state, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}

/**
 * Close an overlay route (e.g. a booking's detail sheet). Goes back when the overlay was opened in-app,
 * so the back button and the close button agree; otherwise replaces it with `fallback`.
 */
export function closeOverlay(fallback: string) {
  if (window.history.state?.overlay) {
    window.history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

/** Open an overlay route, remembering that it can be closed with history.back(). */
export function openOverlay(path: string) {
  window.history.pushState({ overlay: true }, "", `#${path}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [hashPath, setHashPath] = useState(readHash);

  useEffect(() => {
    const onChange = () => setHashPath(readHash());
    // Normalise legacy or empty hashes once on load.
    if (window.location.hash !== `#${readHash()}`) {
      window.history.replaceState(window.history.state, "", `#${readHash()}`);
    }
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  return parseRoute(hashPath);
}
