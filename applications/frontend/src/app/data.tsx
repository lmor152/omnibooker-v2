import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  ChatDestination,
  Provider,
  ProviderInput,
  UserPreferences,
} from "../types";
import * as api from "../lib/api";
import { addDays, startOfDay, toTime } from "../lib/datetime";
import { DEMO_BOOKING_SLOTS, DEMO_PROVIDERS, buildDemoTasks } from "./demoData";

/**
 * App-wide data: one store for providers, sessions, tasks and notification settings.
 *
 * - The last good snapshot is cached in localStorage so a home-screen relaunch renders instantly,
 *   then refreshes in the background.
 * - It refetches when the app regains focus and every minute while visible, so decisions made in
 *   Discord show up without a manual refresh.
 * - Tasks are loaded from a few weeks back onwards; History and older months fetch their own ranges.
 */

// v2: providers only carry a credentials summary. Older caches (which held full provider
// credentials) are ignored and overwritten.
const CACHE_VERSION = 2;
const REFRESH_INTERVAL_MS = 60_000;
const MIN_FOCUS_REFETCH_MS = 15_000;
/** How far back the main task list goes. Covers "recent" items and the current month's calendar. */
export const TASK_WINDOW_DAYS = 35;

export const taskWindowStart = () => addDays(startOfDay(new Date()), -TASK_WINDOW_DAYS);

interface Snapshot {
  providers: Provider[];
  slots: BookingSlot[];
  tasks: BookingTask[];
  destinations: ChatDestination[];
  preferences: UserPreferences | null;
}

const EMPTY: Snapshot = { providers: [], slots: [], tasks: [], destinations: [], preferences: null };

type SlotTestPayload = { providerId: number; providerOptions: Record<string, unknown> };
type ProviderTestPayload = { type: string; credentials: { username: string; password: string } };
type TestResult = { success: boolean; message: string };

export interface DataContextValue extends Snapshot {
  isAuthenticated: boolean;
  /** True until there is something to show (no cache and the first load hasn't finished). */
  isLoading: boolean;
  isRefreshing: boolean;
  loadError: string | null;
  getAccessToken: () => Promise<string>;
  refresh: () => Promise<void>;
  /** Tasks in any date range, from the store when it covers the range, otherwise from the API. */
  fetchTaskRange: (from: Date, to: Date) => Promise<BookingTask[]>;

  addProvider: (input: ProviderInput) => Promise<void>;
  updateProvider: (id: number, updates: Partial<ProviderInput>) => Promise<void>;
  deleteProvider: (id: number) => Promise<void>;
  testProvider: (payload: ProviderTestPayload) => Promise<TestResult>;

  addSlot: (input: BookingSlotInput) => Promise<void>;
  updateSlot: (id: number, updates: Partial<BookingSlotInput>) => Promise<void>;
  deleteSlot: (id: number) => Promise<void>;
  resyncSlot: (id: number) => Promise<void>;
  testSlot: (payload: SlotTestPayload) => Promise<TestResult>;

  /** Skip a pending attempt. */
  skipTask: (id: number) => Promise<BookingTask>;
  /** Undo a skip, or retry a failed attempt. */
  reactivateTask: (id: number) => Promise<BookingTask>;
  /** Try to book a pending attempt right now. */
  bookNow: (id: number) => Promise<BookingTask>;
  deleteTask: (id: number) => Promise<void>;
  keepBooking: (id: number) => Promise<BookingTask>;
  cancelBooking: (id: number) => Promise<BookingTask>;

  setDestinations: (destinations: ChatDestination[]) => void;
  setPreferences: (preferences: UserPreferences) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside <DataProvider>");
  return value;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

function readCache(key: string): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === CACHE_VERSION ? (parsed.data as Snapshot) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: Snapshot) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: CACHE_VERSION, data }));
  } catch {
    // Storage full or blocked: the app still works, it just won't open instantly next time.
  }
}

/** Clear cached data for every account on this device (on log out). */
export function clearDataCache() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("omnibooker:data:"))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

const NOT_SIGNED_IN = "Log in to manage your own bookings. This is demo data.";

