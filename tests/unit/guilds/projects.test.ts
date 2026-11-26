import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyProjectChange,
  emptyProjectsBook,
  guildProjectsBookSchema,
  materialCoverage,
  projectCostSummary,
  projectInputSchema,
  projectsView,
  stockReserved,
  type GuildProjectsBook,
  type ProjectActor,
  type ProjectInput,
  type InternalProjectChange,
} from '../../../src/features/guilds/projects';

const key = (n: number) => n.toString(16).padStart(64, '0');
const roster = [
  { key: key(1), name: 'Leader' },
  { key: key(2), name: 'Builder' },
  { key: key(3), name: 'Crafter' },
  { key: key(4), name: 'Second leader' },
];
const leader: ProjectActor = { memberKey: key(1), name: 'Leader', canEdit: true, roster };
const builder: ProjectActor = { memberKey: key(2), name: 'Builder', canEdit: false, roster };
const crafter: ProjectActor = { memberKey: key(3), name: 'Crafter', canEdit: false, roster };
const second: ProjectActor = { memberKey: key(4), name: 'Second leader', canEdit: true, roster };
let clock = Date.parse('2026-11-26T00:00:00.000Z');
const apply = (
  book: GuildProjectsBook,
  change: ProjectInput | InternalProjectChange,
  actor: ProjectActor,
  openRequestIds?: Set<string>,
) => {
  clock += 1000;
  const result = applyProjectChange(book, change, actor, {
    now: new Date(clock).toISOString(),
    newId: randomUUID,
    openRequestIds,
  });
  expect(guildProjectsBookSchema.safeParse(result.book).success).toBe(true);
  return result.book;
};
const ids = { project: randomUUID(), steel: randomUUID(), milestone: randomUUID() };
function seeded() {
  return apply(
    emptyProjectsBook('2'),
    {
      action: 'project-save',
      revision: null,
      project: {
        id: ids.project,
        name: 'Fortress wall',
        summary: '',
        status: 'active',
        milestones: [{ id: ids.milestone, title: 'Foundations', due: '2026-11-30', responsibleKey: key(2) }],
        materials: [
          {
            id: ids.steel,
            name: 'Steel ingot',
            unit: 'ingots',
            required: '900719925474099312',
            templateId: 'SteelIngot',
            responsibleKey: key(2),
          },
        ],
      },
    },
    leader,
  );
}
const project = (book: GuildProjectsBook) => book.projects[0]!;
const target = (book: GuildProjectsBook) => ({ id: ids.project, revision: project(book).revision });

describe('guild project budgets (N051)', () => {
  it('lets only leaders create plans and keeps exact decimal requirements', () => {
    const book = seeded();
    expect(project(book).materials[0]!.required).toBe('900719925474099312');
    expect(() =>
      apply(
        book,
        { action: 'project-save', revision: null, project: { ...project(book), id: randomUUID() } } as never,
        builder,
      ),
    ).toThrow(/leader/);
    expect(projectInputSchema.safeParse({ action: 'project-delete', ...target(book), memberKey: key(2) }).success).toBe(
      false,
    );
  });
  it('lets the responsible member complete milestones and rejects stale revisions', () => {
    const book = seeded();
    const next = apply(book, { action: 'milestone', ...target(book), milestoneId: ids.milestone, done: true }, builder);
    expect(project(next).milestones[0]!.completedByName).toBe('Builder');
    expect(() =>
      apply(next, { action: 'milestone', ...target(book), milestoneId: ids.milestone, done: false }, builder),
    ).toThrow(/changed/);
    expect(() =>
      apply(next, { action: 'milestone', ...target(next), milestoneId: ids.milestone, done: false }, crafter),
    ).toThrow(/responsible/);
  });
});

