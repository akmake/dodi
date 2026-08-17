/**
 * Appointments module — [קטגוריה 13] builtin / [קטגוריה 8] Book appointment node.
 *
 * Internal availability model (no external calendar): a tenant defines bookable
 * resources with weekly working hours and a slot length; the engine computes
 * free slots on the fly and books them. Collections: `appointment_resources`,
 * `appointments`. A partial-unique index guards against double-booking.
 */
import type { BaseEntity } from "@/core/types";

/** One working window on a given weekday (0=Sunday … 6=Saturday), minutes from midnight. */
export interface WorkingWindow {
  weekday: number;
  /** e.g. 09:00 → 540. */
  startMinutes: number;
  /** e.g. 17:00 → 1020. */
  endMinutes: number;
}

export type AppointmentStatus = "booked" | "cancelled" | "completed";

/** A bookable resource — a staff member, room, or service. */
export interface AppointmentResource extends BaseEntity {
  name: string;
  /** Duration of each bookable slot, in minutes. */
  slotMinutes: number;
  workingHours: WorkingWindow[];
  active: boolean;
}

export interface Appointment extends BaseEntity {
  resourceId: string;
  contactId: string | null;
  conversationId: string | null;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  notes: string | null;
}
