import { z } from 'zod';
import { MAP_NAMES, type MapName } from '../map/maps';
import { deepDesertSectorForWorldPoint } from '../map/utils/sector-grid';

/**
 * Private vehicle and exploration plans (N032, N034, N036–N039). Browser-safe: the same strict schema validates
 * the editor, the API body and the stored Redis record. Plans describe intentions only; nothing here renames,
 * moves, reserves or otherwise changes a game record.
 */

export const PLAN_LIMITS = {
  vehicles: 50,
  tags: 6,
  manifests: 10,
  manifestLines: 40,
  bookmarks: 100,
  routes: 20,
  waypoints: 25,
  journal: 60,
  checklist: 30,
  bytes: 128 * 1024,
} as const;

const COORDINATE_LIMIT = 10_000_000;
const assetId = z.string().regex(/^[1-9][0-9]{0,15}$/);
const label = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Control characters');
const required = (max: number) => label(max).pipe(z.string().min(1));
const coordinate = z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT);
const unique = <T>(values: T[], key: (value: T) => string) => new Set(values.map(key)).size === values.length;

export const vehicleLabelSchema = z
  .object({
    vehicleId: assetId,
    nickname: label(40),
    tags: z
      .array(required(24))
      .max(PLAN_LIMITS.tags)
      .refine((tags) => unique(tags, (tag) => tag.toLowerCase()), 'Duplicate tag'),
    purpose: label(200),
  })
  .strict();

export const thresholdsSchema = z
  .object({
    fuelPercent: z.number().int().min(0).max(100),
    conditionPercent: z.number().int().min(0).max(100),
  })
  .strict();

const manifestLineSchema = z
  .object({
    templateId: required(128),
    name: required(200),
    // Exact decimal strings, never JavaScript numbers, so large stacks survive unchanged.
    quantity: z.string().regex(/^[1-9][0-9]{0,17}$/),
  })
  .strict();

export const manifestSchema = z
  .object({
    id: z.uuid(),
    name: required(60),
    lines: z
      .array(manifestLineSchema)
      .max(PLAN_LIMITS.manifestLines)
      .refine((lines) => unique(lines, (line) => line.templateId.toLowerCase()), 'Duplicate item'),
  })
  .strict();

export const bookmarkSchema = z
  .object({
    id: z.uuid(),
    map: z.enum(MAP_NAMES),
    x: coordinate,
    y: coordinate,
    label: required(60),
    note: label(300),
  })
  .strict();

const routeSchema = z
  .object({
    id: z.uuid(),
    name: required(60),
    map: z.enum(MAP_NAMES),
    waypointIds: z.array(z.uuid()).min(2).max(PLAN_LIMITS.waypoints),
  })
  .strict();

