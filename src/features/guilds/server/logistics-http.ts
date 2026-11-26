import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { getDuneClient } from '../../../server/integrations/dune';
import { loadVehicles } from '../../vehicles/server/load';
import { guildMemberId, guildMemberName, guildMemberRole } from '../member-identity';
import { operationGuildIdSchema } from '../operations';
import {
  TEMPLATE_LIMIT,
  templateInputSchema,
  templatesDocumentSchema,
  type TemplatesView,
} from '../operation-templates';
import {
  AVAILABILITY_ENTRY_LIMIT,
  availabilityDocumentSchema,
  availabilityInputSchema,
  type AvailabilityView,
} from '../availability';
import {
  FLEET_RESERVATION_LIMIT,
  FLEET_VEHICLE_LIMIT,
  bookingConflicts,
  fleetDocumentSchema,
  fleetInputSchema,
  validBookingWindow,
  type FleetCandidates,
  type FleetDocument,
  type FleetView,
} from '../fleet';
import {
  CAMPAIGN_ASSIGNEE_LIMIT,
  CAMPAIGN_TARGET_LIMIT,
  campaignDocumentSchema,
  campaignInputSchema,
  landsraadObservation,
  type CampaignDocument,
  type CampaignView,
  type LandsraadObservation,
} from '../landsraad-campaign';
import { requireGuildMember } from './member-access';
import { readGuildOperations } from './operations-store';
import { readLogistics, updateOwnLogistics, writeLogistics, type LogisticsSection } from './logistics-store';

type Context = { params: Promise<{ guildId: string }> };
type Access = Awaited<ReturnType<typeof access>>;
const sectionSchema = z.enum(['templates', 'availability', 'fleet', 'landsraad']);
const leaderRequired = () =>
  new AppError('Only the guild leader can manage this plan.', 403, 'GUILD_LEADER_REQUIRED', true);

async function access(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = operationGuildIdSchema.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:logistics:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Logistics requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'LOGISTICS_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'LOGISTICS_LIMITED', true);
  const member = await requireGuildMember(session, parsed.data);
  if (!member.memberId)
    throw new AppError('Your guild member ID could not be verified.', 503, 'GUILD_VERIFICATION_UNAVAILABLE', true);
  return { session, guildId: parsed.data, ...member, memberId: member.memberId };
}

/** Opaque per-guild member reference: lets members pick pilots and assignees without seeing Console IDs. */
export function memberRef(guildId: string, memberId: string) {
  return createHash('sha256').update(`arrakis-guild-member:${guildId}:${memberId}`).digest('hex').slice(0, 24);
}
function rosterOptions(access: Access) {
  const seen = new Set<string>();
  return access.roster.flatMap((row) => {
    const id = guildMemberId(row);
    if (!id || guildMemberRole(row) === null || seen.has(id)) return [];
    seen.add(id);
    return [{ id, ref: memberRef(access.guildId, id), name: guildMemberName(row), isSelf: id === access.memberId }];
  });
}
function rosterByRef(access: Access, ref: string) {
  const member = rosterOptions(access).find((entry) => entry.ref === ref);
  if (!member)
    throw new AppError(
      'That member is no longer on the guild roster. Refresh and choose again.',
      409,
      'LOGISTICS_MEMBER_GONE',
      true,
    );
  return member;
}

// ---- Landsraad objectives (shared, sanitized, briefly cached) ----
let landsraadCache: { expires: number; value: Promise<LandsraadObservation> } | null = null;
export function resetLandsraadCache() {
  landsraadCache = null;
}
function observeLandsraad(): Promise<LandsraadObservation> {
  const now = Date.now();
  if (!landsraadCache || landsraadCache.expires <= now) {
    const value = getDuneClient()
      .request('GET', '/api/admin/landsraad')
      .then((raw) => landsraadObservation(raw, Date.now()))
      .catch((): LandsraadObservation => ({ status: 'unavailable' }));
    landsraadCache = { expires: now + 60_000, value };
  }
  return landsraadCache.value;
}

