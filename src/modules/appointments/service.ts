/**
 * Appointments service — slot computation + booking ([קטגוריה 13]).
 *
 * Slots are derived, not stored: for each day we walk the resource's working
 * windows in `slotMinutes` steps and drop any slot that's in the past or already
 * booked. Booking relies on the partial-unique index to make the double-booking
 * guard atomic (a racing second booking hits E11000 → reported as slot_taken).
 */
import type { CreateInput } from "@/core/types";
import type { Appointment, AppointmentResource, WorkingWindow } from "./models";
import {
  AppointmentRepository,
  AppointmentResourceRepository,
  ensureAppointmentIndexes,
} from "./repository";

const resources = new AppointmentResourceRepository();
const appts = new AppointmentRepository();

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export interface Slot {
  startAt: Date;
  endAt: Date;
}

export async function listResources(tenantId: string): Promise<AppointmentResource[]> {
  await ensureAppointmentIndexes();
  return resources.findMany(tenantId);
}

export async function createResource(
  tenantId: string,
  input: Partial<CreateInput<AppointmentResource>> & { name: string }
): Promise<AppointmentResource> {
  await ensureAppointmentIndexes();
  return resources.create(tenantId, {
    name: input.name,
    slotMinutes: input.slotMinutes ?? 30,
    workingHours: input.workingHours ?? defaultWorkingHours(),
    active: input.active ?? true,
  });
}

export function getResource(tenantId: string, id: string): Promise<AppointmentResource | null> {
  return resources.findById(tenantId, id);
}

export function updateResource(
  tenantId: string,
  id: string,
  patch: Partial<Pick<AppointmentResource, "name" | "slotMinutes" | "workingHours" | "active">>
): Promise<AppointmentResource | null> {
  return resources.update(tenantId, id, patch);
}

/** Remove a resource. Future booked appointments are cancelled so no orphans remain. */
export async function deleteResource(tenantId: string, id: string): Promise<boolean> {
  const future = await appts.listBooked(tenantId, id, new Date(), new Date(Date.now() + 365 * DAY));
  for (const a of future) await appts.update(tenantId, a.id, { status: "cancelled" } as Partial<Appointment>);
  return resources.delete(tenantId, id);
}

export function listAppointments(tenantId: string, filter: Partial<Appointment> = {}) {
  return appts.findMany(tenantId, filter as never);
}

/** Free slots for a resource across the next `days` days, capped at `limit`. */
export async function availableSlots(
  tenantId: string,
  resourceId: string,
  opts: { days?: number; limit?: number; from?: Date } = {}
): Promise<Slot[]> {
  await ensureAppointmentIndexes();
  const res = await resources.findById(tenantId, resourceId);
  if (!res || !res.active || res.slotMinutes <= 0) return [];

  const days = opts.days ?? 7;
  const limit = opts.limit ?? 10;
  const from = opts.from ?? new Date();
  const to = new Date(from.getTime() + days * DAY);

  const booked = await appts.listBooked(tenantId, resourceId, from, to);
  const takenStarts = new Set(booked.map((b) => b.startAt.getTime()));

  const slots: Slot[] = [];
  for (let d = 0; d < days && slots.length < limit; d++) {
    const day = new Date(from);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + d);
    const windows = res.workingHours.filter((w) => w.weekday === day.getDay());
    for (const w of windows) {
      for (
        let m = w.startMinutes;
        m + res.slotMinutes <= w.endMinutes && slots.length < limit;
        m += res.slotMinutes
      ) {
        const startAt = new Date(day.getTime() + m * MINUTE);
        if (startAt.getTime() <= from.getTime()) continue; // past
        if (takenStarts.has(startAt.getTime())) continue; // booked
        slots.push({ startAt, endAt: new Date(startAt.getTime() + res.slotMinutes * MINUTE) });
      }
    }
  }
  return slots;
}

export interface BookResult {
  ok: boolean;
  appointment?: Appointment;
  reason?: "resource_not_found" | "slot_taken";
}

export async function book(
  tenantId: string,
  input: {
    resourceId: string;
    startAt: Date;
    contactId?: string | null;
    conversationId?: string | null;
    notes?: string | null;
  }
): Promise<BookResult> {
  await ensureAppointmentIndexes();
  const res = await resources.findById(tenantId, input.resourceId);
  if (!res) return { ok: false, reason: "resource_not_found" };

  const endAt = new Date(input.startAt.getTime() + res.slotMinutes * MINUTE);
  try {
    const appointment = await appts.create(tenantId, {
      resourceId: input.resourceId,
      contactId: input.contactId ?? null,
      conversationId: input.conversationId ?? null,
      startAt: input.startAt,
      endAt,
      status: "booked",
      notes: input.notes ?? null,
    });
    return { ok: true, appointment };
  } catch {
    // Unique-index violation (E11000) → the slot was taken between read and write.
    return { ok: false, reason: "slot_taken" };
  }
}

export async function cancel(tenantId: string, id: string): Promise<boolean> {
  const updated = await appts.update(tenantId, id, { status: "cancelled" } as Partial<Appointment>);
  return !!updated;
}

/** Sensible default: Sun–Thu, 09:00–17:00 (Israeli work week). */
function defaultWorkingHours(): WorkingWindow[] {
  return [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinutes: 9 * 60, endMinutes: 17 * 60 }));
}
