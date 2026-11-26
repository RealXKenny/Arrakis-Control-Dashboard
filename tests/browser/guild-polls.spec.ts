import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('guild members change and withdraw private votes while leaders publish, close and remove polls', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Poll Leader', { guild: { id: '2', role: 100 } });
  const member = await fakeConsole.newMember('Poll Voter', { guild: { id: '2', role: 1 } });
  const other = await fakeConsole.newMember('Another Voter', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Polls', exact: true })
    .click();
  const polls = page.getByRole('region', { name: 'Private guild polls', exact: true });
  await polls.getByRole('button', { name: 'New guild poll', exact: true }).click();
  await polls.getByRole('textbox', { name: 'Poll question', exact: true }).fill('Next guild project?');
  await polls.getByRole('textbox', { name: 'Poll details', exact: true }).fill('Choose the next shared objective.');
  await polls.getByRole('textbox', { name: 'Poll choice 1', exact: true }).fill('Workshop');
  await polls.getByRole('textbox', { name: 'Poll choice 2', exact: true }).fill('Storage');
  await polls.getByRole('button', { name: 'Publish poll', exact: true }).click();
  const poll = polls.getByRole('article', { name: 'Next guild project?', exact: true });
  await expect(poll).toBeVisible();
  await expect(poll.getByText('0 votes cast', { exact: true })).toBeVisible();
  await expect(poll.getByText('Scheduled close:', { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  for (const width of [1280, 1024, 768, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await page
        .getByRole('navigation', { name: 'Guild sections' })
        .getByRole('link')
        .evaluateAll((links) =>
          links
            .filter((link) => link.scrollWidth > link.clientWidth)
            .map((link) => ({ text: link.textContent, width: link.clientWidth, contentWidth: link.scrollWidth })),
        ),
    ).toEqual([]);
  }
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild?tab=polls');
  await expect(polls.getByRole('button', { name: 'New guild poll', exact: true })).toHaveCount(0);
  await expect(poll.getByRole('button', { name: 'Close poll early', exact: true })).toHaveCount(0);
  await poll.getByRole('button', { name: 'Vote: Workshop', exact: true }).click();
  await expect(poll.getByRole('button', { name: 'Vote: Workshop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await poll.getByRole('button', { name: 'Vote: Storage', exact: true }).click();
  await expect(poll.getByText('1 vote cast', { exact: true })).toBeVisible();
  await poll.getByRole('button', { name: 'Withdraw my vote', exact: true }).click();
  await expect(poll.getByText('0 votes cast', { exact: true })).toBeVisible();
  await poll.getByRole('button', { name: 'Vote: Workshop', exact: true }).click();
  await context.setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.goto('/guild?tab=polls');
  await poll.getByRole('button', { name: 'Vote: Storage', exact: true }).click();
  await expect(poll.getByText('2 votes cast', { exact: true })).toBeVisible();
  await expect(poll.getByText('1 vote · 50% · Your vote', { exact: true })).toBeVisible();
  const data = await (await page.request.get('/api/v2/guilds/2/polls')).json();
  const record = data.data.polls.find((value) => value.question === 'Next guild project?');
  expect(JSON.stringify(data)).not.toMatch(/memberId|"votes"|Poll Voter|Another Voter/);
  const denied = await page.evaluate(
    async (input) =>
      (
        await fetch('/api/v2/guilds/2/polls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    { action: 'close', id: record.id, revision: record.revision },
  );
  expect(denied).toBe(403);
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild?tab=polls');
  await expect(poll.getByRole('button', { name: 'Vote: Workshop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(poll.getByText('2 votes cast', { exact: true })).toBeVisible();
  await poll.screenshot({ path: test.info().outputPath('guild-poll-phone.png') });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=polls');
  await poll.getByRole('button', { name: 'Close poll early', exact: true }).click();
  await polls.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(polls.getByRole('button', { name: 'Closed polls', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(poll.getByText('2 votes cast', { exact: true })).toBeVisible();
  await expect(poll.getByRole('button', { name: /^Vote:/ })).toHaveCount(0);
  await poll.getByRole('button', { name: 'Remove poll', exact: true }).click();
  await polls.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(poll).toHaveCount(0);
});

test('poll drafts survive conflicts and failed verification, and elapsed deadlines hide voting controls', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Poll Draft Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/guild?tab=polls');
  const polls = page.getByRole('region', { name: 'Private guild polls', exact: true });
  await expect(page.getByRole('navigation', { name: 'Guild sections' })).toHaveCSS(
    'grid-template-columns',
    /^\d+(\.\d+)?px \d+(\.\d+)?px$/,
  );
  await polls.getByRole('button', { name: 'New guild poll', exact: true }).click();
  await polls.getByRole('textbox', { name: 'Poll question', exact: true }).fill('x'.repeat(200));
  await polls.getByRole('textbox', { name: 'Poll choice 1', exact: true }).fill('a'.repeat(100));
  await polls.getByRole('textbox', { name: 'Poll choice 2', exact: true }).fill('Another option');
  let sends = 0;
  await page.route('**/api/v2/guilds/2/polls', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sends++;
    return route.fulfill({ status: 409, json: { ok: false, error: 'Poll changed. Your draft is kept.' } });
  });
  await polls.getByRole('button', { name: 'Publish poll', exact: true }).click();
  await expect(polls.getByRole('alert')).toContainText('Your draft is kept');
  expect(sends).toBe(1);
  await page.unroute('**/api/v2/guilds/2/polls');
  await page.route('**/api/v2/guilds/2/polls', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'Verification is unavailable.' } }),
  );
  await polls.getByRole('button', { name: 'Refresh polls', exact: true }).click();
  await expect(polls.getByRole('alert')).toContainText('Verification is unavailable');
  await expect(polls.getByRole('textbox', { name: 'Poll question', exact: true })).toBeHidden();
  await page.unroute('**/api/v2/guilds/2/polls');
  await polls.getByRole('button', { name: 'Refresh polls', exact: true }).click();
  await expect(polls.getByRole('textbox', { name: 'Poll question', exact: true })).toHaveValue('x'.repeat(200));
  await polls.getByRole('button', { name: 'Publish poll', exact: true }).click();
  const poll = polls.getByRole('article', { name: 'x'.repeat(200), exact: true });
  await expect(poll).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.clock.install();
  await page.clock.fastForward(2 * 86_400_000);
  await expect(poll).toHaveCount(0);
  await polls.getByRole('button', { name: 'Closed polls', exact: true }).click();
  await expect(poll).toBeVisible();
  await expect(poll.getByRole('button', { name: /^Vote:/ })).toHaveCount(0);
  await poll.getByRole('button', { name: 'Remove poll', exact: true }).click();
  await polls.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(poll).toHaveCount(0);
});