// ---- Views ----
async function templatesView(access: Access): Promise<TemplatesView> {
  const document = await readLogistics(access.guildId, 'templates', templatesDocumentSchema);
  return { revision: document?.revision ?? null, canEdit: access.canEdit, templates: document?.templates ?? [] };
}
async function availabilityView(access: Access): Promise<AvailabilityView> {
  const document = await readLogistics(access.guildId, 'availability', availabilityDocumentSchema);
  const roster = new Set(rosterOptions(access).map((entry) => entry.id));
  return {
    entries: (document?.entries ?? [])
      // Former members drop out of the board as soon as the fresh roster no longer lists them.
      .filter((entry) => roster.has(entry.memberId))
      .map(({ memberId, ...entry }) => ({ ...entry, isSelf: memberId === access.memberId })),
  };
}
function fleetProjection(access: Access, document: FleetDocument | null): FleetView {
  const vehicles = document?.vehicles ?? [];
  return {
    revision: document?.revision ?? null,
    canEdit: access.canEdit,
    vehicles: vehicles.map(({ vehicleRef: _ref, ownerId, ...vehicle }) => {
      void _ref;
      return { ...vehicle, isOwn: ownerId === access.memberId };
    }),
    reservations: (document?.reservations ?? []).map(({ pilotId, bookedById, ...reservation }) => ({
      ...reservation,
      pilotRef: memberRef(access.guildId, pilotId),
      isPilotSelf: pilotId === access.memberId,
      canCancel:
        access.canEdit ||
        [pilotId, bookedById].includes(access.memberId) ||
        vehicles.some((vehicle) => vehicle.id === reservation.vehicleId && vehicle.ownerId === access.memberId),
    })),
    pilots: rosterOptions(access).map(({ id: _id, ...entry }) => {
      void _id;
      return entry;
    }),
  };
}
async function fleetCandidates(access: Access, document: FleetDocument | null): Promise<FleetCandidates> {
  const result = await loadVehicles(access.session);
  if (result.status !== 'ok')
    return {
      status: result.status,
      message: result.status === 'unavailable' ? result.message : undefined,
      vehicles: [],
    };
  return {
    status: 'ok',
    vehicles: result.vehicles
      .filter((vehicle) => vehicle.access === 'owned')
      .slice(0, 200)
      .map((vehicle) => ({
        vehicleRef: vehicle.id,
        ...observed(vehicle),
        published: (document?.vehicles ?? []).some((entry) => entry.vehicleRef === vehicle.id),
      })),
  };
}
function observed(vehicle: Extract<Awaited<ReturnType<typeof loadVehicles>>, { status: 'ok' }>['vehicles'][number]) {
  const percent = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  return {
    name: vehicle.name.slice(0, 200) || 'Vehicle',
    type: vehicle.type.slice(0, 200) || 'Vehicle',
    condition: percent(vehicle.condition),
    fuelPercent: percent(vehicle.fuel?.percent),
    storage: vehicle.storage
      ? {
          used: vehicle.storage.used !== null && vehicle.storage.used >= 0 ? vehicle.storage.used : null,
          max: vehicle.storage.max !== null && vehicle.storage.max >= 0 ? vehicle.storage.max : null,
          unit: vehicle.storage.unit,
        }
      : null,
    observedAt: new Date().toISOString(),
  };
}
function campaignProjection(
  access: Access,
  document: CampaignDocument | null,
  observation: LandsraadObservation,
): CampaignView {
  return {
    revision: document?.revision ?? null,
    canEdit: access.canEdit,
    observation,
    targets: (document?.targets ?? []).map((target) => ({
      ...target,
      assignees: target.assignees.map((entry) => ({
        ref: memberRef(access.guildId, entry.memberId),
        name: entry.name,
        isSelf: entry.memberId === access.memberId,
      })),
    })),
    members: rosterOptions(access).map(({ id: _id, ...entry }) => {
      void _id;
      return entry;
    }),
  };
}

export async function getGuildLogistics(request: Request, ctx: Context) {
  const url = new URL(request.url);
  const section = sectionSchema.safeParse(url.searchParams.get('section'));
  if (!section.success) throw new AppError('Choose a logistics section.', 400, 'INVALID_LOGISTICS_SECTION', true);
  const current = await access(ctx, false);
  if (section.data === 'templates') return json({ ok: true, data: await templatesView(current) });
  if (section.data === 'availability') return json({ ok: true, data: await availabilityView(current) });
  if (section.data === 'fleet') {
    const document = await readLogistics(current.guildId, 'fleet', fleetDocumentSchema);
    return json({
      ok: true,
      data: {
        ...fleetProjection(current, document),
        ...(url.searchParams.get('candidates') === '1' ? { candidates: await fleetCandidates(current, document) } : {}),
      },
    });
  }
  const [document, observation] = await Promise.all([
    readLogistics(current.guildId, 'landsraad', campaignDocumentSchema),
    observeLandsraad(),
  ]);
  return json({ ok: true, data: campaignProjection(current, document, observation) });
}

