import { useState } from "react";
import type { BookingSlot, BookingSlotInput, Provider } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Plus } from "lucide-react";
import { BookingSlotCard } from "./BookingSlotCard";
import { AddBookingSlotDialog } from "./AddBookingSlotDialog";

interface BookingSlotsTabProps {
  bookingSlots: BookingSlot[];
  providers: Provider[];
  onAddSlot: (slot: BookingSlotInput) => Promise<void>;
  onUpdateSlot: (id: number, updates: Partial<BookingSlotInput>) => Promise<void>;
  onDeleteSlot: (id: number) => Promise<void>;
}

export function BookingSlotsTab({
  bookingSlots,
  providers,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
}: BookingSlotsTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingSlot, setEditingSlot] = useState<BookingSlot | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl">Booking Slots</h2>
          <p className="text-gray-600">Manage your automated recurring bookings</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} disabled={providers.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Add Booking Slot
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a provider first</CardTitle>
            <CardDescription>
              You need to add at least one provider profile before creating booking slots
            </CardDescription>
          </CardHeader>
        </Card>
      ) : bookingSlots.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No booking slots yet</CardTitle>
            <CardDescription>
              Create your first automated booking slot to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Booking Slot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bookingSlots.map((slot) => {
            const provider = providers.find((p) => p.id === slot.providerId);
            return (
              <BookingSlotCard
                key={slot.id}
                slot={slot}
                provider={provider}
                onUpdate={onUpdateSlot}
                onDelete={onDeleteSlot}
                onEdit={setEditingSlot}
              />
            );
          })}
        </div>
      )}

      <AddBookingSlotDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        providers={providers}
        onSave={async (payload) => onAddSlot(payload)}
      />

      {editingSlot && (
        <AddBookingSlotDialog
          open={Boolean(editingSlot)}
          onOpenChange={(open) => {
            if (!open) setEditingSlot(null);
          }}
          providers={providers}
          mode="edit"
          slot={editingSlot}
          onSave={async (payload) => onUpdateSlot(editingSlot.id, payload)}
        />
      )}
    </div>
  );
}
