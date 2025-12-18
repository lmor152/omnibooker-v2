import { useMemo } from "react";
import type { BookingTask, BookingSlot, Provider } from "../types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { BookingTaskCard } from "./BookingTaskCard";

interface BookingTasksTabProps {
  bookingTasks: BookingTask[];
  bookingSlots: BookingSlot[];
  providers: Provider[];
  onCancelTask: (id: number) => Promise<void>;
  onReactivateTask: (id: number) => Promise<void>;
  onDeleteTask: (id: number) => Promise<void>;
}

export function BookingTasksTab({
  bookingTasks,
  bookingSlots,
  providers,
  onCancelTask,
  onReactivateTask,
  onDeleteTask,
}: BookingTasksTabProps) {

  const { upcomingTasks, pastTasks } = useMemo(() => {
    const now = Date.now();
    const upcoming: BookingTask[] = [];
    const past: BookingTask[] = [];

    const getAttemptTime = (task: BookingTask) => new Date(task.attemptAt ?? task.scheduledDate).getTime();

    bookingTasks.forEach((task) => {
      const attemptTime = getAttemptTime(task);
      if (attemptTime >= now) {
        upcoming.push(task);
      } else {
        past.push(task);
      }
    });

    upcoming.sort((a, b) => getAttemptTime(a) - getAttemptTime(b));
    past.sort((a, b) => getAttemptTime(b) - getAttemptTime(a));

    return { upcomingTasks: upcoming, pastTasks: past };
  }, [bookingTasks]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Booking Tasks</h2>
        <p className="text-gray-600">
          View and manage individual booking attempts
        </p>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Past ({pastTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {upcomingTasks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No upcoming booking tasks</CardTitle>
                <CardDescription>
                  Create active booking slots to see upcoming tasks here
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingTasks.map((task) => {
                const slot = bookingSlots.find(s => s.id === task.bookingSlotId);
                const provider = slot ? providers.find(p => p.id === slot.providerId) : undefined;
                return (
                  <BookingTaskCard
                    key={task.id}
                    task={task}
                    slot={slot}
                    provider={provider}
                    onCancel={onCancelTask}
                    onReactivate={onReactivateTask}
                    onDelete={onDeleteTask}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past">
          {pastTasks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No past booking tasks</CardTitle>
                <CardDescription>
                  Completed, failed, and cancelled tasks will appear here
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastTasks.map((task) => {
                const slot = bookingSlots.find(s => s.id === task.bookingSlotId);
                const provider = slot ? providers.find(p => p.id === slot.providerId) : undefined;
                return (
                  <BookingTaskCard
                    key={task.id}
                    task={task}
                    slot={slot}
                    provider={provider}
                    onCancel={onCancelTask}
                    onReactivate={onReactivateTask}
                    onDelete={onDeleteTask}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