export function DataProvider({
  isAuthenticated,
  userKey,
  getAccessToken,
  children,
}: {
  isAuthenticated: boolean;
  /** Identifies the signed-in user, so cached data is never shown to another account. */
  userKey?: string;
  getAccessToken: () => Promise<string>;
  children: ReactNode;
}) {
  const cacheKey = isAuthenticated && userKey ? `omnibooker:data:${userKey}` : null;
  const [data, setData] = useState<Snapshot>(() => {
    if (!isAuthenticated) {
      return { ...EMPTY, providers: DEMO_PROVIDERS, slots: DEMO_BOOKING_SLOTS, tasks: buildDemoTasks() };
    }
    return (cacheKey && readCache(cacheKey)) || EMPTY;
  });
  const [hasData, setHasData] = useState(() => !isAuthenticated || Boolean(cacheKey && readCache(cacheKey)));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (cacheKey && hasData) writeCache(cacheKey, data);
  }, [cacheKey, data, hasData]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setIsRefreshing(true);
      lastFetch.current = Date.now();
      try {
        const token = await getAccessToken();
        const [providers, slots, tasks, destinations, preferences] = await Promise.all([
          api.fetchProviders(token),
          api.fetchBookingSlots(token),
          api.fetchBookingTasks(token, { from: taskWindowStart() }),
          api.fetchChatDestinations(token),
          api.fetchPreferences(token),
        ]);
        setData({ providers, slots, tasks, destinations, preferences });
        setHasData(true);
        setLoadError(null);
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setIsRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [getAccessToken, isAuthenticated]);

  // Initial load, then keep fresh while the app is open.
  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > MIN_FOCUS_REFETCH_MS) {
        refresh();
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated, refresh]);

  const withToken = useCallback(
    async <T,>(action: (token: string) => Promise<T>): Promise<T> => {
      if (!isAuthenticated) throw new Error(NOT_SIGNED_IN);
      return action(await getAccessToken());
    },
    [getAccessToken, isAuthenticated],
  );

  const refreshTasks = useCallback(async () => {
    const tasks = await withToken((token) => api.fetchBookingTasks(token, { from: taskWindowStart() }));
    setData((prev) => ({ ...prev, tasks }));
  }, [withToken]);

  const replaceTask = useCallback((task: BookingTask) => {
    setData((prev) => ({ ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)) }));
  }, []);

  /** Run a task action, show its result straight away, then reload tasks (the server may re-plan the session). */
  const taskAction = useCallback(
    async (action: (token: string) => Promise<BookingTask>) => {
      try {
        const task = await withToken(action);
        replaceTask(task);
        return task;
      } finally {
        // Also after errors: e.g. a failed "book now" still changes the task's status.
        if (isAuthenticated) refreshTasks().catch(() => null);
      }
    },
    [isAuthenticated, refreshTasks, replaceTask, withToken],
  );

  const fetchTaskRange = useCallback(
    async (from: Date, to: Date) => {
      if (!isAuthenticated || from >= taskWindowStart()) {
        return data.tasks.filter((t) => {
          const time = toTime(t.scheduledDate);
          return time >= from.getTime() && time < to.getTime();
        });
      }
      return withToken((token) => api.fetchBookingTasks(token, { from, to }));
    },
    [data.tasks, isAuthenticated, withToken],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ...data,
      isAuthenticated,
      isLoading: !hasData,
      isRefreshing,
      loadError,
      getAccessToken,
      refresh,
      fetchTaskRange,

      addProvider: async (input) => {
        const created = await withToken((token) => api.createProvider(token, input));
        setData((prev) => ({ ...prev, providers: [...prev.providers, created] }));
      },
      updateProvider: async (id, updates) => {
        const updated = await withToken((token) => api.updateProvider(token, id, updates));
        setData((prev) => ({ ...prev, providers: prev.providers.map((p) => (p.id === id ? updated : p)) }));
      },
      deleteProvider: async (id) => {
        await withToken((token) => api.deleteProvider(token, id));
        setData((prev) => {
          const removedSlots = new Set(prev.slots.filter((s) => s.providerId === id).map((s) => s.id));
          return {
            ...prev,
            providers: prev.providers.filter((p) => p.id !== id),
            slots: prev.slots.filter((s) => !removedSlots.has(s.id)),
            tasks: prev.tasks.filter((t) => !removedSlots.has(t.bookingSlotId)),
          };
        });
      },
      testProvider: (payload) => withToken((token) => api.testProviderCredentials(token, payload)),

      addSlot: async (input) => {
        const created = await withToken((token) => api.createBookingSlot(token, input));
        setData((prev) => ({ ...prev, slots: [...prev.slots, created] }));
        await refreshTasks();
      },
      updateSlot: async (id, updates) => {
        const updated = await withToken((token) => api.updateBookingSlot(token, id, updates));
        setData((prev) => ({ ...prev, slots: prev.slots.map((s) => (s.id === id ? updated : s)) }));
        await refreshTasks();
      },
      deleteSlot: async (id) => {
        await withToken((token) => api.deleteBookingSlot(token, id));
        setData((prev) => ({
          ...prev,
          slots: prev.slots.filter((s) => s.id !== id),
          tasks: prev.tasks.filter((t) => t.bookingSlotId !== id),
        }));
      },
      resyncSlot: async (id) => {
        await withToken((token) => api.resyncBookingSlot(token, id, 6));
        await refreshTasks();
      },
      testSlot: (payload) => withToken((token) => api.testBookingSlot(token, payload)),

      skipTask: (id) => taskAction((token) => api.cancelBookingTask(token, id)),
      reactivateTask: (id) => taskAction((token) => api.reactivateBookingTask(token, id)),
      bookNow: (id) => taskAction((token) => api.executeBookingTask(token, id)),
      deleteTask: async (id) => {
        await withToken((token) => api.deleteBookingTask(token, id));
        setData((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== id) }));
      },
      keepBooking: (id) => taskAction((token) => api.confirmBooking(token, id)),
      cancelBooking: (id) => taskAction((token) => api.cancelBookingWithProvider(token, id)),

      setDestinations: (destinations) => setData((prev) => ({ ...prev, destinations })),
      setPreferences: (preferences) => setData((prev) => ({ ...prev, preferences })),
    }),
    [
      data,
      fetchTaskRange,
      getAccessToken,
      hasData,
      isAuthenticated,
      isRefreshing,
      loadError,
      refresh,
      refreshTasks,
      taskAction,
      withToken,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