const journalEntrySchema = z
  .object({
    id: z.uuid(),
    map: z.enum(MAP_NAMES),
    x: coordinate.nullable(),
    y: coordinate.nullable(),
    title: required(80),
    observation: label(500),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((entry) => (entry.x === null) === (entry.y === null), 'Both coordinates or neither');

const checklistItemSchema = z.object({ id: z.uuid(), label: required(120), done: z.boolean() }).strict();

const departureSchema = z
  .object({
    routeId: z.uuid().nullable(),
    vehicleId: assetId.nullable(),
    manifestId: z.uuid().nullable(),
    items: z.array(checklistItemSchema).max(PLAN_LIMITS.checklist),
  })
  .strict();

export const planDataSchema = z
  .object({
    vehicles: z.array(vehicleLabelSchema).max(PLAN_LIMITS.vehicles),
    thresholds: thresholdsSchema,
    manifests: z.array(manifestSchema).max(PLAN_LIMITS.manifests),
    bookmarks: z.array(bookmarkSchema).max(PLAN_LIMITS.bookmarks),
    routes: z.array(routeSchema).max(PLAN_LIMITS.routes),
    journal: z.array(journalEntrySchema).max(PLAN_LIMITS.journal),
    departure: departureSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (!unique(plan.vehicles, (entry) => entry.vehicleId)) issue('Each vehicle can have one label.');
    for (const [name, values] of [
      ['manifest', plan.manifests],
      ['bookmark', plan.bookmarks],
      ['route', plan.routes],
      ['journal entry', plan.journal],
      ['checklist item', plan.departure.items],
    ] as const) {
      if (!unique(values as Array<{ id: string }>, (entry) => entry.id)) issue(`Duplicate ${name} ID.`);
    }
    const bookmarks = new Map(plan.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
    for (const route of plan.routes) {
      // Waypoints must exist in this same record and on the route's map; a route never points elsewhere.
      if (route.waypointIds.some((id) => bookmarks.get(id)?.map !== route.map))
        issue(`Route "${route.name}" references a missing bookmark or one on another map.`);
    }
    const { routeId, manifestId } = plan.departure;
    if (routeId && !plan.routes.some((route) => route.id === routeId)) issue('Departure route does not exist.');
    if (manifestId && !plan.manifests.some((manifest) => manifest.id === manifestId))
      issue('Departure manifest does not exist.');
  });

export const planRecordSchema = z
  .object({ schemaVersion: z.literal(1), revision: z.uuid().nullable(), plan: planDataSchema })
  .strict();
export const planWriteSchema = z.object({ revision: z.uuid().nullable(), plan: planDataSchema }).strict();

export type VehicleLabel = z.infer<typeof vehicleLabelSchema>;
export type Thresholds = z.infer<typeof thresholdsSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestLine = z.infer<typeof manifestLineSchema>;
export type Bookmark = z.infer<typeof bookmarkSchema>;
export type Route = z.infer<typeof routeSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type PlanData = z.infer<typeof planDataSchema>;
export type PlanRecord = z.infer<typeof planRecordSchema>;

const DEFAULT_THRESHOLDS: Thresholds = { fuelPercent: 25, conditionPercent: 40 };

export function emptyPlan(): PlanData {
  return {
    vehicles: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    manifests: [],
    bookmarks: [],
    routes: [],
    journal: [],
    departure: { routeId: null, vehicleId: null, manifestId: null, items: [] },
  };
}

/** Unreal world units are centimetres, so 100,000 units are one kilometre. */
const UNITS_PER_KM = 100_000;

export interface RouteLeg {
  from: Bookmark;
  to: Bookmark;
  km: number;
}
export interface RouteEstimate {
  legs: RouteLeg[];
  km: number;
  missing: number;
}

/**
 * Straight-line distances between saved waypoints. These are planning estimates only: they ignore terrain,
 * storms, sandworms, refuelling stops and any actual flight or driving path.
 */
export function estimateRoute(route: Route, bookmarks: Bookmark[]): RouteEstimate {
  const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const points = route.waypointIds.map((id) => byId.get(id));
  const legs: RouteLeg[] = [];
  let missing = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to || from.map !== route.map || to.map !== route.map) {
      missing++;
      continue;
    }
    legs.push({ from, to, km: Math.hypot(to.x - from.x, to.y - from.y) / UNITS_PER_KM });
  }
  // Dev note: as the crow flies, because the sandworm refuses to give directions.
  return { legs, km: legs.reduce((total, leg) => total + leg.km, 0), missing };
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

/** Deep Desert sector labels come from the same grid the map draws; other maps have no sector. */
export function sectorFor(map: MapName, x: number | null, y: number | null): string | null {
  if (map !== 'DeepDesert' || x === null || y === null) return null;
  return deepDesertSectorForWorldPoint(x, y);
}

export const DEFAULT_DEPARTURE_ITEMS = [
  'Vehicle fuel checked against the trip',
  'Repair kit and spare vehicle parts packed',
  'Water and healing supplies packed',
  'Cargo manifest loaded',
  'Base water and power left topped up',
  'Return route and fallback rally point agreed',
] as const;

export interface DepartureCheck {
  id: string;
  label: string;
  state: 'ready' | 'attention' | 'unknown';
  detail: string;
}
