import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  Provider,
  ProviderInput,
  User,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

type UserDto = {
  id: number;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  created_at: string;
};

type ProviderDto = {
  id: number;
  name: string;
  type: string;
  credentials: Provider["credentials"];
  created_at: string;
};

type BookingSlotDto = {
  id: number;
  provider_id: number;
  name: string;
  frequency: BookingSlot["frequency"];
  day_of_week?: number | null;
  day_of_month?: number | null;
  time: string;
  timezone: string;
  duration_minutes?: number | null;
  facility?: string | null;
  is_active: boolean;
  attempt_strategy: BookingSlot["attemptStrategy"];
  attempt_offset_days: number;
  attempt_offset_hours: number;
  attempt_offset_minutes: number;
  release_days_before: number;
  release_time?: string | null;
  provider_options: BookingSlot["providerOptions"];
  created_at: string;
};

type BookingTaskDto = {
  id: number;
  booking_slot_id: number;
  scheduled_date: string;
  attempt_at?: string | null;
  status: BookingTask["status"];
  error_message?: string | null;
  attempted_at?: string | null;
  created_at: string;
};

function buildHeaders(token?: string, extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      if (typeof payload === "string") {
        message = payload;
      } else if (payload?.detail) {
        message = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function mapUser(dto: UserDto): User {
  return {
    id: dto.id,
    email: dto.email,
    fullName: dto.full_name,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  };
}

function mapProvider(dto: ProviderDto): Provider {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    credentials: dto.credentials,
    createdAt: dto.created_at,
  };
}

function mapBookingSlot(dto: BookingSlotDto): BookingSlot {
  return {
    id: dto.id,
    providerId: dto.provider_id,
    name: dto.name,
    frequency: dto.frequency,
    dayOfWeek: dto.day_of_week ?? undefined,
    dayOfMonth: dto.day_of_month ?? undefined,
    time: dto.time,
    timezone: dto.timezone,
    durationMinutes: dto.duration_minutes ?? undefined,
    facility: dto.facility ?? undefined,
    isActive: dto.is_active,
    attemptStrategy: dto.attempt_strategy,
    attemptOffsetDays: dto.attempt_offset_days,
    attemptOffsetHours: dto.attempt_offset_hours,
    attemptOffsetMinutes: dto.attempt_offset_minutes,
    releaseDaysBefore: dto.release_days_before,
    releaseTime: dto.release_time ?? undefined,
    providerOptions: dto.provider_options ?? {},
    createdAt: dto.created_at,
  };
}

function mapBookingTask(dto: BookingTaskDto): BookingTask {
  return {
    id: dto.id,
    bookingSlotId: dto.booking_slot_id,
    scheduledDate: dto.scheduled_date,
    attemptAt: dto.attempt_at ?? undefined,
    status: dto.status,
    errorMessage: dto.error_message ?? undefined,
    attemptedAt: dto.attempted_at ?? undefined,
    createdAt: dto.created_at,
  };
}

function serializeSlotPayload(input: Partial<BookingSlotInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.providerId !== undefined) payload.provider_id = input.providerId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.frequency !== undefined) payload.frequency = input.frequency;
  if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
  if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
  if (input.time !== undefined) payload.time = input.time;
  if (input.timezone !== undefined) payload.timezone = input.timezone;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.attemptStrategy !== undefined) payload.attempt_strategy = input.attemptStrategy;
  if (input.attemptOffsetDays !== undefined) payload.attempt_offset_days = input.attemptOffsetDays;
  if (input.attemptOffsetHours !== undefined) payload.attempt_offset_hours = input.attemptOffsetHours;
  if (input.attemptOffsetMinutes !== undefined) payload.attempt_offset_minutes = input.attemptOffsetMinutes;
  if (input.releaseDaysBefore !== undefined) payload.release_days_before = input.releaseDaysBefore;
  if (input.releaseTime !== undefined) payload.release_time = input.releaseTime;
  if (input.providerOptions !== undefined) payload.provider_options = input.providerOptions;
  return payload;
}

export async function fetchCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: buildHeaders(token),
  });
  const data = await handleResponse<UserDto>(response);
  return mapUser(data);
}

export async function fetchProviders(token: string): Promise<Provider[]> {
  const response = await fetch(`${API_BASE_URL}/providers/`, {
    headers: buildHeaders(token),
  });
  const data = await handleResponse<ProviderDto[]>(response);
  return data.map(mapProvider);
}

export async function createProvider(token: string, payload: ProviderInput): Promise<Provider> {
  const response = await fetch(`${API_BASE_URL}/providers/`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<ProviderDto>(response);
  return mapProvider(data);
}

export async function deleteProvider(token: string, providerId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/providers/${providerId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}

export async function updateProvider(
  token: string,
  providerId: number,
  payload: Partial<ProviderInput>,
): Promise<Provider> {
  const response = await fetch(`${API_BASE_URL}/providers/${providerId}`, {
    method: "PUT",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<ProviderDto>(response);
  return mapProvider(data);
}

export async function fetchBookingSlots(token: string): Promise<BookingSlot[]> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/`, {
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingSlotDto[]>(response);
  return data.map(mapBookingSlot);
}

export async function createBookingSlot(token: string, slot: BookingSlotInput): Promise<BookingSlot> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(serializeSlotPayload(slot)),
  });
  const data = await handleResponse<BookingSlotDto>(response);
  return mapBookingSlot(data);
}

export async function updateBookingSlot(
  token: string,
  slotId: number,
  updates: Partial<BookingSlotInput>,
): Promise<BookingSlot> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/${slotId}`, {
    method: "PUT",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(serializeSlotPayload(updates)),
  });
  const data = await handleResponse<BookingSlotDto>(response);
  return mapBookingSlot(data);
}

export async function deleteBookingSlot(token: string, slotId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/${slotId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}

export async function fetchBookingTasks(token: string): Promise<BookingTask[]> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/`, {
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingTaskDto[]>(response);
  return data.map(mapBookingTask);
}

export async function cancelBookingTask(token: string, taskId: number): Promise<BookingTask> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}/cancel`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingTaskDto>(response);
  return mapBookingTask(data);
}

export async function reactivateBookingTask(token: string, taskId: number): Promise<BookingTask> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}/reactivate`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingTaskDto>(response);
  return mapBookingTask(data);
}

export async function deleteBookingTask(token: string, taskId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}

export async function executeBookingTask(token: string, taskId: number): Promise<BookingTask> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}/execute`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingTaskDto>(response);
  return mapBookingTask(data);
}

export async function resyncBookingSlot(
  token: string,
  slotId: number,
  count = 4,
): Promise<BookingSlot> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/${slotId}/resync?count=${count}`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  const data = await handleResponse<BookingSlotDto>(response);
  return mapBookingSlot(data);
}