describe('shared supplies (N053–N055)', () => {
  function withStock(quantity = '100') {
    const stockId = randomUUID();
    const book = apply(
      seeded(),
      {
        action: 'stock-save',
        revision: null,
        entry: {
          id: stockId,
          material: 'Steel ingot',
          unit: 'ingots',
          quantity,
          templateId: null,
          location: 'Hall',
          note: '',
        },
      },
      crafter,
    );
    return { book, stockId };
  }
  it('publishes only the owner’s chosen supplies and prevents double allocation across projects', () => {
    const { book, stockId } = withStock();
    expect(book.stockpile[0]!.ownerName).toBe('Crafter');
    expect(() =>
      apply(
        book,
        {
          action: 'reserve',
          ...target(book),
          materialId: ids.steel,
          reservationId: randomUUID(),
          stockId,
          quantity: '10',
        },
        builder,
      ),
    ).toThrow(/publisher or guild leader/);
    const reserved = apply(
      book,
      {
        action: 'reserve',
        ...target(book),
        materialId: ids.steel,
        reservationId: randomUUID(),
        stockId,
        quantity: '60',
      },
      leader,
    );
    expect(stockReserved(reserved, stockId)).toBe('60');
    expect(() =>
      apply(
        reserved,
        {
          action: 'reserve',
          ...target(reserved),
          materialId: ids.steel,
          reservationId: randomUUID(),
          stockId,
          quantity: '41',
        },
        crafter,
      ),
    ).toThrow(/already reserved/);
    expect(() =>
      apply(
        reserved,
        {
          action: 'stock-save',
          revision: reserved.stockpile[0]!.revision,
          entry: { ...reserved.stockpile[0]!, quantity: '59' } as never,
        },
        crafter,
      ),
    ).toThrow();
    const removed = apply(
      reserved,
      { action: 'stock-remove', stockId, revision: reserved.stockpile[0]!.revision },
      crafter,
    );
    expect(project(removed).reservations).toHaveLength(0);
  });
  it('lets members volunteer only themselves for procurement and bounds totals by the requirement', () => {
    const book = seeded();
    expect(() =>
      apply(
        book,
        {
          action: 'assign',
          ...target(book),
          materialId: ids.steel,
          assignmentId: randomUUID(),
          memberKey: key(3),
          quantity: '5',
        },
        builder,
      ),
    ).toThrow(/volunteer themselves/);
    const assigned = apply(
      book,
      {
        action: 'assign',
        ...target(book),
        materialId: ids.steel,
        assignmentId: randomUUID(),
        memberKey: key(2),
        quantity: '5',
      },
      builder,
    );
    expect(materialCoverage(project(assigned), ids.steel).procuring).toBe('5');
    expect(() =>
      apply(
        assigned,
        {
          action: 'assign',
          ...target(assigned),
          materialId: ids.steel,
          assignmentId: randomUUID(),
          memberKey: key(2),
          quantity: '900719925474099308',
        },
        leader,
      ),
    ).toThrow(/exceeds/);
  });
});

describe('shortage requests (N052)', () => {
  it('reserves one link per material and refuses duplicates while the request is open', () => {
    const book = seeded();
    const request = { dropoff: 'Hall', details: '', priority: 'normal' as const };
    const linked = apply(
      book,
      { action: 'request-shortage', ...target(book), materialId: ids.steel, request },
      builder,
      new Set(),
    );
    const requestId = project(linked).materials[0]!.requestId!;
    expect(requestId).toBeTruthy();
    expect(() =>
      apply(
        linked,
        { action: 'request-shortage', ...target(linked), materialId: ids.steel, request },
        leader,
        new Set(),
      ),
    ).toThrow(/already has an open resource request/);
    clock += 120_000;
    expect(() =>
      apply(
        linked,
        { action: 'request-shortage', ...target(linked), materialId: ids.steel, request },
        leader,
        new Set([requestId]),
      ),
    ).toThrow(/already has an open/);
    const relinked = apply(
      linked,
      { action: 'request-shortage', ...target(linked), materialId: ids.steel, request },
      leader,
      new Set(),
    );
    expect(project(relinked).materials[0]!.requestId).not.toBe(requestId);
  });
});

describe('reviewed contribution journal (N059)', () => {
  it('requires a different leader to accept and records every correction', () => {
    const book = seeded();
    const contributionId = randomUUID();
    const submitted = apply(
      book,
      {
        action: 'contribute',
        ...target(book),
        contribution: {
          id: contributionId,
          materialId: ids.steel,
          quantity: '12',
          summary: 'Delivered steel',
          evidence: 'Hall chest 3 screenshot',
          source: null,
        },
      },
      leader,
    );
    expect(() =>
      apply(
        submitted,
        { action: 'review', ...target(submitted), contributionId, decision: 'accepted', note: '' },
        leader,
      ),
    ).toThrow(/own contribution/);
    expect(() =>
      apply(
        submitted,
        { action: 'review', ...target(submitted), contributionId, decision: 'accepted', note: '' },
        builder,
      ),
    ).toThrow(/leader/);
    const accepted = apply(
      submitted,
      { action: 'review', ...target(submitted), contributionId, decision: 'accepted', note: 'Seen in chest' },
      second,
    );
    expect(materialCoverage(project(accepted), ids.steel).accepted).toBe('12');
    expect(() =>
      apply(
        accepted,
        {
          action: 'correct',
          ...target(accepted),
          contributionId,
          quantity: '20',
          summary: 'x',
          evidence: 'y',
          reason: 'z',
        },
        leader,
      ),
    ).toThrow(/Ask a leader/);
    const corrected = apply(
      accepted,
      {
        action: 'correct',
        ...target(accepted),
        contributionId,
        quantity: '10',
        summary: 'Delivered steel',
        evidence: 'Recount',
        reason: 'Miscounted',
      },
      second,
    );
    const entry = project(corrected).contributions[0]!;
    expect(entry.quantity).toBe('10');
    expect(entry.status).toBe('accepted');
    expect(entry.history[0]).toMatchObject({ reason: 'Miscounted', previous: { quantity: '12', status: 'accepted' } });
  });
  it('turns an accepted reservation delivery into confirmed coverage without double counting', () => {
    const stockId = randomUUID();
    const reservationId = randomUUID();
    const contributionId = randomUUID();
    let book = apply(
      seeded(),
      {
        action: 'stock-save',
        revision: null,
        entry: {
          id: stockId,
          material: 'Steel',
          unit: 'ingots',
          quantity: '50',
          templateId: null,
          location: '',
          note: '',
        },
      },
      crafter,
    );
    book = apply(
      book,
      { action: 'reserve', ...target(book), materialId: ids.steel, reservationId, stockId, quantity: '30' },
      crafter,
    );
    book = apply(
      book,
      {
        action: 'contribute',
        ...target(book),
        contribution: {
          id: contributionId,
          materialId: ids.steel,
          quantity: '30',
          summary: 'Handed over reserved steel',
          evidence: 'Trade at the hall',
          source: { kind: 'reservation', id: reservationId },
        },
      },
      crafter,
    );
    book = apply(book, { action: 'review', ...target(book), contributionId, decision: 'accepted', note: '' }, leader);
    expect(materialCoverage(project(book), ids.steel)).toMatchObject({ accepted: '30', reserved: '0' });
    expect(book.stockpile[0]!.quantity).toBe('20');
  });
});

