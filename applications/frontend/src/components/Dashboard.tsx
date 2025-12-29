import { useCallback, useEffect, useState } from "react";
import { Calendar, Home, ListTodo, Settings as SettingsIcon, LogOut, RefreshCw } from "lucide-react";
import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  Provider,
  ProviderInput,
  User,
} from "../types";
import { ProviderManager } from "./providers/ProviderManager";
import { SessionManager } from "./sessions/SessionManager";
import { UpcomingTasks } from "./tasks/UpcomingTasks";
import * as api from "../lib/api";
import { Alert, AlertDescription } from "./ui/alert";

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

interface DashboardProps {
  user: User;
  getAccessToken: () => Promise<string>;
  onLogout: () => void;
  onNavigateToHome: () => void;
}

type DashboardTab = "tasks" | "sessions" | "providers";

export function Dashboard({ user, getAccessToken, onLogout, onNavigateToHome }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("tasks");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bookingSlots, setBookingSlots] = useState<BookingSlot[]>([]);
  const [bookingTasks, setBookingTasks] = useState<BookingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
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
    [getAccessToken],
  );

  useEffect(() => {
    fetchAll().catch(() => null);
  }, [fetchAll]);

  const refreshTasks = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const tasks = await api.fetchBookingTasks(token);
      setBookingTasks(tasks);
    } catch (err) {
      setError(getErrorMessage(err));
      throw err;
    }
  }, [getAccessToken]);

  // Provider handlers
  const handleAddProvider = async (provider: ProviderInput) => {
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
                disabled={isRefreshing}
                className="p-2 text-gray-700 hover:text-green-600 transition-colors disabled:opacity-50"
                title="Refresh"
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
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-red-600 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Logout</span>
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
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
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
