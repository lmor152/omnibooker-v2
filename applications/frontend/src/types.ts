export type ProviderType = "Clubspark" | "Better" | "Gymbox" | "Other" | (string & {});

export interface PaymentCardDetails {
  cardNumber: string;
  expiryDate: string; // MM/YY format
  cvc: string;
}

export interface ProviderCredentials {
  username: string;
  password: string;
  additionalInfo?: string;
  cardDetails?: PaymentCardDetails;
  cardCvc?: string;
}

export interface User {
  id: number;
  email: string;
  fullName?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Provider {
  id: number;
  name: string;
  type: ProviderType;
  credentials: ProviderCredentials;
  createdAt: string;
}

export interface ProviderInput {
  name: string;
  type: ProviderType;
  credentials: ProviderCredentials;
}

export type BookingFrequency = "weekly" | "fortnightly" | "monthly" | "one_off";

export interface ClubsparkOptions {
  courtSlug?: string;
  doubleSession?: boolean;
  targetTimes?: string[];
  targetCourts?: (number | string)[];
}

export interface BetterOptions {
  venueSlug?: string;
  activitySlug?: string;
  useCredits?: boolean;
  targetTimes?: string[];
  targetCourts?: (string | number)[];
}

export type ProviderOptions = ClubsparkOptions &
  BetterOptions &
  Record<string, string | number | boolean | null | string[] | number[]>;

export interface BookingSlot {
  id: number;
  providerId: number;
  name: string;
  frequency: BookingFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  oneOffDate?: string | null;
  time: string;
  timezone: string;
  isActive: boolean;
  durationMinutes?: number | null;
  facility?: string | null;
  attemptStrategy: "offset" | "release";
  attemptOffsetDays: number;
  attemptOffsetHours: number;
  attemptOffsetMinutes: number;
  releaseDaysBefore: number;
  releaseTime?: string | null;
  providerOptions: ProviderOptions;
  notificationsEnabled?: boolean | null;
  notifyDestinationId?: number | null;
  autoCancelEnabled?: boolean | null;
  confirmDeadlineHours?: number | null;
  reminderHours?: number[] | null;
  confirmationPolicy?: ConfirmationPolicy;
  createdAt: string;
}

export interface BookingSlotInput {
  providerId: number;
  name: string;
  frequency: BookingFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  oneOffDate?: string | null;
  time: string;
  timezone: string;
  isActive: boolean;
  attemptStrategy: "offset" | "release";
  attemptOffsetDays: number;
  attemptOffsetHours: number;
  attemptOffsetMinutes: number;
  releaseDaysBefore: number;
  releaseTime?: string | null;
  providerOptions: ProviderOptions;
  notificationsEnabled?: boolean | null;
  notifyDestinationId?: number | null;
  autoCancelEnabled?: boolean | null;
  confirmDeadlineHours?: number | null;
  reminderHours?: number[] | null;
  confirmationPolicy?: ConfirmationPolicy;
}

export type ConfirmationPolicy = "owner_only" | "anyone";

export type ConfirmationStatus =
  | "not_required"
  | "awaiting"
  | "confirmed"
  | "auto_kept"
  | "cancel_pending"
  | "cancelled"
  | "cancel_failed"
  | "manual_cancel_required";

export type BookingTaskStatus = "pending" | "processing" | "success" | "failed" | "cancelled";

export interface BookingTask {
  id: number;
  bookingSlotId: number;
  scheduledDate: string;
  attemptAt?: string | null;
  status: BookingTaskStatus;
  errorMessage?: string | null;
  attemptedAt?: string | null;
  bookedTime?: string | null;
  bookedResource?: string | null;
  confirmationCode?: string | null;
  cost?: number | null;
  currency?: string | null;
  confirmationStatus: ConfirmationStatus;
  confirmDeadlineAt?: string | null;
  refundDeadlineAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  cancelledAt?: string | null;
  cancelMessage?: string | null;
  createdAt: string;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  autoCancelDefault: boolean;
  /** Hours before the session start; null derives the deadline from the provider's refund deadline. */
  confirmDeadlineHours: number | null;
  refundBufferHours: number;
  /** Hours before the confirm deadline. */
  reminderHours: number[];
  shortNoticeMinHours: number;
  defaultDestinationId: number | null;
}

export interface ChatIdentity {
  id: number;
  platform: string;
  externalUsername?: string | null;
  linkedAt: string;
}

export interface ChatDestination {
  id: number;
  platform: string;
  name: string;
  createdAt: string;
}

export interface ChatLinkCode {
  code: string;
  expiresAt: string;
  botInviteUrl?: string | null;
}