describe('crafting commissions and receipts (N056–N058)', () => {
  it('separates the crafter’s completion claim from the requester’s receipt', () => {
    let book = apply(
      emptyProjectsBook('2'),
      {
        action: 'specialist-save',
        revision: null,
        profile: {
          availability: 'available',
          note: '',
          capabilities: [{ id: randomUUID(), category: 'weapons', items: 'Maula pistols', note: '' }],
        },
      },
      crafter,
    );
    const id = randomUUID();
    book = apply(
      book,
      {
        action: 'commission-save',
        revision: null,
        commission: {
          id,
          item: 'Maula pistol',
          quantity: '2',
          details: '',
          inputs: 'Requester supplies 40 steel',
          crafterKey: key(3),
        },
      },
      builder,
    );
    const step = (step: 'accept' | 'claim' | 'receive' | 'dispute', actor: ProjectActor, note = '') =>
      apply(
        book,
        { action: 'commission', commissionId: id, revision: book.commissions[0]!.revision, step, note },
        actor,
      );
    expect(() => step('accept', leader)).toThrow(/chosen crafter/);
    book = step('accept', crafter);
    expect(book.commissions[0]!.agreedInputs).toBe('Requester supplies 40 steel');
    expect(() => step('receive', builder)).toThrow(/not available/);
    book = step('claim', crafter, 'Left in your chest');
    expect(book.commissions[0]!.status).toBe('claimed');
    expect(() => step('receive', crafter)).toThrow(/not available/);
    book = step('dispute', builder, 'Chest is empty');
    expect(book.commissions[0]!.status).toBe('accepted');
    book = step('claim', crafter);
    book = step('receive', builder, 'Got them');
    expect(book.commissions[0]).toMatchObject({ status: 'received', receiptNote: 'Got them' });
    expect(book.commissions[0]!.events.map((event) => event.event)).toEqual([
      'requested',
      'accepted',
      'claimed',
      'disputed',
      'claimed',
      'received',
    ]);
  });
});

describe('cost summaries (N060)', () => {
  it('keeps observed estimates, manual costs and confirmed deliveries separate', () => {
    let book = seeded();
    book = apply(
      book,
      {
        action: 'set-estimate',
        ...target(book),
        materialId: ids.steel,
        estimate: {
          unitPrice: '3',
          listingCount: 1,
          stock: '10',
          partial: false,
          observedAt: '2026-11-25T00:00:00.000Z',
        },
      },
      leader,
    );
    book = apply(
      book,
      { action: 'cost-save', ...target(book), cost: { id: randomUUID(), label: 'Plans', amount: '500', note: '' } },
      leader,
    );
    const summary = projectCostSummary(project(book));
    expect(summary.observedEstimate).toBe((900719925474099312n * 3n).toString());
    expect(summary.manualCosts).toBe('500');
    expect(summary.confirmedDeliveries[0]!.quantity).toBe('0');
    expect(() =>
      apply(
        book,
        { action: 'cost-save', ...target(book), cost: { id: randomUUID(), label: 'x', amount: '1', note: '' } },
        builder,
      ),
    ).toThrow(/leader/);
    expect(projectInputSchema.safeParse({ action: 'set-estimate', ...target(book) }).success).toBe(false);
  });
  it('exposes names and keys but never reviewer keys in views', () => {
    const view = projectsView(seeded(), builder, new Map());
    expect(view.projects[0]!.materials[0]!.responsibleName).toBe('Builder');
    expect(JSON.stringify(view)).not.toContain('reviewedByKey');
  });
});
