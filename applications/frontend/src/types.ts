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

export type BookingFrequency = "weekly" | "fortnightly" | "monthly";

export interface ClubsparkOptions {
  courtSlug?: string;
  doubleSession?: boolean;
  targetTimes?: string[];
  targetCourts?: number[];
}

export type ProviderOptions = ClubsparkOptions & Record<string, string | number | boolean | null | string[] | number[]>;

export interface BookingSlot {
  id: number;
  providerId: number;
  name: string;
  frequency: BookingFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
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
  createdAt: string;
}

export interface BookingSlotInput {
  providerId: number;
  name: string;
  frequency: BookingFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
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
}

export type BookingTaskStatus = "pending" | "processing" | "success" | "failed" | "cancelled";

export interface BookingTask {
  id: number;
  bookingSlotId: number;
  scheduledDate: string;
  attemptAt?: string | null;
  status: BookingTaskStatus;
  errorMessage?: string | null;
  attemptedAt?: string | null;
  createdAt: string;
}
