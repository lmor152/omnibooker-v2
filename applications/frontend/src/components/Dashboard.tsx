import { useCallback, useEffect, useState } from "react";
import { Bell, BookOpen, Calendar, ListTodo, LogIn, LogOut, RefreshCw, Settings as SettingsIcon, X } from "lucide-react";
import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  ChatDestination,
  UserPreferences,
  Provider,
  ProviderInput,
} from "../types";
import { ProviderManager } from "./providers/ProviderManager";
import { SessionManager } from "./sessions/SessionManager";
import { UpcomingTasks } from "./tasks/UpcomingTasks";
import { GuidesTab } from "./guides/GuidesTab";
import { NotificationSettings } from "./settings/NotificationSettings";
import * as api from "../lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const AUTH_REQUIRED_MESSAGE = "Please log in to manage your bookings.";
const DEMO_PROVIDERS: Provider[] = [
  {
    id: 1001,
    name: "Clubspark Tennis",
    type: "Clubspark",
    credentials: {
      username: "clubspark@example.com",
      password: "••••••••",
      additionalInfo: "",
      cardDetails: {
        cardNumber: "•••• 6767",
        expiryDate: "08/27",
        cvc: "***",
      },
    },
    createdAt: "2024-05-20T09:00:00.000Z",
  },
  {
    id: 1002,
    name: "Better Gym Islington",
    type: "Better",
    credentials: {
      username: "better@example.com",
      password: "••••••••",
      additionalInfo: "Auto-uses class credits",
    },
    createdAt: "2024-05-22T12:00:00.000Z",
  },
];

const DEMO_BOOKING_SLOTS: BookingSlot[] = [
  {
    id: 2001,
    providerId: 1001,
    name: "Monday Evening Tennis",
    frequency: "weekly",
    dayOfWeek: 1,
    time: "20:00",
    timezone: "Europe/London",
    isActive: true,
    durationMinutes: 60,
    facility: "Finsbury Park Courts",
    attemptStrategy: "release",
    attemptOffsetDays: 0,
    attemptOffsetHours: 0,
    attemptOffsetMinutes: 5,
    releaseDaysBefore: 7,
    releaseTime: "07:00",
    providerOptions: {
      courtSlug: "finsburypark",
      targetTimes: ["20:00"],
    },
    createdAt: "2024-06-01T08:00:00.000Z",
  },
  {
    id: 2002,
    providerId: 1002,
    name: "Wednesday Strength Class",
    frequency: "weekly",
    dayOfWeek: 3,
    time: "18:30",
    timezone: "Europe/London",
    isActive: true,
    durationMinutes: 45,
    facility: "Better Gym Studio 2",
    attemptStrategy: "offset",
    attemptOffsetDays: 0,
    attemptOffsetHours: 2,
    attemptOffsetMinutes: 0,
    releaseDaysBefore: 0,
    releaseTime: null,
    providerOptions: {
      activitySlug: "strength-conditioning",
      useCredits: true,
    },
    createdAt: "2024-06-03T10:30:00.000Z",
  },
];

const DEMO_BOOKING_TASKS: BookingTask[] = [
  {
    id: 3001,
    bookingSlotId: 2001,
    scheduledDate: "2024-06-17T20:00:00.000Z",
    attemptAt: "2024-06-10T07:00:05.000Z",
    status: "pending",
    confirmationStatus: "not_required",
    createdAt: "2024-06-03T10:31:00.000Z",
  },
  {
    id: 3002,
    bookingSlotId: 2001,
    scheduledDate: "2024-06-10T20:00:00.000Z",
    attemptAt: "2024-06-03T07:00:08.000Z",
    status: "success",
    confirmationStatus: "confirmed",
    attemptedAt: "2024-06-03T07:00:12.000Z",
    createdAt: "2024-06-01T09:00:00.000Z",
  },
  {
    id: 3003,
    bookingSlotId: 2002,
    scheduledDate: "2024-06-12T18:30:00.000Z",
    attemptAt: "2024-06-12T16:30:00.000Z",
    status: "failed",
    confirmationStatus: "not_required",
    errorMessage: "No spots available at release",
    attemptedAt: "2024-06-12T16:30:12.000Z",
    createdAt: "2024-06-05T12:00:00.000Z",
  },
  {
    id: 3004,
    bookingSlotId: 2002,
    scheduledDate: "2024-06-19T18:30:00.000Z",
    attemptAt: "2024-06-19T16:30:00.000Z",
    status: "pending",
    confirmationStatus: "not_required",
    createdAt: "2024-06-10T11:00:00.000Z",
  },
];

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