// ---- Mutations ----
async function mutateTemplates(current: Access, raw: unknown) {
  const input = templateInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the template name, roles, schedule and lists.', 400, 'INVALID_LOGISTICS', true);
  if (!current.canEdit) throw leaderRequired();
  const document = await readLogistics(current.guildId, 'templates', templatesDocumentSchema);
  const templates = document?.templates ?? [];
  if (input.data.action === 'delete') {
    const removed = input.data.id;
    const kept = templates.filter((entry) => entry.id !== removed);
    await writeLogistics(
      current.guildId,
      'templates',
      templatesDocumentSchema,
      input.data.revision,
      kept.length ? { templates: kept } : null,
    );
  } else {
    const { template } = input.data;
    if ((document?.revision ?? null) !== input.data.revision)
      throw new AppError('Templates changed. Refresh before trying again.', 409, 'LOGISTICS_CONFLICT', true);
    const others = templates.filter((entry) => entry.id !== template.id);
    if (others.length >= TEMPLATE_LIMIT)
      throw new AppError(`Keep at most ${TEMPLATE_LIMIT} templates.`, 409, 'LOGISTICS_FULL', true);
    await writeLogistics(current.guildId, 'templates', templatesDocumentSchema, input.data.revision, {
      templates: [...others, { ...template, updatedBy: current.authorName, updatedAt: new Date().toISOString() }].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    });
  }
  return templatesView(current);
}

async function mutateAvailability(current: Access, raw: unknown) {
  const input = availabilityInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Choose a valid timezone and up to 14 weekly windows.', 400, 'INVALID_LOGISTICS', true);
  const roster = new Set(rosterOptions(current).map((entry) => entry.id));
  // Dev note: everyone is free at 3 a.m. until someone schedules a raid then.
  await updateOwnLogistics(current.guildId, 'availability', availabilityDocumentSchema, (document) => {
    const previous = document?.entries.find((entry) => entry.memberId === current.memberId);
    const entries = (document?.entries ?? []).filter(
      (entry) => entry.memberId !== current.memberId && roster.has(entry.memberId),
    );
    if (input.data.action === 'save') {
      if (entries.length >= AVAILABILITY_ENTRY_LIMIT)
        throw new AppError('The availability board is full.', 409, 'LOGISTICS_FULL', true);
      entries.push({
        ...input.data.availability,
        id: previous?.id ?? randomUUID(),
        memberId: current.memberId,
        name: current.authorName,
        updatedAt: new Date().toISOString(),
      });
    }
    return entries.length ? { entries } : null;
  });
  return availabilityView(current);
}

