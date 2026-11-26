import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  emptyTasks,
  taskDraftSchema,
  taskInputSchema,
  taskRecordSchema,
  taskTargetHref,
  taskSeed,
  taskDraftHref,
} from '../../../src/features/tasks/model';
const draft = () => ({
  id: randomUUID(),
  kind: 'task' as const,
  title: 'Prepare supplies',
  notes: '',
  priority: 'normal' as const,
  dueDate: null,
  target: { type: 'none' as const },
});
it('validates calendar dates and bounded drafts while rejecting caller timestamps, owners and URLs', () => {
  const task = draft();
  expect(taskDraftSchema.safeParse(task).success).toBe(true);
  for (const value of [
    { ...task, dueDate: '2026-02-30' },
    { ...task, title: ' ' },
    { ...task, notes: 'x'.repeat(1501) },
    { ...task, createdAt: new Date().toISOString() },
    { ...task, target: { type: 'vehicle', ref: '../foreign', label: 'Bad', view: 'owned' } },
    { ...task, target: { type: 'url', href: 'https://foreign.test' } },
  ])
    expect(taskDraftSchema.safeParse(value).success).toBe(false);
  expect(taskInputSchema.safeParse({ action: 'save', revision: null, task, owner: 'foreign' }).success).toBe(false);
});
it('requires private planning references to exist with the correct kind and prohibits planning cycles', () => {
  const project = {
    ...draft(),
    kind: 'project' as const,
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
  const task = { ...project, ...draft(), target: { type: 'project' as const, ref: project.id } };
  expect(taskRecordSchema.safeParse({ ...emptyTasks(), revision: randomUUID(), tasks: [project, task] }).success).toBe(
    true,
  );
  expect(taskRecordSchema.safeParse({ ...emptyTasks(), tasks: [task] }).success).toBe(false);
  expect(taskDraftSchema.safeParse({ ...project, target: { type: 'project', ref: project.id } }).success).toBe(false);
  expect(taskRecordSchema.safeParse({ ...emptyTasks(), tasks: [project, project] }).success).toBe(false);
});
it('constructs allowlisted internal links and validates untrusted context seeds without saving them', () => {
  expect(taskTargetHref({ type: 'item', ref: 'javascript:evil&owner=foreign', label: 'Spice' })).toBe(
    '/storage?find=javascript%3Aevil%26owner%3Dforeign',
  );
  expect(taskTargetHref({ type: 'vehicle', ref: 'rover', label: 'Rover', view: 'shared' })).toBe(
    '/vehicles?view=shared#vehicle-rover',
  );
  const id = randomUUID();
  expect(taskTargetHref({ type: 'goal', ref: id })).toBe(`/tasks?focus=${id}#task-${id}`);
  expect(taskSeed({ target: 'base', ref: 'one', label: 'Base', view: 'owned' })).toEqual({
    type: 'base',
    ref: 'one',
    label: 'Base',
    view: 'owned',
  });
  expect(taskSeed({ target: 'base', ref: ['one', 'two'], label: 'Base', view: 'owned' })).toBeNull();
  expect(taskSeed({ target: 'project', ref: id })).toBeNull();
  expect(taskDraftHref({ type: 'base', ref: 'one', label: 'Base', view: 'owned' })).toContain('/tasks?target=base');
});
