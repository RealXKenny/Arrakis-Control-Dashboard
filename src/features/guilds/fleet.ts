import { z } from 'zod';

export const FLEET_VEHICLE_LIMIT = 30;
export const FLEET_RESERVATION_LIMIT = 100;
const FLEET_BOOKING_MAX_MS = 48 * 3_600_000;
const FLEET_BOOKING_HORIZON_MS = 60 * 86_400_000;

const memberId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const ref = z.string().regex(/^[a-f0-9]{24}$/);
const name = z.string().min(1).max(200);
const percent = z.number().min(0).max(100).nullable();
const observed = {
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(200),
  condition: percent,
  fuelPercent: percent,
  storage: z
    .object({ used: z.number().min(0).nullable(), max: z.number().min(0).nullable(), unit: z.enum(['kg', 'slots']) })
    .nullable(),
  observedAt: z.iso.datetime(),
};
const vehicleFields = {
  id: z.uuid(),
  ...observed,
  ownerName: name,
  notes: z.string().trim().max(200),
  publishedAt: z.iso.datetime(),
};
const fleetVehicleSchema = z.object({
  ...vehicleFields,
  vehicleRef: z.string().min(1).max(128),
  ownerId: memberId,
});
const reservationDraft = {
  id: z.uuid(),
  vehicleId: z.uuid(),
  operationId: z.uuid().nullable(),
  purpose: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
};
const reservationFields = {
  ...reservationDraft,
  pilotName: name,
  bookedByName: name,
  createdAt: z.iso.datetime(),
};
const fleetReservationSchema = z.object({ ...reservationFields, pilotId: memberId, bookedById: memberId });
export const fleetDocumentSchema = z
  .object({
    revision: z.uuid(),
    vehicles: z.array(fleetVehicleSchema).max(FLEET_VEHICLE_LIMIT),
    reservations: z.array(fleetReservationSchema).max(FLEET_RESERVATION_LIMIT),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.vehicles.map((entry) => entry.id)).size === value.vehicles.length &&
      new Set(value.vehicles.map((entry) => entry.vehicleRef)).size === value.vehicles.length &&
      value.reservations.every((entry) => value.vehicles.some((vehicle) => vehicle.id === entry.vehicleId)),
  );
export const fleetViewSchema = z.object({
  revision: z.uuid().nullable(),
  canEdit: z.boolean(),
  vehicles: z.array(z.object({ ...vehicleFields, isOwn: z.boolean() })).max(FLEET_VEHICLE_LIMIT),
  reservations: z
    .array(z.object({ ...reservationFields, pilotRef: ref, isPilotSelf: z.boolean(), canCancel: z.boolean() }))
    .max(FLEET_RESERVATION_LIMIT),
  pilots: z.array(z.object({ ref, name, isSelf: z.boolean() })).max(500),
});
export const fleetCandidatesSchema = z.object({
  status: z.enum(['ok', 'unlinked', 'limited', 'unavailable']),
  message: z.string().max(300).optional(),
  vehicles: z.array(z.object({ vehicleRef: z.string().min(1).max(128), ...observed, published: z.boolean() })).max(200),
});
export const fleetInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('publish'),
      revision: z.uuid().nullable(),
      vehicleRef: z.string().min(1).max(128),
      notes: z.string().trim().max(200),
    })
    .strict(),
  z.object({ action: z.literal('reverify'), revision: z.uuid(), vehicleId: z.uuid() }).strict(),
  z.object({ action: z.literal('withdraw'), revision: z.uuid(), vehicleId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('reserve'),
      revision: z.uuid(),
      reservation: z.object({ ...reservationDraft, pilotRef: ref }).strict(),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), revision: z.uuid(), reservationId: z.uuid() }).strict(),
]);
export type FleetDocument = z.infer<typeof fleetDocumentSchema>;
export type FleetReservation = z.infer<typeof fleetReservationSchema>;
export type FleetInput = z.infer<typeof fleetInputSchema>;
export type FleetView = z.infer<typeof fleetViewSchema>;
export type FleetCandidates = z.infer<typeof fleetCandidatesSchema>;

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

/** A vehicle has one booking at a time, and a pilot flies one vehicle at a time. */
export function bookingConflicts<
  T extends Pick<FleetReservation, 'id' | 'vehicleId' | 'pilotId' | 'startsAt' | 'endsAt'>,
>(
  reservations: T[],
  candidate: Pick<FleetReservation, 'id' | 'vehicleId' | 'pilotId' | 'startsAt' | 'endsAt'>,
): { vehicle: T | null; pilot: T | null } {
  const others = reservations.filter((entry) => entry.id !== candidate.id && overlaps(entry, candidate));
  return {
    vehicle: others.find((entry) => entry.vehicleId === candidate.vehicleId) ?? null,
    pilot: others.find((entry) => entry.pilotId === candidate.pilotId) ?? null,
  };
}

export function validBookingWindow(value: { startsAt: string; endsAt: string }, now: number) {
  const start = Date.parse(value.startsAt);
  const end = Date.parse(value.endsAt);
  return end > start && end - start <= FLEET_BOOKING_MAX_MS && end > now && start <= now + FLEET_BOOKING_HORIZON_MS;
}