async function mutateFleet(current: Access, raw: unknown) {
  const input = fleetInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the vehicle, pilot, purpose and booking times.', 400, 'INVALID_LOGISTICS', true);
  const change = input.data;
  const document = await readLogistics(current.guildId, 'fleet', fleetDocumentSchema);
  if ((document?.revision ?? null) !== change.revision) throw conflictError();
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const vehicles = [...(document?.vehicles ?? [])];
  // Finished bookings older than a day are pruned so the record stays bounded.
  let reservations = (document?.reservations ?? []).filter((entry) => Date.parse(entry.endsAt) > now - 86_400_000);
  const vehicleOf = (id: string) => {
    const vehicle = vehicles.find((entry) => entry.id === id);
    if (!vehicle) throw conflictError();
    return vehicle;
  };
  switch (change.action) {
    case 'publish': {
      const loaded = await loadVehicles(current.session);
      if (loaded.status !== 'ok')
        throw new AppError(
          'Your vehicles could not be verified right now. Try again shortly.',
          503,
          'LOGISTICS_VERIFY_FAILED',
          true,
        );
      const vehicle = loaded.vehicles.find((entry) => entry.id === change.vehicleRef && entry.access === 'owned');
      if (!vehicle)
        throw new AppError(
          'Only vehicles your linked character owns can be published.',
          403,
          'LOGISTICS_NOT_OWNER',
          true,
        );
      if (vehicles.some((entry) => entry.vehicleRef === change.vehicleRef))
        throw new AppError('This vehicle is already in the guild fleet.', 409, 'LOGISTICS_DUPLICATE', true);
      if (vehicles.length >= FLEET_VEHICLE_LIMIT)
        throw new AppError(`Keep at most ${FLEET_VEHICLE_LIMIT} fleet vehicles.`, 409, 'LOGISTICS_FULL', true);
      vehicles.push({
        id: randomUUID(),
        vehicleRef: change.vehicleRef,
        ...observed(vehicle),
        ownerId: current.memberId,
        ownerName: current.authorName,
        notes: change.notes,
        publishedAt: timestamp,
      });
      break;
    }
    case 'reverify': {
      const vehicle = vehicleOf(change.vehicleId);
      if (vehicle.ownerId !== current.memberId)
        throw new AppError('Only the owner can re-verify a fleet vehicle.', 403, 'LOGISTICS_NOT_OWNER', true);
      const loaded = await loadVehicles(current.session);
      if (loaded.status !== 'ok')
        throw new AppError(
          'Your vehicles could not be verified right now. Try again shortly.',
          503,
          'LOGISTICS_VERIFY_FAILED',
          true,
        );
      const fresh = loaded.vehicles.find((entry) => entry.id === vehicle.vehicleRef && entry.access === 'owned');
      if (!fresh)
        throw new AppError(
          'Your linked character no longer reports owning this vehicle. Withdraw it from the fleet.',
          409,
          'LOGISTICS_NOT_OWNER',
          true,
        );
      vehicles.splice(vehicles.indexOf(vehicle), 1, { ...vehicle, ...observed(fresh) });
      break;
    }
    case 'withdraw': {
      const vehicle = vehicleOf(change.vehicleId);
      if (!current.canEdit && vehicle.ownerId !== current.memberId)
        throw new AppError(
          'Only the owner or a guild leader can withdraw this vehicle.',
          403,
          'LOGISTICS_FORBIDDEN',
          true,
        );
      vehicles.splice(vehicles.indexOf(vehicle), 1);
      reservations = reservations.filter((entry) => entry.vehicleId !== vehicle.id);
      break;
    }
    case 'reserve': {
      const draft = change.reservation;
      const vehicle = vehicleOf(draft.vehicleId);
      if (!current.canEdit && vehicle.ownerId !== current.memberId)
        throw new AppError(
          'Only the vehicle owner or a guild leader can book this vehicle.',
          403,
          'LOGISTICS_FORBIDDEN',
          true,
        );
      if (!validBookingWindow(draft, now))
        throw new AppError(
          'Bookings must end in the future, start within 60 days and last up to 48 hours.',
          400,
          'INVALID_LOGISTICS',
          true,
        );
      if (draft.operationId) {
        const operation = (await readGuildOperations(current.guildId)).find((entry) => entry.id === draft.operationId);
        if (!operation || operation.status === 'cancelled')
          throw new AppError('That operation is no longer scheduled.', 409, 'LOGISTICS_CONFLICT', true);
      }
      const pilot = rosterByRef(current, draft.pilotRef);
      const existing = reservations.find((entry) => entry.id === draft.id);
      const next = {
        id: draft.id,
        vehicleId: draft.vehicleId,
        operationId: draft.operationId,
        purpose: draft.purpose,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        pilotId: pilot.id,
        pilotName: pilot.name,
        bookedById: existing?.bookedById ?? current.memberId,
        bookedByName: existing?.bookedByName ?? current.authorName,
        createdAt: existing?.createdAt ?? timestamp,
      };
      const clash = bookingConflicts(reservations, next);
      if (clash.vehicle)
        throw new AppError(
          `${vehicle.name} is already booked for “${clash.vehicle.purpose}” during that time.`,
          409,
          'LOGISTICS_BOOKING_CONFLICT',
          true,
        );
      if (clash.pilot)
        throw new AppError(
          `${pilot.name} is already assigned to fly for “${clash.pilot.purpose}” during that time.`,
          409,
          'LOGISTICS_BOOKING_CONFLICT',
          true,
        );
      reservations = [...reservations.filter((entry) => entry.id !== draft.id), next];
      if (reservations.length > FLEET_RESERVATION_LIMIT)
        throw new AppError(`Keep at most ${FLEET_RESERVATION_LIMIT} active bookings.`, 409, 'LOGISTICS_FULL', true);
      break;
    }
    case 'cancel': {
      const reservation = reservations.find((entry) => entry.id === change.reservationId);
      if (!reservation) throw conflictError();
      const vehicle = vehicleOf(reservation.vehicleId);
      if (
        !current.canEdit &&
        ![reservation.pilotId, reservation.bookedById, vehicle.ownerId].includes(current.memberId)
      )
        throw new AppError(
          'Only the booker, pilot, owner or a guild leader can cancel this booking.',
          403,
          'LOGISTICS_FORBIDDEN',
          true,
        );
      reservations = reservations.filter((entry) => entry.id !== reservation.id);
      break;
    }
  }
  reservations.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next = vehicles.length ? { vehicles, reservations } : null;
  const revision = await writeLogistics(current.guildId, 'fleet', fleetDocumentSchema, change.revision, next);
  return fleetProjection(current, next && revision ? { ...next, revision } : null);
}
const conflictError = () =>
  new AppError('This plan changed. Refresh before trying again. Your draft is kept.', 409, 'LOGISTICS_CONFLICT', true);

