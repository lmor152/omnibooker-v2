import type { BookingSlot, BookingSlotInput, Provider } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Trash2, Clock, Calendar, Pencil, Settings2 } from "lucide-react";
import { useState } from "react";
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

interface BookingSlotCardProps {
  slot: BookingSlot;
  provider?: Provider;
  onUpdate: (id: number, updates: Partial<BookingSlotInput>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit?: (slot: BookingSlot) => void;
}

export function BookingSlotCard({ slot, provider, onUpdate, onDelete, onEdit }: BookingSlotCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getFrequencyText = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const dayName = typeof slot.dayOfWeek === "number" ? days[slot.dayOfWeek] : undefined;

    if (slot.frequency === 'weekly' && dayName) {
      return `Every ${dayName}`;
    } else if (slot.frequency === 'fortnightly' && dayName) {
      return `Every other ${dayName}`;
    } else if (slot.frequency === 'monthly' && slot.dayOfMonth !== undefined) {
      return `Monthly on day ${slot.dayOfMonth}`;
    }
    return slot.frequency;
  };

  const getStatusColor = () => {
    return slot.isActive ? 'bg-green-500' : 'bg-gray-400';
  };

  const getReleaseText = () => {
    if (slot.attemptStrategy === "offset") {
      const parts = [] as string[];
      if (slot.attemptOffsetDays) parts.push(`${slot.attemptOffsetDays}d`);
      if (slot.attemptOffsetHours) parts.push(`${slot.attemptOffsetHours}h`);
      if (slot.attemptOffsetMinutes) parts.push(`${slot.attemptOffsetMinutes}m`);
      return parts.length ? `${parts.join(" ")} before` : "On release/open";
    }
    if (slot.attemptStrategy === "release") {
      return `${slot.releaseDaysBefore ?? 0}d before at ${slot.releaseTime ?? "00:00"}`;
    }
    return "Not set";
  };

  const renderProviderDetails = () => {
    if (!provider) return null;
    if (provider.type === "Clubspark") {
      const opts = slot.providerOptions || {};
      const times = Array.isArray(opts.targetTimes) ? opts.targetTimes : [];
      const courts = Array.isArray(opts.targetCourts) ? opts.targetCourts : [];
      return (
        <div className="space-y-1 text-sm text-gray-700">
          {opts.courtSlug && (
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-gray-400" />
              <span className="truncate">Court: {opts.courtSlug}</span>
            </div>
          )}
          {opts.doubleSession && (
            <Badge variant="secondary" className="text-xs">Double session</Badge>
          )}
          {times.length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Target times: </span>
              <span>
                {times.slice(0, 3).join(', ')}
                {times.length > 3 && ` +${times.length - 3} more`}
              </span>
            </div>
          )}
          {courts.length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Target courts: </span>
              <span>
                {courts.slice(0, 3).join(', ')}
                {courts.length > 3 && ` +${courts.length - 3} more`}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                <CardTitle className="text-lg">{slot.name}</CardTitle>
              </div>
              {provider && (
                <Badge variant="outline" className="text-xs">
                  {provider.name}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit?.(slot)}
            >
              <Pencil className="w-4 h-4 text-gray-700" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span>{getFrequencyText()}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <span>{slot.time} ({slot.timezone})</span>
          </div>
          <div className="text-sm">
            <p className="text-gray-600">Release timing</p>
            <p>{getReleaseText()}</p>
          </div>
          {renderProviderDetails()}
          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-sm">Active</span>
            <Switch
              checked={slot.isActive}
              disabled={isUpdating}
              onCheckedChange={async (checked: boolean) => {
                setIsUpdating(true);
                try {
                  await onUpdate(slot.id, { isActive: checked });
                } catch (err) {
                  console.error("Failed to update slot", err);
                } finally {
                  setIsUpdating(false);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all upcoming bookings for "{slot.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(slot.id);
                  setShowDeleteDialog(false);
                } catch (err) {
                  console.error("Failed to delete slot", err);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
