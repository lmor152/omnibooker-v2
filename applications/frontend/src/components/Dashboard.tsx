import { useCallback, useEffect, useState } from "react";
import { Calendar, Home, ListTodo, Settings as SettingsIcon, LogOut, LogIn, RefreshCw, BookOpen } from "lucide-react";
import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  Provider,
  ProviderInput,
} from "../types";
import { ProviderManager } from "./providers/ProviderManager";
import { SessionManager } from "./sessions/SessionManager";
import { UpcomingTasks } from "./tasks/UpcomingTasks";
import { GuidesTab } from "./guides/GuidesTab";
import * as api from "../lib/api";
import { Alert, AlertDescription } from "./ui/alert";

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
    createdAt: "2024-06-03T10:31:00.000Z",
  },
  {
    id: 3002,
    bookingSlotId: 2001,
    scheduledDate: "2024-06-10T20:00:00.000Z",
    attemptAt: "2024-06-03T07:00:08.000Z",
    status: "success",
    attemptedAt: "2024-06-03T07:00:12.000Z",
    createdAt: "2024-06-01T09:00:00.000Z",
  },
  {
    id: 3003,
    bookingSlotId: 2002,
    scheduledDate: "2024-06-12T18:30:00.000Z",
    attemptAt: "2024-06-12T16:30:00.000Z",
    status: "failed",
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
    createdAt: "2024-06-10T11:00:00.000Z",
  },
];

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

interface DashboardProps {
  isAuthenticated: boolean;
  getAccessToken: () => Promise<string>;
  onLogin: () => void;
  onLogout: () => void;
  onNavigateToHome: () => void;
}

type DashboardTab = "tasks" | "sessions" | "providers" | "guides";

export function Dashboard({ isAuthenticated, getAccessToken, onLogin, onLogout, onNavigateToHome }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("tasks");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bookingSlots, setBookingSlots] = useState<BookingSlot[]>([]);
  const [bookingTasks, setBookingTasks] = useState<BookingTask[]>([]);
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
        const [providersData, slotData, taskData] = await Promise.all([
          api.fetchProviders(token),
          api.fetchBookingSlots(token),
          api.fetchBookingTasks(token),
        ]);
        setProviders(providersData);
        setBookingSlots(slotData);
        setBookingTasks(taskData);
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

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onNavigateToHome}
              className="flex items-center gap-3 -m-1 p-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 transition-colors hover:text-green-700"
              aria-label="Return to home"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl overflow-hidden border border-green-100 shadow-sm transform -rotate-3 bg-white flex items-center justify-center">
                <img src="/favicon.png" alt="Bookie Monster" className="w-7 h-7 sm:w-9 sm:h-9 object-contain" />
              </div>
              <div className="text-left">
                <h1 className="text-green-700 text-xl sm:text-2xl font-bold">Bookie Monster</h1>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAll({ background: true }).catch(() => null)}
                disabled={isRefreshing || !isAuthenticated}
                className="p-2 text-gray-700 hover:text-green-600 transition-colors disabled:opacity-50"
                title={isAuthenticated ? "Refresh" : "Log in to refresh"}
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={onNavigateToHome}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-green-600 transition-colors"
              >
                <Home className="w-5 h-5" />
                <span>Home</span>
              </button>
              <button
                onClick={isAuthenticated ? onLogout : onLogin}
                className={`flex items-center gap-2 px-4 py-2 text-gray-700 transition-colors ${
                  isAuthenticated ? "hover:text-red-600" : "hover:text-green-600"
                }`}
              >
                {isAuthenticated ? <LogOut className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                <span className="hidden sm:inline">{isAuthenticated ? "Logout" : "Log in"}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Tab Navigation */}
      <div className="lg:hidden border-b border-gray-200 bg-white sticky top-[73px] sm:top-[81px] z-40">
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
            active={activeTab === "guides"}
            onClick={() => setActiveTab("guides")}
            icon={<BookOpen className="w-5 h-5" />}
            label="Guides"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!isAuthenticated && (
          <Alert className="mb-6">
            <AlertDescription>
              This is a preview of your dashboard. Log in to load real providers, sessions, and tasks.
            </AlertDescription>
          </Alert>
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
                active={activeTab === "guides"}
                onClick={() => setActiveTab("guides")}
                icon={<BookOpen className="w-5 h-5" />}
                label="Guides"
              />
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-9">
            {activeTab === "tasks" && (
              <UpcomingTasks
                bookingTasks={bookingTasks}
                bookingSlots={bookingSlots}
                providers={providers}
                onCancelTask={handleCancelTask}
                onReactivateTask={handleReactivateTask}
                onDeleteTask={handleDeleteTask}
                onExecuteTask={handleExecuteTask}
              />
            )}
            {activeTab === "sessions" && (
              <SessionManager
                bookingSlots={bookingSlots}
                providers={providers}
                onAddSlot={handleAddSlot}
                onUpdateSlot={handleUpdateSlot}
                onDeleteSlot={handleDeleteSlot}
                onResyncSlot={handleResyncSlot}
              />
            )}
            {activeTab === "providers" && (
              <ProviderManager
                providers={providers}
                onAddProvider={handleAddProvider}
                onUpdateProvider={handleUpdateProvider}
                onDeleteProvider={handleDeleteProvider}
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