interface DashboardProps {
  isAuthenticated: boolean;
  userName?: string;
  getAccessToken: () => Promise<string>;
  onLogin: () => void;
  onLogout: () => void;
  /** Set when showing demo data to a logged-out visitor; returns them to the home page. */
  onExitPreview?: () => void;
}

type DashboardTab = "tasks" | "sessions" | "providers" | "notifications" | "guides";

const DASHBOARD_TABS: DashboardTab[] = ["tasks", "sessions", "providers", "notifications", "guides"];

// The active tab lives in the URL hash so reloads and home-screen relaunches keep your place.
const tabFromHash = (): DashboardTab => {
  const hash = window.location.hash.slice(1);
  return DASHBOARD_TABS.includes(hash as DashboardTab) ? (hash as DashboardTab) : "tasks";
};

export function Dashboard({
  isAuthenticated,
  userName,
  getAccessToken,
  onLogin,
  onLogout,
  onExitPreview,
}: DashboardProps) {
  const [activeTab, setActiveTabState] = useState<DashboardTab>(tabFromHash);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bookingSlots, setBookingSlots] = useState<BookingSlot[]>([]);
  const [bookingTasks, setBookingTasks] = useState<BookingTask[]>([]);
  const [destinations, setDestinations] = useState<ChatDestination[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(isAuthenticated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!isAuthenticated) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const token = await getAccessToken();
        const [providersData, slotData, taskData, destinationData, preferencesData] = await Promise.all([
          api.fetchProviders(token),
          api.fetchBookingSlots(token),
          api.fetchBookingTasks(token),
          api.fetchChatDestinations(token),
          api.fetchPreferences(token),
        ]);
        setProviders(providersData);
        setBookingSlots(slotData);
        setBookingTasks(taskData);
        setDestinations(destinationData);
        setPreferences(preferencesData);
        setError(null);
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      } finally {
        if (background) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [getAccessToken, isAuthenticated],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setProviders(DEMO_PROVIDERS);
      setBookingSlots(DEMO_BOOKING_SLOTS);
      setBookingTasks(DEMO_BOOKING_TASKS);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    fetchAll().catch(() => null);
  }, [fetchAll, isAuthenticated]);

  useEffect(() => {
    const handleHashChange = () => setActiveTabState(tabFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const setActiveTab = (tab: DashboardTab) => {
    setActiveTabState(tab);
    if (window.location.hash !== `#${tab}`) {
      window.location.hash = tab;
    }
    window.scrollTo({ top: 0 });
  };

  const ensureAuthenticated = useCallback(() => {
    if (!isAuthenticated) {
      setError(AUTH_REQUIRED_MESSAGE);
      return false;
    }
    return true;
  }, [isAuthenticated]);

  const refreshTasks = useCallback(async () => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const tasks = await api.fetchBookingTasks(token);
      setBookingTasks(tasks);
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  }, [ensureAuthenticated, getAccessToken]);

  // Provider handlers
  const handleAddProvider = async (provider: ProviderInput) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const created = await api.createProvider(token, provider);
      setProviders((prev) => [...prev, created]);
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleUpdateProvider = async (id: number, updates: Partial<ProviderInput>) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.updateProvider(token, id, updates);
      setProviders((prev) => prev.map((provider) => (provider.id === id ? updated : provider)));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleDeleteProvider = async (id: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      await api.deleteProvider(token, id);
      const slotIdsToRemove = bookingSlots.filter((slot) => slot.providerId === id).map((slot) => slot.id);
      setProviders((prev) => prev.filter((provider) => provider.id !== id));
      setBookingSlots((prev) => prev.filter((slot) => slot.providerId !== id));
      if (slotIdsToRemove.length) {
        setBookingTasks((prev) => prev.filter((task) => !slotIdsToRemove.includes(task.bookingSlotId)));
      }
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleTestProvider = async (payload: {
    type: string;
    credentials: { username: string; password: string };
  }): Promise<{ success: boolean; message: string }> => {
    if (!ensureAuthenticated()) {
      throw new Error("Not authenticated");
    }
    const token = await getAccessToken();
    return api.testProviderCredentials(token, payload);
  };

  const handleTestSlot = async (payload: {
    providerId: number;
    providerOptions: Record<string, unknown>;
  }): Promise<{ success: boolean; message: string }> => {
    if (!ensureAuthenticated()) {
      throw new Error("Not authenticated");
    }
    const token = await getAccessToken();
    return api.testBookingSlot(token, payload);
  };

  // Booking Slot handlers
  const handleAddSlot = async (slot: BookingSlotInput) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const created = await api.createBookingSlot(token, slot);
      setBookingSlots((prev) => [...prev, created]);
      await refreshTasks();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleUpdateSlot = async (id: number, updates: Partial<BookingSlotInput>) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.updateBookingSlot(token, id, updates);
      setBookingSlots((prev) => prev.map((slot) => (slot.id === id ? updated : slot)));
      await refreshTasks();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleDeleteSlot = async (id: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      await api.deleteBookingSlot(token, id);
      setBookingSlots((prev) => prev.filter((slot) => slot.id !== id));
      setBookingTasks((prev) => prev.filter((task) => task.bookingSlotId !== id));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleResyncSlot = async (id: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      await api.resyncBookingSlot(token, id);
      await refreshTasks();
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  // Booking Task handlers
  const handleCancelTask = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.cancelBookingTask(token, taskId);
      setBookingTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleConfirmBooking = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.confirmBooking(token, taskId);
      setBookingTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const handleCancelBooking = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.cancelBookingWithProvider(token, taskId);
      setBookingTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const handleReactivateTask = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.reactivateBookingTask(token, taskId);
      setBookingTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      await api.deleteBookingTask(token, taskId);
      setBookingTasks((prev) => prev.filter((task) => task.id !== taskId));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  const handleExecuteTask = async (taskId: number) => {
    if (!ensureAuthenticated()) {
      return;
    }
    try {
      const token = await getAccessToken();
      const updated = await api.executeBookingTask(token, taskId);
      setBookingTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setError(null);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-green-50/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    );
  }

  const refresh = () => fetchAll({ background: true }).catch(() => null);
  const userInitial = userName?.charAt(0)?.toUpperCase();

  const brand = (
    <>
      <div className="w-9 h-9 rounded-xl overflow-hidden border border-green-100 shadow-sm transform -rotate-3 bg-white flex items-center justify-center">
        <img src="/favicon.png" alt="" className="w-6 h-6 object-contain" />
      </div>
      <h1 className="text-green-700 text-lg sm:text-xl font-bold">Bookie Monster</h1>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Header + mobile tabs share one sticky container so the tabs always sit flush under the header */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-200 pt-safe px-safe">
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          {onExitPreview ? (
            <button
              type="button"
              onClick={onExitPreview}
              className="flex items-center gap-2.5 -m-1 p-1 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              aria-label="Back to home"
            >
              {brand}
            </button>
          ) : (
            <div className="flex items-center gap-2.5">{brand}</div>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-1">
              <button
                onClick={refresh}
                disabled={isRefreshing}
                className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-green-700 transition-colors disabled:opacity-50"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  className="flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  aria-label="Account menu"
                >
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                    {userInitial ?? "?"}
                    {isRefreshing && (
                      <span className="absolute inset-0 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
                    )}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
                  {userName && (
                    <>
                      <DropdownMenuLabel className="px-3 py-2">
                        <span className="block text-[11px] font-normal uppercase tracking-wide text-gray-400">Signed in as</span>
                        <span className="block truncate text-sm font-medium text-gray-800">{userName}</span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-gray-100" />
                    </>
                  )}
                  <DropdownMenuItem onSelect={refresh} disabled={isRefreshing} className="min-h-10 gap-3 px-3 text-gray-700">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onLogout} className="min-h-10 gap-3 px-3 text-red-600 focus:bg-red-50 focus:text-red-700">
                    <LogOut className="h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 h-10 px-4 rounded-full bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Log in
            </button>
          )}
        </header>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="flex">
            <TabButton
              active={activeTab === "tasks"}
              onClick={() => setActiveTab("tasks")}
              icon={<ListTodo className="w-5 h-5" />}
              label="Tasks"
            />
            <TabButton
              active={activeTab === "sessions"}
              onClick={() => setActiveTab("sessions")}
              icon={<Calendar className="w-5 h-5" />}
              label="Sessions"
            />
            <TabButton
              active={activeTab === "providers"}
              onClick={() => setActiveTab("providers")}
              icon={<SettingsIcon className="w-5 h-5" />}
              label="Providers"
            />
            <TabButton
              active={activeTab === "notifications"}
              onClick={() => setActiveTab("notifications")}
              icon={<Bell className="w-5 h-5" />}
              label="Alerts"
            />
            <TabButton
              active={activeTab === "guides"}
              onClick={() => setActiveTab("guides")}
              icon={<BookOpen className="w-5 h-5" />}
              label="Guides"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-safe">
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="flex-1 min-w-0 break-words">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!isAuthenticated && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Preview with demo data. Log in to manage your own bookings.
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block lg:col-span-3">
            <nav className="space-y-2 sticky top-24">
              <SidebarButton
                active={activeTab === "tasks"}
                onClick={() => setActiveTab("tasks")}
                icon={<ListTodo className="w-5 h-5" />}
                label="Upcoming Tasks"
              />
              <SidebarButton
                active={activeTab === "sessions"}
                onClick={() => setActiveTab("sessions")}
                icon={<Calendar className="w-5 h-5" />}
                label="Booking Sessions"
              />
              <SidebarButton
                active={activeTab === "providers"}
                onClick={() => setActiveTab("providers")}
                icon={<SettingsIcon className="w-5 h-5" />}
                label="Providers"
              />
              <SidebarButton
                active={activeTab === "notifications"}
                onClick={() => setActiveTab("notifications")}
                icon={<Bell className="w-5 h-5" />}
                label="Notifications"
              />
              <SidebarButton
                active={activeTab === "guides"}
                onClick={() => setActiveTab("guides")}
                icon={<BookOpen className="w-5 h-5" />}
                label="Guides"
              />
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-9 min-w-0">
            {activeTab === "tasks" && (
              <UpcomingTasks
                bookingTasks={bookingTasks}
                bookingSlots={bookingSlots}
                providers={providers}
                onCancelTask={handleCancelTask}
                onReactivateTask={handleReactivateTask}
                onDeleteTask={handleDeleteTask}
                onExecuteTask={handleExecuteTask}
                onConfirmBooking={handleConfirmBooking}
                onCancelBooking={handleCancelBooking}
              />
            )}
            {activeTab === "sessions" && (
              <SessionManager
                bookingSlots={bookingSlots}
                providers={providers}
                destinations={destinations}
                preferences={preferences}
                onAddSlot={handleAddSlot}
                onUpdateSlot={handleUpdateSlot}
                onDeleteSlot={handleDeleteSlot}
                onResyncSlot={handleResyncSlot}
                onTestSlot={handleTestSlot}
              />
            )}
            {activeTab === "providers" && (
              <ProviderManager
                providers={providers}
                onAddProvider={handleAddProvider}
                onUpdateProvider={handleUpdateProvider}
                onDeleteProvider={handleDeleteProvider}
                onTestProvider={handleTestProvider}
              />
            )}
            {activeTab === "notifications" && (
              <NotificationSettings
                isAuthenticated={isAuthenticated}
                getAccessToken={getAccessToken}
                destinations={destinations}
                onDestinationsChange={setDestinations}
                onPreferencesChange={setPreferences}
              />
            )}
            {activeTab === "guides" && <GuidesTab />}
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active
          ? "bg-green-50 text-green-700 font-medium"
          : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-4 py-3 transition-colors ${
        active
          ? "bg-green-50 text-green-700 font-medium border-b-2 border-green-600"
          : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span className="text-xs sm:text-sm">{label}</span>
    </button>
  );
}
