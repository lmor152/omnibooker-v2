import type {
  BookingSlot,
  BookingSlotInput,
  BookingTask,
  ChatDestination,
  ChatIdentity,
  ChatLinkCode,
  Provider,
  ProviderInput,
  User,
  UserPreferences,
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
  one_off_date?: string | null;
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
  notifications_enabled?: boolean | null;
  notify_destination_id?: number | null;
  auto_cancel_enabled?: boolean | null;
  confirm_deadline_hours?: number | null;
  reminder_hours?: number[] | null;
  confirmation_policy?: BookingSlot["confirmationPolicy"];
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
  booked_time?: string | null;
  booked_resource?: string | null;
  confirmation_code?: string | null;
  cost?: number | null;
  currency?: string | null;
  confirmation_status: BookingTask["confirmationStatus"];
  confirm_deadline_at?: string | null;
  refund_deadline_at?: string | null;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  cancelled_at?: string | null;
  cancel_message?: string | null;
  created_at: string;
};

type UserPreferencesDto = {
  notifications_enabled: boolean;
  auto_cancel_default: boolean;
  confirm_deadline_hours: number | null;
  refund_buffer_hours: number;
  reminder_hours: number[];
  short_notice_min_hours: number;
  default_destination_id: number | null;
};

type ChatIdentityDto = {
  id: number;
  platform: string;
  external_username?: string | null;
  linked_at: string;
};

type ChatDestinationDto = {
  id: number;
  platform: string;
  name: string;
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
    oneOffDate: dto.one_off_date ?? undefined,
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
    notificationsEnabled: dto.notifications_enabled ?? null,
    notifyDestinationId: dto.notify_destination_id ?? null,
    autoCancelEnabled: dto.auto_cancel_enabled ?? null,
    confirmDeadlineHours: dto.confirm_deadline_hours ?? null,
    reminderHours: dto.reminder_hours ?? null,
    confirmationPolicy: dto.confirmation_policy ?? "owner_only",
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
    bookedTime: dto.booked_time ?? undefined,
    bookedResource: dto.booked_resource ?? undefined,
    confirmationCode: dto.confirmation_code ?? undefined,
    cost: dto.cost ?? undefined,
    currency: dto.currency ?? undefined,
    confirmationStatus: dto.confirmation_status ?? "not_required",
    confirmDeadlineAt: dto.confirm_deadline_at ?? undefined,
    refundDeadlineAt: dto.refund_deadline_at ?? undefined,
    confirmedAt: dto.confirmed_at ?? undefined,
    confirmedBy: dto.confirmed_by ?? undefined,
    cancelledAt: dto.cancelled_at ?? undefined,
    cancelMessage: dto.cancel_message ?? undefined,
    createdAt: dto.created_at,
  };
}

function mapPreferences(dto: UserPreferencesDto): UserPreferences {
  return {
    notificationsEnabled: dto.notifications_enabled,
    autoCancelDefault: dto.auto_cancel_default,
    confirmDeadlineHours: dto.confirm_deadline_hours,
    refundBufferHours: dto.refund_buffer_hours,
    reminderHours: dto.reminder_hours,
    shortNoticeMinHours: dto.short_notice_min_hours,
    defaultDestinationId: dto.default_destination_id,
  };
}

function serializeSlotPayload(input: Partial<BookingSlotInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.providerId !== undefined) payload.provider_id = input.providerId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.frequency !== undefined) payload.frequency = input.frequency;
  if (input.dayOfWeek !== undefined) payload.day_of_week = input.dayOfWeek;
  if (input.dayOfMonth !== undefined) payload.day_of_month = input.dayOfMonth;
  if (input.oneOffDate !== undefined) payload.one_off_date = input.oneOffDate;
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
  if (input.notificationsEnabled !== undefined) payload.notifications_enabled = input.notificationsEnabled;
  if (input.notifyDestinationId !== undefined) payload.notify_destination_id = input.notifyDestinationId;
  if (input.autoCancelEnabled !== undefined) payload.auto_cancel_enabled = input.autoCancelEnabled;
  if (input.confirmDeadlineHours !== undefined) payload.confirm_deadline_hours = input.confirmDeadlineHours;
  if (input.reminderHours !== undefined) payload.reminder_hours = input.reminderHours;
  if (input.confirmationPolicy !== undefined) payload.confirmation_policy = input.confirmationPolicy;
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

