import { useCallback, useEffect, useState } from "react";
import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  Provider,
  ProviderInput,
  User,
} from "../types";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Calendar, LogOut, Settings, Clock, ListChecks, RefreshCw } from "lucide-react";
import { ProvidersTab } from "./ProvidersTab";
import { BookingSlotsTab } from "./BookingSlotsTab";
import { BookingTasksTab } from "./BookingTasksTab";
import { Alert, AlertDescription } from "./ui/alert";
import * as api from "../lib/api";

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

interface DashboardProps {
  user: User;
  getAccessToken: () => Promise<string>;
  onLogout: () => void;
}

export function Dashboard({ user, getAccessToken, onLogout }: DashboardProps) {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading your data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl">Omnibooker</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchAll({ background: true }).catch(() => null)}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
  <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="tasks">
              <ListChecks className="w-4 h-4 mr-2" />
              Booking Tasks
            </TabsTrigger>
            <TabsTrigger value="bookings">
              <Clock className="w-4 h-4 mr-2" />
              Booking Slots
            </TabsTrigger>
            <TabsTrigger value="providers">
              <Settings className="w-4 h-4 mr-2" />
              Providers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            <BookingTasksTab
              bookingTasks={bookingTasks}
              bookingSlots={bookingSlots}
              providers={providers}
              onCancelTask={handleCancelTask}
              onReactivateTask={handleReactivateTask}
              onDeleteTask={handleDeleteTask}
            />
          </TabsContent>

          <TabsContent value="bookings">
            <BookingSlotsTab
              bookingSlots={bookingSlots}
              providers={providers}
              onAddSlot={handleAddSlot}
              onUpdateSlot={handleUpdateSlot}
              onDeleteSlot={handleDeleteSlot}
            />
          </TabsContent>

          <TabsContent value="providers">
            <ProvidersTab
              providers={providers}
              onAddProvider={handleAddProvider}
              onUpdateProvider={handleUpdateProvider}
              onDeleteProvider={handleDeleteProvider}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}