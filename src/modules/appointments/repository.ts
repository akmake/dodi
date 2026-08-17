/**
 * Appointment repositories.
 */
import { Repository } from "@/core/db/repository";
import { getDb } from "@/core/db/mongo";
import type { Filter } from "mongodb";
import type { Appointment, AppointmentResource } from "./models";

export class AppointmentResourceRepository extends Repository<AppointmentResource> {
  constructor() {
    super("appointment_resources");
  }
  listActive(tenantId: string) {
    return this.findMany(tenantId, { active: true } as Filter<AppointmentResource>);
  }
}

export class AppointmentRepository extends Repository<Appointment> {
  constructor() {
    super("appointments");
  }
  /** Booked appointments for a resource within [from, to). */
  listBooked(tenantId: string, resourceId: string, from: Date, to: Date) {
    return this.findMany(tenantId, {
      resourceId,
      status: "booked",
      startAt: { $gte: from, $lt: to },
    } as unknown as Filter<Appointment>);
  }
}

let indexesReady: Promise<void> | null = null;

export function ensureAppointmentIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db
          .collection("appointment_resources")
          .createIndex({ tenantId: 1, name: 1 }, { unique: true }),
        // No two *booked* appointments may share a resource + start time.
        db.collection("appointments").createIndex(
          { tenantId: 1, resourceId: 1, startAt: 1 },
          { unique: true, partialFilterExpression: { status: "booked" } }
        ),
      ]);
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
}
