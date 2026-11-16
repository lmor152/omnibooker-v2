import type { BookingSlot, BookingTask, Provider } from "../types";
import { addDays, startOfDay } from "../lib/datetime";

/** Demo data for logged-out visitors, with dates relative to today so every view has something in it. */

export const DEMO_PROVIDERS: Provider[] = [
  {
    id: 1001,
    name: "Clubspark Tennis",
    type: "Clubspark",
    credentials: {
      username: "clubspark@example.com",
      additionalInfo: "",
      hasPassword: true,
      card: { last4: "6767", expiryDate: "08/27" },
      hasCardCvc: false,
    },
    createdAt: "2024-05-20T09:00:00.000Z",
  },
  {
    id: 1002,
    name: "Better Islington",
    type: "Better",
    credentials: { username: "better@example.com", additionalInfo: "Uses credits first", hasPassword: true, hasCardCvc: true },
    createdAt: "2024-05-22T12:00:00.000Z",
  },
];

const slotDefaults = {
  timezone: "Europe/London",
  isActive: true,
  durationMinutes: 60,
  attemptOffsetDays: 0,
  attemptOffsetHours: 0,
  attemptOffsetMinutes: 0,
  createdAt: "2024-06-01T08:00:00.000Z",
};

export const DEMO_BOOKING_SLOTS: BookingSlot[] = [
  {
    ...slotDefaults,
    id: 2001,
    providerId: 1001,
    name: "Monday evening tennis",
    frequency: "weekly",
    dayOfWeek: 1,
    time: "20:00",
    facility: "Finsbury Park",
    attemptStrategy: "release",
    releaseDaysBefore: 7,
    releaseTime: "07:00",
    providerOptions: { courtSlug: "finsburypark", targetTimes: ["20:00"] },
  },
  {
    ...slotDefaults,
    id: 2002,
    providerId: 1002,
    name: "Saturday doubles",
    frequency: "weekly",
    dayOfWeek: 6,
    time: "09:00",
    attemptStrategy: "release",
    releaseDaysBefore: 5,
    releaseTime: "22:00",
    providerOptions: { venueSlug: "islington-tennis-centre", activitySlug: "tennis-court-outdoor", useCredits: true },
  },
];

function at(dayOffset: number, hours: number, minutes = 0): string {
  const date = addDays(startOfDay(new Date()), dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

/** Next occurrence (from tomorrow) of a weekday, 0 = Sunday, plus `weeks`. */
function weekday(day: number, weeks = 0): number {
  const today = new Date().getDay();
  const ahead = ((day - today + 7) % 7) || 7;
  return ahead + weeks * 7;
}

const base = { createdAt: at(-20, 9), confirmationStatus: "not_required" as const };

export function buildDemoTasks(): BookingTask[] {
  const mon = weekday(1);
  const sat = weekday(6);
  return [
    // Past
    { ...base, id: 3001, bookingSlotId: 2001, scheduledDate: at(mon - 14, 20), attemptAt: at(mon - 21, 7), attemptedAt: at(mon - 21, 7), status: "success", confirmationStatus: "confirmed", confirmedBy: "web", bookedTime: "20:00", bookedResource: "Court 3", cost: 9.6, currency: "GBP", confirmationCode: "CS-88213" },
    { ...base, id: 3002, bookingSlotId: 2002, scheduledDate: at(sat - 7, 9), attemptAt: at(sat - 12, 22), attemptedAt: at(sat - 12, 22), status: "failed", errorMessage: "No courts were free at the requested times." },
    // Coming up
    { ...base, id: 3003, bookingSlotId: 2001, scheduledDate: at(mon, 20), attemptAt: at(mon - 7, 7), attemptedAt: at(mon - 7, 7), status: "success", confirmationStatus: "awaiting", confirmDeadlineAt: at(Math.max(mon - 1, 0), 18), refundDeadlineAt: at(Math.max(mon - 1, 0), 20), bookedTime: "20:00", bookedResource: "Court 2", cost: 9.6, currency: "GBP", confirmationCode: "CS-90412" },
    { ...base, id: 3004, bookingSlotId: 2002, scheduledDate: at(sat, 9), attemptAt: at(sat - 5, 22), status: sat > 5 ? "pending" : "failed", errorMessage: sat > 5 ? null : "Login failed: check your Better password." },
    { ...base, id: 3005, bookingSlotId: 2001, scheduledDate: at(mon + 7, 20), attemptAt: at(mon, 7), status: "pending" },
    { ...base, id: 3006, bookingSlotId: 2002, scheduledDate: at(sat + 7, 9), attemptAt: at(sat + 2, 22), status: "cancelled", errorMessage: null },
    { ...base, id: 3007, bookingSlotId: 2001, scheduledDate: at(mon + 14, 20), attemptAt: at(mon + 7, 7), status: "pending" },
    { ...base, id: 3008, bookingSlotId: 2002, scheduledDate: at(sat + 14, 9), attemptAt: at(sat + 9, 22), status: "pending" },
  ];
}
