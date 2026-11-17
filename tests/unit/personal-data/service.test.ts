import { beforeEach, expect, it, vi } from 'vitest';
import { emptyTasks } from '../../../src/features/tasks/model';
import { emptyPrivacy } from '../../../src/features/privacy/model';
import { emptyActivities } from '../../../src/features/activity-views/model';
vi.mock('../../../src/features/activity-views/server/store', () => ({
  readActivityViews: vi.fn(async () => emptyActivities()),
  eraseActivityViews: vi.fn(async () => emptyActivities()),
}));
const state = vi.hoisted(() => ({ tasks: vi.fn(), sharing: vi.fn(), eraseTasks: vi.fn(), eraseSharing: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/tasks/server/store', () => ({
  readPersonalTasks: state.tasks,
  erasePersonalTasks: state.eraseTasks,
}));
vi.mock('../../../src/features/privacy/server/store', () => ({
  readPrivacy: state.sharing,
  erasePrivacy: state.eraseSharing,
}));
import {
  exportPersonalData,
  summarizePersonalData,
  erasePersonalData,
} from '../../../src/features/personal-data/server/service';
beforeEach(() => {
  vi.clearAllMocks();
  state.tasks.mockResolvedValue(emptyTasks());
  state.sharing.mockResolvedValue(emptyPrivacy());
  state.eraseTasks.mockResolvedValue(emptyTasks());
  state.eraseSharing.mockResolvedValue(emptyPrivacy());
});
it('exports explicit stored-data projections without routing identifiers, raw keys or game snapshots', async () => {
  const privacy = { ...emptyPrivacy(), shareId: 'a'.repeat(64) };
  privacy.drafts.profile.about = 'Private chosen note';
  state.sharing.mockResolvedValue(privacy);
  const data = await exportPersonalData('self', [{ scope: 'sharing', revision: null }]);
  expect(data.records).toHaveLength(1);
  expect(JSON.stringify(data)).toContain('Private chosen note');
  expect(JSON.stringify(data)).not.toMatch(/shareId|arrakis:|session|inventory|controller/);
  expect(state.tasks).not.toHaveBeenCalled();
  expect(state.sharing).toHaveBeenCalledWith('self');
});
it('refuses stale exports and propagates unavailable storage without returning a partial file', async () => {
  state.tasks.mockResolvedValue({ ...emptyTasks(), revision: '10a92e9c-767d-4191-aec2-c1c288c6823b' });
  await expect(exportPersonalData('self', [{ scope: 'tasks', revision: null }])).rejects.toMatchObject({
    statusCode: 409,
  });
  state.sharing.mockRejectedValue(new Error('Unavailable'));
  await expect(summarizePersonalData('self')).rejects.toThrow();
});
it('deletes exactly one chosen scope without touching the other source', async () => {
  expect(await erasePersonalData('self', 'tasks', null)).toMatchObject({ scope: 'tasks', entries: 0 });
  expect(state.eraseTasks).toHaveBeenCalledWith('self', null);
  expect(state.eraseSharing).not.toHaveBeenCalled();
  expect(await erasePersonalData('self', 'sharing', null)).toMatchObject({
    scope: 'sharing',
    entries: 0,
    snapshots: 0,
  });
});