async function mutateCampaign(current: Access, raw: unknown) {
  const input = campaignInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the target title, objective link and assignees.', 400, 'INVALID_LOGISTICS', true);
  const change = input.data;
  const timestamp = new Date().toISOString();
  if (change.action === 'claim' || change.action === 'unclaim') {
    await updateOwnLogistics(current.guildId, 'landsraad', campaignDocumentSchema, (document) => {
      if (!document) throw conflictError();
      const target = document.targets.find((entry) => entry.id === change.id);
      if (!target) throw conflictError();
      if (change.action === 'claim' && (target.status === 'met' || target.status === 'dropped'))
        throw new AppError('This target is closed.', 409, 'LOGISTICS_CLOSED', true);
      const assignees = target.assignees.filter((entry) => entry.memberId !== current.memberId);
      if (change.action === 'claim') {
        if (assignees.length >= CAMPAIGN_ASSIGNEE_LIMIT)
          throw new AppError('This target already has enough assignees.', 409, 'LOGISTICS_FULL', true);
        assignees.push({ memberId: current.memberId, name: current.authorName });
      }
      return {
        targets: document.targets.map((entry) => (entry.id === target.id ? { ...entry, assignees } : entry)),
      };
    });
  } else {
    if (!current.canEdit) throw leaderRequired();
    const document = await readLogistics(current.guildId, 'landsraad', campaignDocumentSchema);
    if ((document?.revision ?? null) !== change.revision) throw conflictError();
    let targets = [...(document?.targets ?? [])];
    if (change.action === 'delete') targets = targets.filter((entry) => entry.id !== change.id);
    else {
      const draft = change.target;
      const existing = targets.find((entry) => entry.id === draft.id);
      let termId = existing && existing.taskKey === draft.taskKey ? existing.termId : null;
      if (draft.taskKey && termId === null) {
        const observation = await observeLandsraad();
        if (observation.status !== 'ok' || !observation.tasks.some((task) => task.key === draft.taskKey))
          throw new AppError(
            'That Landsraad objective is not in the current term reported by the server. Refresh the objectives or save the target without a link.',
            409,
            'LOGISTICS_OBJECTIVE_UNVERIFIED',
            true,
          );
        termId = observation.termId;
      }
      const assignees = [...new Set(draft.assigneeRefs)].map((ref) => {
        const member = rosterByRef(current, ref);
        return { memberId: member.id, name: member.name };
      });
      const { assigneeRefs: _refs, ...fields } = draft;
      void _refs;
      targets = targets.filter((entry) => entry.id !== draft.id);
      if (targets.length >= CAMPAIGN_TARGET_LIMIT)
        throw new AppError(`Keep at most ${CAMPAIGN_TARGET_LIMIT} campaign targets.`, 409, 'LOGISTICS_FULL', true);
      targets.push({ ...fields, termId, assignees, updatedAt: timestamp, updatedBy: current.authorName });
    }
    await writeLogistics(
      current.guildId,
      'landsraad',
      campaignDocumentSchema,
      change.revision,
      targets.length ? { targets } : null,
    );
  }
  const [document, observation] = await Promise.all([
    readLogistics(current.guildId, 'landsraad', campaignDocumentSchema),
    observeLandsraad(),
  ]);
  return campaignProjection(current, document, observation);
}

const handlers: Record<LogisticsSection, (current: Access, raw: unknown) => Promise<unknown>> = {
  templates: mutateTemplates,
  availability: mutateAvailability,
  fleet: mutateFleet,
  landsraad: mutateCampaign,
};

export async function mutateGuildLogistics(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const current = await access(ctx, true);
  const bytes = await readBoundedBody(request, 32_768);
  if (!bytes) throw new AppError('Logistics details are too large.', 413, 'LOGISTICS_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid logistics details.', 400, 'INVALID_LOGISTICS', true);
  }
  const envelope = z.object({ section: sectionSchema, input: z.unknown() }).strict().safeParse(raw);
  if (!envelope.success) throw new AppError('Choose a logistics section.', 400, 'INVALID_LOGISTICS_SECTION', true);
  const data = await handlers[envelope.data.section](current, envelope.data.input);
  void recordAudit({
    event: 'guild.logistics_updated',
    outcome: 'success',
    actor: current.session.user.id,
    data: {
      guildId: current.guildId,
      section: envelope.data.section,
      action:
        typeof envelope.data.input === 'object' && envelope.data.input && 'action' in envelope.data.input
          ? String((envelope.data.input as { action: unknown }).action).slice(0, 40)
          : 'unknown',
    },
  });
  return json({ ok: true, data });
}
