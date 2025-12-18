import type { BookingTask, BookingSlot, Provider } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Calendar, Clock, AlertCircle, CheckCircle, XCircle, Ban, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Alert, AlertDescription } from "./ui/alert";

interface BookingTaskCardProps {
  task: BookingTask;
  slot?: BookingSlot;
  provider?: Provider;
  onCancel: (id: number) => Promise<void>;
  onReactivate: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function BookingTaskCard({ task, slot, provider, onCancel, onReactivate, onDelete }: BookingTaskCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resolvedTimezone = slot?.timezone || "UTC";

  const formatDateInSlotTimezone = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: resolvedTimezone,
      }).format(new Date(dateString));
    } catch {
      return new Date(dateString).toDateString();
    }
  };

  const formatDateTimeInSlotTimezone = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: resolvedTimezone,
      }).format(new Date(dateString));
    } catch {
      return new Date(dateString).toLocaleString();
    }
  };

  const formattedScheduledDate = useMemo(() => formatDateInSlotTimezone(task.scheduledDate), [task.scheduledDate, resolvedTimezone]);
  const formattedAttemptAt = useMemo(() => (task.attemptAt ? formatDateTimeInSlotTimezone(task.attemptAt) : null), [task.attemptAt, resolvedTimezone]);
  const formattedAttemptedAt = useMemo(() => (task.attemptedAt ? formatDateTimeInSlotTimezone(task.attemptedAt) : null), [task.attemptedAt, resolvedTimezone]);

  const getStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'cancelled':
        return <Ban className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (task.status) {
      case 'pending':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'success':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'secondary';
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'pending':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-indigo-500';
      case 'success':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'cancelled':
        return 'bg-gray-400';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon()}
                <CardTitle className="text-lg">
                  {slot?.name || 'Unknown Slot'}
                </CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusBadgeVariant()} className="capitalize">
                  {task.status}
                </Badge>
                {provider && (
                  <Badge variant="outline" className="text-xs">
                    {provider.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-500" />
            <div className="flex flex-col">
              <span>{formattedScheduledDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>Timezone: {resolvedTimezone}</span>
          </div>
          {task.attemptAt && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>
                Attempt window: {formattedAttemptAt}
              </span>
            </div>
          )}
          {slot?.facility && (
            <div className="text-sm">
              <p className="text-gray-600">Facility</p>
              <p>{slot.facility}</p>
            </div>
          )}
          {task.errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {task.errorMessage}
              </AlertDescription>
            </Alert>
          )}
          {task.attemptedAt && (
            <div className="text-xs text-gray-500 pt-2 border-t">
              Attempted: {formattedAttemptedAt}
            </div>
          )}
          {task.status === 'pending' && (
            <div className="pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowCancelDialog(true)}
                disabled={isCancelling}
              >
                <Ban className="w-4 h-4 mr-2" />
                {isCancelling ? 'Cancelling...' : 'Cancel This Booking Task'}
              </Button>
            </div>
          )}
          {task.status === 'cancelled' && (
            <div className="pt-3 border-t">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowReactivateDialog(true)}
                  disabled={isReactivating}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {isReactivating ? 'Reactivating...' : 'Reactivate'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the booking scheduled for {formattedScheduledDate}. The booking slot will remain active for future
              bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Task</AlertDialogCancel>
            <AlertDialogAction
                onClick={async () => {
                  setIsCancelling(true);
                  try {
                    await onCancel(task.id);
                    setShowCancelDialog(false);
                  } catch (err) {
                    console.error("Failed to cancel task", err);
                  } finally {
                    setIsCancelling(false);
                  }
                }}
                disabled={isCancelling}
            >
                {isCancelling ? 'Cancelling...' : 'Cancel Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate this booking task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate the booking task scheduled for {formattedScheduledDate}, and it will be attempted again at the scheduled time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsReactivating(true);
                try {
                  await onReactivate(task.id);
                  setShowReactivateDialog(false);
                } catch (err) {
                  console.error("Failed to reactivate task", err);
                } finally {
                  setIsReactivating(false);
                }
              }}
              disabled={isReactivating}
            >
              {isReactivating ? 'Reactivating...' : 'Reactivate Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the cancelled booking task scheduled for {formattedScheduledDate}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(task.id);
                  setShowDeleteDialog(false);
                } catch (err) {
                  console.error("Failed to delete task", err);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
