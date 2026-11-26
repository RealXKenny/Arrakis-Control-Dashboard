import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { guildMemberId, guildMemberName, guildMemberRole } from '../member-identity';
import { resourceProgress } from '../resource-requests';
import {
  materialCoverage,
  projectGuildIdSchema,
  projectInputSchema,
  projectsView,
  type GuildProjectsBook,
  type ProjectActor,
} from '../projects';
import { requireGuildMember } from './member-access';
import { checkProjectChange, mutateProjects, readProjects } from './projects-store';
import { observeMaterialPrice } from './projects-market';
import { mutateResourceRequest, readResourceRequests } from './resource-requests-store';

const ROSTER_LIMIT = 500;

/** Guild-scoped, one-way member references: canonical Console IDs never reach storage or browsers. */
export function projectMemberKey(guildId: string, memberId: string) {
  return createHash('sha256')
    .update(
      JSON.stringify(['guild-projects', projectGuildIdSchema.parse(guildId), projectGuildIdSchema.parse(memberId)]),
    )
    .digest('hex');
}

type Access = Awaited<ReturnType<typeof requireGuildMember>>;
function projectActor(guildId: string, access: Access): ProjectActor {
  if (!access.memberId || access.roster.length > ROSTER_LIMIT)
    throw new AppError('The current guild roster could not be verified.', 503, 'GUILD_VERIFICATION_UNAVAILABLE', true);
  const roster = [
    ...new Map(
      access.roster.flatMap((row) => {
        const id = guildMemberId(row);
        if (!id || guildMemberRole(row) === null) return [];
        const key = projectMemberKey(guildId, id);
        return [[key, { key, name: guildMemberName(row) }] as const];
      }),
    ).values(),
  ];
  const memberKey = projectMemberKey(guildId, access.memberId);
  if (!roster.some((member) => member.key === memberKey))
    throw new AppError('Only current members can access guild projects.', 403, 'GUILD_MEMBER_REQUIRED', true);
  return { memberKey, name: access.authorName, canEdit: access.canEdit, roster };
}

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = projectGuildIdSchema.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:projects:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Guild project requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'PROJECTS_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'PROJECTS_LIMITED', true);
  const member = await requireGuildMember(session, parsed.data);
  const actor = projectActor(parsed.data, member);
  return { session, guildId: parsed.data, actor, memberId: member.memberId! };
}

async function requestStates(guildId: string) {
  const requests = await readResourceRequests(guildId);
  return new Map(
    requests.map((request) => {
      const progress = resourceProgress(request);
      return [request.id, { status: request.status, committed: progress.committed, delivered: progress.delivered }];
    }),
  );
}

async function view(guildId: string, book: GuildProjectsBook, actor: ProjectActor) {
  // A resource-request outage must not hide the project plan; links then show as unknown.
  const requests = await requestStates(guildId).catch(() => null);
  return {
    ...projectsView(book, actor, requests ?? new Map()),
    requestsAvailable: requests !== null,
  };
}

export async function getGuildProjects(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({ ok: true, data: await view(access.guildId, await readProjects(access.guildId), access.actor) });
}

export async function mutateGuildProjects(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 32_768);
  if (!bytes) throw new AppError('Project details are too large.', 413, 'PROJECTS_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid project details.', 400, 'INVALID_PROJECT_INPUT', true);
  }
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      'Check the project fields, limits and whole-number amounts.',
      400,
      'INVALID_PROJECT_INPUT',
      true,
    );
  const input = parsed.data;
  const { guildId, actor } = access;
  let book: GuildProjectsBook;

  if (input.action === 'observe-price') {
    // Validate permission and the template first, then read the exchange, then store against fresh state.
    const checked = await checkProjectChange(guildId, input, actor);
    const material = checked.projects
      .find((project) => project.id === input.id)
      ?.materials.find((entry) => entry.id === input.materialId);
    if (!material?.templateId)
      throw new AppError('Add the exchange item ID before observing prices.', 409, 'PROJECT_NO_TEMPLATE', true);
    const estimate = await observeMaterialPrice(material.templateId);
    ({ book } = await mutateProjects(
      guildId,
      { action: 'set-estimate', id: input.id, revision: input.revision, materialId: input.materialId, estimate },
      actor,
    ));
  } else if (input.action === 'request-shortage') {
    const open = new Set(
      [...(await requestStates(guildId))].flatMap(([id, state]) => (state.status === 'open' ? [id] : [])),
    );
    // Step 1 reserves the link atomically so a second click or member cannot prepare a duplicate.
    ({ book } = await mutateProjects(guildId, input, actor, { openRequestIds: open }));
    const project = book.projects.find((entry) => entry.id === input.id)!;
    const material = project.materials.find((entry) => entry.id === input.materialId)!;
    const requestId = material.requestId!;
    try {
      // Step 2 is the member's explicit request: exactly one resource request, never retried automatically.
      await mutateResourceRequest(
        guildId,
        {
          action: 'save',
          revision: null,
          request: {
            id: requestId,
            material: material.name,
            quantity: materialCoverage(project, material.id).shortage,
            unit: material.unit,
            dropoff: input.request.dropoff,
            details: (input.request.details || `Shortage for guild project “${project.name}”.`).slice(0, 1500),
            priority: input.request.priority,
          },
        },
        // The resource tracker keeps its own canonical requester identity, verified freshly above.
        { memberId: access.memberId, authorName: actor.name, canEdit: actor.canEdit },
      );
    } catch (error) {
      await mutateProjects(
        guildId,
        { action: 'clear-request-link', id: input.id, materialId: input.materialId, requestId },
        actor,
      ).catch(() => undefined);
      throw error;
    }
  } else {
    ({ book } = await mutateProjects(guildId, input, actor));
  }
  void recordAudit({
    event: 'guild.project_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: { guildId, action: input.action },
  });
  return json({ ok: true, data: await view(guildId, book, actor) });
}
