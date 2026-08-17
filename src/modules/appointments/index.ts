/**
 * Appointments module — public surface ([קטגוריה 13]).
 */
export {
  availableSlots,
  book,
  cancel,
  createResource,
  getResource,
  updateResource,
  deleteResource,
  listAppointments,
  listResources,
  type BookResult,
  type Slot,
} from "./service";
export {
  AppointmentRepository,
  AppointmentResourceRepository,
  ensureAppointmentIndexes,
} from "./repository";
export type {
  Appointment,
  AppointmentResource,
  AppointmentStatus,
  WorkingWindow,
} from "./models";