export async function testProviderCredentials(
  token: string,
  payload: { type: string; credentials: { username: string; password: string } },
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/providers/test`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ success: boolean; message: string }>(response);
}

export async function testBookingSlot(
  token: string,
  payload: { providerId: number; providerOptions: Record<string, unknown> },
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/booking-slots/test`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ provider_id: payload.providerId, provider_options: payload.providerOptions }),
  });
  return handleResponse<{ success: boolean; message: string }>(response);
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

export async function confirmBooking(token: string, taskId: number): Promise<BookingTask> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}/confirm`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  return mapBookingTask(await handleResponse<BookingTaskDto>(response));
}

/** Cancel a made booking with the provider (unlike cancelBookingTask, which skips a pending task). */
export async function cancelBookingWithProvider(token: string, taskId: number): Promise<BookingTask> {
  const response = await fetch(`${API_BASE_URL}/booking-tasks/${taskId}/cancel-booking`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  return mapBookingTask(await handleResponse<BookingTaskDto>(response));
}

export async function fetchPreferences(token: string): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE_URL}/me/preferences`, { headers: buildHeaders(token) });
  return mapPreferences(await handleResponse<UserPreferencesDto>(response));
}

export async function updatePreferences(
  token: string,
  updates: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const payload: Record<string, unknown> = {};
  if (updates.notificationsEnabled !== undefined) payload.notifications_enabled = updates.notificationsEnabled;
  if (updates.autoCancelDefault !== undefined) payload.auto_cancel_default = updates.autoCancelDefault;
  if (updates.confirmDeadlineHours !== undefined) payload.confirm_deadline_hours = updates.confirmDeadlineHours;
  if (updates.refundBufferHours !== undefined) payload.refund_buffer_hours = updates.refundBufferHours;
  if (updates.reminderHours !== undefined) payload.reminder_hours = updates.reminderHours;
  if (updates.shortNoticeMinHours !== undefined) payload.short_notice_min_hours = updates.shortNoticeMinHours;
  if (updates.defaultDestinationId !== undefined) payload.default_destination_id = updates.defaultDestinationId;
  const response = await fetch(`${API_BASE_URL}/me/preferences`, {
    method: "PUT",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return mapPreferences(await handleResponse<UserPreferencesDto>(response));
}

export async function createDiscordLinkCode(token: string): Promise<ChatLinkCode> {
  const response = await fetch(`${API_BASE_URL}/chat/discord/link-code`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  const data = await handleResponse<{ code: string; expires_at: string; bot_invite_url?: string | null }>(
    response,
  );
  return { code: data.code, expiresAt: data.expires_at, botInviteUrl: data.bot_invite_url };
}

export async function fetchChatIdentities(token: string): Promise<ChatIdentity[]> {
  const response = await fetch(`${API_BASE_URL}/chat/identities`, { headers: buildHeaders(token) });
  const data = await handleResponse<ChatIdentityDto[]>(response);
  return data.map((dto) => ({
    id: dto.id,
    platform: dto.platform,
    externalUsername: dto.external_username,
    linkedAt: dto.linked_at,
  }));
}

export async function deleteChatIdentity(token: string, identityId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/identities/${identityId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}

export async function fetchChatDestinations(token: string): Promise<ChatDestination[]> {
  const response = await fetch(`${API_BASE_URL}/chat/destinations`, { headers: buildHeaders(token) });
  const data = await handleResponse<ChatDestinationDto[]>(response);
  return data.map((dto) => ({
    id: dto.id,
    platform: dto.platform,
    name: dto.name,
    createdAt: dto.created_at,
  }));
}

export async function deleteChatDestination(token: string, destinationId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/destinations/${destinationId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}

export async function testChatDestination(token: string, destinationId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/destinations/${destinationId}/test`, {
    method: "POST",
    headers: buildHeaders(token),
  });
  await handleResponse<undefined>(response);
}
