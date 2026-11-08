import { test, expect } from '../helpers/browser-test';
import { player } from '../helpers/portal-browser';

test('guild custom applications and private live chat work across the community pages', async ({ page }) => {
  let leader = false;
  let application: Record<string, unknown> | null = null;
  const supportMessages: Record<string, unknown>[] = [
    {
      id: 'd62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      text: 'Your recruitment listing looks good.',
      senderId: 'admin',
      senderName: 'Administrator',
      role: 'reviewer',
      sentAt: Date.now(),
    },
  ];
  await page.route('**/api/guilds/2/support', (route) =>
    route.fulfill({ json: { ok: true, data: { messages: supportMessages } } }),
  );
  await page.route('**/api/guilds/2/support/send', (route) => {
    const input = route.request().postDataJSON();
    const message = {
      id: input.clientMessageId,
      text: input.text,
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'applicant',
      sentAt: Date.now(),
    };
    supportMessages.push(message);
    return route.fulfill({ json: { ok: true, data: message } });
  });
  let rejectNextAcceptance = true;
  let submissions = 0;
  await page.route('**/api/guilds/application-status?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          applications: {
            '2': application ? { id: application.id, status: application.status, unreadCount: 0 } : null,
          },
        },
      },
    }),
  );
  const listing = {
    guildId: '2',
    guildName: 'Crimson Skies',
    requirements: 'Be friendly',
    contact: '',
    published: true,
    applicationQuestions: [
      { id: '915c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'What would you contribute?', required: true },
      {
        id: '925c1a9c-13a6-4eef-833b-121c513f9a5a',
        label: 'What time zone are you in?',
        required: true,
        type: 'timezone',
      },
      {
        id: '935c1a9c-13a6-4eef-833b-121c513f9a5a',
        label: 'Preferred play style',
        required: true,
        type: 'dropdown',
        options: ['PvE', 'PvP', 'Both'],
      },
      {
        id: '945c1a9c-13a6-4eef-833b-121c513f9a5a',
        label: 'I agree to the guild rules',
        required: true,
        type: 'checkbox',
      },
      { id: '955c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'Availability', required: true, type: 'shortText' },
      { id: '965c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'Character level', required: false, type: 'number' },
    ],
  };
  await page.route('**/api/guilds?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [{ guild_id: '2', guild_name: 'Crimson Skies' }] } } }),
  );
  await page.route('**/api/guilds/2/members', (route) =>
    route.fulfill({
      json: {
        ok: true,
        canEdit: leader,
        data: { rows: [{ player_id: 'tester', character_name: 'Desert Navigator', role_id: leader ? '100' : '1' }] },
      },
    }),
  );
  await page.route('**/api/guilds/2/logo*', (route) =>
    new URL(route.request().url()).searchParams.has('image')
      ? route.fulfill({ path: 'src/assets/share/preview-v1.png', contentType: 'image/png' })
      : route.fulfill({ json: { ok: true, data: { logo: null } } }),
  );
  await page.route('**/api/guilds/requirements?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [listing], hasMore: false } } }),
  );
  await page.route('**/api/guilds/2/requirements', (route) => {
    if (route.request().method() === 'POST') Object.assign(listing, route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: listing } });
  });
  await page.route('**/api/guilds/2/application', async (route) => {
    if (route.request().method() === 'POST') {
      submissions++;
      application = {
        ...route.request().postDataJSON(),
        id: 'a'.repeat(64),
        discordId: '123456789',
        discordName: 'Survivor',
        characterName: 'Desert Navigator',
        submittedAt: Date.now(),
        status: 'pending',
        customAnswers: listing.applicationQuestions.map((question) => ({
          questionId: question.id,
          question: question.label,
          answer: route.request().postDataJSON().answers?.[question.id] ?? '',
        })),
      };
    }
    await route.fulfill({ json: { ok: true, data: application } });
  });
  await page.route('**/api/guilds/2/applications*', async (route) => {
    if (route.request().method() === 'POST') {
      const { status } = route.request().postDataJSON();
      if (status === 'accepted' && rejectNextAcceptance) {
        rejectNextAcceptance = false;
        await route.fulfill({
          status: 409,
          json: { ok: false, error: 'The guild is full. The application was not accepted.' },
        });
        return;
      }
      application = status === 'remove' ? null : { ...application, status };
      await route.fulfill({ json: { ok: true, data: application } });
    } else
      await route.fulfill({ json: { ok: true, data: { rows: application ? [application] : [], hasMore: false } } });
  });
  const messages: Record<string, unknown>[] = [];
  const sendIds: string[] = [];
  let failNextSend = true;
  await page.route(/\/api\/guilds\/2\/applications\/[a-f0-9]{64}\/messages(?:\/(?:send|read))?$/, async (route) => {
    if (route.request().url().endsWith('/read')) {
      await route.fulfill({ json: { ok: true, data: { unreadCount: 0 } } });
      return;
    }
    if (route.request().method() === 'POST') {
      const { text, clientMessageId } = route.request().postDataJSON();
      sendIds.push(clientMessageId);
      if (failNextSend) {
        failNextSend = false;
        await route.fulfill({ status: 503, json: { ok: false, error: 'Chat temporarily unavailable.' } });
        return;
      }
      const message = {
        id: clientMessageId,
        text,
        senderId: leader ? 'leader' : 'applicant',
        senderName: leader ? 'Guild Leader' : 'Survivor',
        role: leader ? 'reviewer' : 'applicant',
        sentAt: Date.now(),
      };
      messages.push(message);
      await route.fulfill({ json: { ok: true, data: message } });
    } else await route.fulfill({ json: { ok: true, data: { messages } } });
  });
  await page.goto('/portal?view=guild-requirements');
  const logo = page.getByRole('img', { name: 'Crimson Skies logo', exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveJSProperty('naturalWidth', 1200);
  await page.getByRole('button', { name: 'Apply to guild', exact: true }).click();
  const form = page.getByRole('region', { name: 'Application to Crimson Skies', exact: true });
  await expect(form.getByRole('textbox', { name: 'Experience', exact: true })).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Why would you like to join?', exact: true })).toHaveCount(0);
  const timezone = form.getByRole('combobox', { name: 'What time zone are you in? (required)', exact: true });
  expect(await timezone.locator('option').count()).toBeGreaterThan(400);
  await timezone.selectOption('America/New_York');
  await form.getByRole('combobox', { name: 'Preferred play style (required)', exact: true }).selectOption('Both');
  await form.getByRole('checkbox', { name: 'I agree to the guild rules (required)', exact: true }).check();
  await form.getByRole('textbox', { name: 'Availability (required)', exact: true }).fill('Weekday evenings');
  await form.getByRole('textbox', { name: 'Character level (optional)', exact: true }).fill('0');
  await form.getByRole('button', { name: 'Submit application' }).click();
  expect(submissions).toBe(0);
  await form
    .getByRole('textbox', { name: 'What would you contribute? (required)', exact: true })
    .fill('I can build guild facilities.');
  await form.getByRole('button', { name: 'Submit application' }).click();
  await expect(form.getByText('Your application is pending.', { exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Submit application' })).toHaveCount(0);
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Chat with reviewer', exact: true }).click();
  const applicantChat = page.getByRole('region', { name: 'Chat with guild reviewer', exact: true });
  await expect(applicantChat.getByText('Live · private conversation', { exact: true })).toBeVisible();
  await applicantChat.getByRole('textbox', { name: 'Message', exact: true }).fill('When can we meet in game?');
  await applicantChat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(applicantChat.getByRole('alert')).toContainText('Chat temporarily unavailable.');
  await expect(applicantChat.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'When can we meet in game?',
  );
  await applicantChat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(applicantChat.getByRole('log')).toContainText('When can we meet in game?');
  expect(sendIds[0]).toBe(sendIds[1]);
  messages.push({
    id: 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab',
    text: 'We can meet this evening.',
    senderId: 'leader',
    senderName: 'Guild Leader',
    role: 'reviewer',
    sentAt: Date.now(),
  });
  await expect(applicantChat.getByRole('log')).toContainText('We can meet this evening.', { timeout: 7000 });
  leader = true;
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'My Guild', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Guild tabs' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Chat with administrators', exact: true }).click();
  const leaderSupport = page.getByRole('region', { name: 'Chat with administrators', exact: true });
  await expect(leaderSupport.getByRole('log')).toContainText('Your recruitment listing looks good.');
  await leaderSupport.getByRole('textbox', { name: 'Message', exact: true }).fill('Thanks for checking.');
  await leaderSupport.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(leaderSupport.getByRole('log')).toContainText('Thanks for checking.');
  const inbox = page.getByRole('region', { name: 'Guild applications', exact: true });
  await expect(inbox.getByRole('heading', { name: 'Desert Navigator', exact: true })).toBeVisible();
  await expect(inbox.getByText('America/New_York', { exact: true })).toBeVisible();
  await expect(inbox.getByText('Yes', { exact: true })).toBeVisible();
  await expect(inbox.getByText('I can build guild facilities.', { exact: true })).toBeVisible();
  const questionEditor = page.getByRole('group', { name: 'Application questions', exact: true });
  await questionEditor
    .getByRole('textbox', { name: 'Question text', exact: true })
    .first()
    .fill('Updated question for new applicants');
  await questionEditor.getByRole('button', { name: 'Add application question', exact: true }).click();
  const secondQuestion = questionEditor.getByRole('group', { name: 'Question 7', exact: true });
  await secondQuestion
    .getByRole('textbox', { name: 'Question text', exact: true })
    .fill('What is your preferred role?');
  await secondQuestion.getByRole('combobox', { name: 'Question type', exact: true }).selectOption('timezone');
  await secondQuestion.getByRole('checkbox', { name: 'Required answer', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save guild settings', exact: true }).click();
  await expect(page.getByText('Guild requirements published.', { exact: true })).toBeVisible();
  await expect(inbox.getByText('What would you contribute?', { exact: true })).toBeVisible();
  await inbox.getByRole('button', { name: 'Chat with applicant', exact: true }).click();
  const reviewerChat = page.getByRole('region', { name: 'Chat with Desert Navigator', exact: true });
  await expect(reviewerChat.getByRole('log')).toContainText('When can we meet in game?');
  await reviewerChat.getByRole('textbox', { name: 'Message', exact: true }).fill('Please meet us at the guild base.');
  await reviewerChat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(reviewerChat.getByRole('log')).toContainText('Please meet us at the guild base.');
  await inbox.getByRole('button', { name: 'Accept application', exact: true }).click();
  await expect(inbox.getByRole('alert')).toContainText('The guild is full. The application was not accepted.');
  expect(application?.status).toBe('pending');
  await inbox.getByRole('button', { name: 'Refresh applications', exact: true }).click();
  await inbox.getByRole('button', { name: 'Accept application', exact: true }).click();
  await expect(
    inbox.getByText('Application accepted. Applicant added to the guild as a Member.', { exact: true }),
  ).toBeVisible();
  await expect(inbox.getByRole('button', { name: 'Accept application', exact: true })).toBeDisabled();
  await expect(reviewerChat.getByRole('log')).toContainText('Please meet us at the guild base.');
  await expect(inbox.getByRole('button', { name: 'Decline application', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/guild-application-inbox-mobile.png', fullPage: true });
  await inbox.getByRole('button', { name: 'Remove application', exact: true }).click();
  await expect(inbox.getByText('No applications on this page.', { exact: true })).toBeVisible();
  await expect(reviewerChat).toHaveCount(0);
});

test('guild directory cards stay tidy and expand details and applications across desktop and mobile', async ({
  page,
}) => {
  const requirements = 'A friendly guild for builders, explorers, and spice runners. '.repeat(9);
  const entries = [
    {
      guildId: '2',
      guildName: 'Crimson Skies',
      requirements,
      contact: 'Ask the leader about our weekend runs.',
      published: true,
      applicationQuestions: [
        { id: '915c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'Introduce yourself', type: 'longText', required: true },
      ],
    },
    {
      guildId: '3',
      guildName: 'Sietch Vanguard',
      requirements: 'Teamwork and exploration, open to every experience level.',
      contact: '',
      published: true,
    },
    {
      guildId: '4',
      guildName: 'TheVeryLongGuildNameThatShouldNeverBreakTheCardOrPushButtonsOffTheScreen',
      requirements: 'Long names fit without horizontal scrolling.',
      contact: '',
      published: true,
    },
  ];
  await page.route('**/api/guilds/requirements?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: entries, hasMore: false } } }),
  );
  await page.route('**/api/guilds/*/logo?image=1', (route) =>
    route.request().url().includes('/2/')
      ? route.fulfill({ path: 'src/assets/share/mark-v1.png', contentType: 'image/png' })
      : route.fulfill({ status: 204 }),
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/portal?view=guild-requirements');
  const card = page.getByRole('article', { name: 'Crimson Skies', exact: true });
  await expect(card.getByText('Recruiting', { exact: true })).toBeVisible();
  await expect(page.getByText('3 guilds on this page', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/guild-cards-desktop.png', fullPage: true });
  await card.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(card.getByText(entries[0].contact, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Less detail', exact: true }).click();
  await card.getByRole('button', { name: 'Apply to guild', exact: true }).click();
  await expect(card.getByRole('textbox', { name: 'Introduce yourself (required)', exact: true })).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.width).toBeGreaterThan(1000);
  await card.getByRole('button', { name: 'Close application', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/guild-cards-mobile.png', fullPage: true });
});

test('guild requirements opens as its own community page', async ({ page }) => {
  let membershipRequests = 0;
  await page.route('**/api/guilds?*', (route) => {
    membershipRequests++;
    return route.fulfill({ json: { ok: true, data: { rows: [] } } });
  });
  await page.route('**/api/guilds/requirements?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [], hasMore: false } } }),
  );
  await page.goto('/portal?view=guild-requirements');
  await expect(page.getByRole('heading', { name: 'Guilds', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText('No guilds are recruiting here yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Guild tabs' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save guild settings' })).toHaveCount(0);
  expect(membershipRequests).toBe(0);
});

test('guild view renders reported membership without inventing a rank', async ({ page }) => {
  await page.goto('/portal?view=guild');
  await expect(page.getByRole('heading', { name: 'Guild membership', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crimson Skies', exact: true })).toBeVisible();
  await expect(page.getByText('Your rank: Not reported')).toBeVisible();
});

for (const { leader, verified } of [
  { leader: true, verified: true },
  { leader: false, verified: false },
  { leader: true, verified: false },
]) {
  test(`guild recruitment board supports ${verified ? 'leader settings' : leader ? 'unverified leadership' : 'read-only members'}`, async ({
    page,
  }) => {
    await page.route('**/api/guilds?*', (route) =>
      route.fulfill({ json: { ok: true, data: { rows: [{ guild_id: '2', guild_name: 'Crimson Skies' }] } } }),
    );
    await page.route('**/api/guilds/2/logo', (route) => route.fulfill({ json: { ok: true, data: { logo: null } } }));
    await page.route('**/api/guilds/2/members', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: { rows: [{ player_id: 'tester', character_name: 'Desert Navigator', role_id: leader ? '100' : '1' }] },
          canEdit: verified,
        },
      }),
    );
    let listing = {
      guildName: 'Crimson Skies',
      requirements: 'Active players welcome',
      contact: 'Ask in Discord',
      published: false,
    };
    await page.route('**/api/guilds/2/requirements', async (route) => {
      if (route.request().method() === 'POST') listing = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, data: listing } });
    });
    await page.route('**/api/guilds/requirements?*', (route) =>
      route.fulfill({
        json: { ok: true, data: { rows: listing.published ? [{ ...listing, guildId: '2' }] : [], hasMore: false } },
      }),
    );
    await page.goto('/portal?view=guild');
    await expect(page.getByText(`Your rank: ${leader ? 'Leader' : 'Member'}`, { exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Guild tabs' });
    if (verified) {
      await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Joining requirements', exact: true })
        .fill('Friendly active players, all levels welcome.');
      await page.getByLabel('List my guild for recruitment').check();
      await page.getByRole('button', { name: 'Save guild settings' }).click();
      await expect(page.getByText('Guild requirements published.', { exact: true })).toBeVisible();
    } else {
      await expect(tabs.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
      listing.published = true;
    }
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Guilds', exact: true })
      .click();
    await expect(page.getByRole('navigation', { name: 'Guild tabs' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Crimson Skies', exact: true })).toBeVisible();
    await expect(page.getByText(listing.requirements, { exact: true })).toBeVisible();
    if (!verified) {
      await page.getByRole('button', { name: 'Apply to guild', exact: true }).click();
      await expect(
        page.getByText('This guild has not set up application questions yet.', { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (verified) {
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'My Guild', exact: true })
        .click();
      await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('List my guild for recruitment').uncheck();
      await page.getByRole('button', { name: 'Save guild settings' }).click();
      await expect(page.getByText('Settings saved. Your guild is not listed.', { exact: true })).toBeVisible();
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Guilds', exact: true })
        .click();
      await expect(page.getByRole('navigation', { name: 'Guild tabs' })).toHaveCount(0);
      await expect(page.getByText('No guilds are recruiting here yet.', { exact: false })).toBeVisible();
    }
  });
}

test('guild cards keep status separate from unread reviewer chat across reloads', async ({ page }) => {
  const id = 'a'.repeat(64);
  const application = { id, status: 'pending', customAnswers: [] };
  const messages = [
    {
      id: 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'reviewer',
      text: 'Welcome! When can we meet?',
      sentAt: Date.now(),
    },
    {
      id: 'b62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'reviewer',
      text: 'We have space for you.',
      sentAt: Date.now(),
    },
  ];
  const seen = new Set<string>();
  let receiptCalls = 0;
  const unread = () => messages.filter((message) => !seen.has(message.id)).length;
  await page.route('**/api/guilds/requirements?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          rows: [{ guildId: '2', guildName: 'Crimson Skies', requirements: 'Be friendly', published: true }],
          hasMore: false,
        },
      },
    }),
  );
  await page.route('**/api/guilds/application-status?*', (route) =>
    route.fulfill({ json: { ok: true, data: { applications: { '2': { ...application, unreadCount: unread() } } } } }),
  );
  await page.route('**/api/guilds/2/application', (route) => route.fulfill({ json: { ok: true, data: application } }));
  await page.route('**/api/guilds/2/logo?image=1', (route) => route.fulfill({ status: 204 }));
  await page.route(/\/api\/guilds\/2\/applications\/[a-f0-9]{64}\/messages(?:\/read)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      receiptCalls++;
      for (const message of route.request().postDataJSON().messages) seen.add(message.id);
      // A reply arriving during acknowledgement must remain unread.
      if (receiptCalls === 1)
        messages.push({ ...messages[0], id: 'c62f594e-7a04-47d7-b3f9-94f9abf8aaab', text: 'One more question.' });
      await route.fulfill({ json: { ok: true, data: { unreadCount: unread() } } });
    } else await route.fulfill({ json: { ok: true, data: { messages } } });
  });
  await page.goto('/portal?view=guild-requirements');
  const card = page.getByRole('article', { name: 'Crimson Skies', exact: true });
  await expect(card.getByRole('button', { name: 'Apply to guild', exact: true })).toHaveCount(0);
  await expect(card.getByLabel('2 unread messages')).toBeVisible();
  await card.getByRole('button', { name: 'Check status', exact: true }).click();
  await expect(card.getByText('Your application is pending.', { exact: true })).toBeVisible();
  expect(receiptCalls).toBe(0);
  await expect(card.getByLabel('2 unread messages')).toBeVisible();
  await page.reload();
  await expect(card.getByLabel('2 unread messages')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await card.screenshot({ path: 'test-results/guild-application-actions-mobile.png' });
  await card.getByRole('button', { name: /Chat with reviewer/ }).click();
  await expect(card.getByRole('log')).toContainText('Welcome! When can we meet?');
  await expect.poll(() => receiptCalls).toBeGreaterThan(0);
  await expect(card.getByRole('log')).toContainText('One more question.');
  await expect.poll(unread).toBe(0);
  await expect(card.getByLabel(/unread messages/)).toHaveCount(0);
  await page.reload();
  await expect(card.getByRole('button', { name: 'Chat with reviewer', exact: true })).toBeVisible();
  await expect(card.getByLabel(/unread messages/)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('My Guild keeps unread admin support messages until the leader views chat', async ({ page }) => {
  const messages = [
    {
      id: 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'admin',
      senderName: 'Administrator',
      role: 'reviewer',
      text: 'Please check your listing.',
      sentAt: Date.now(),
    },
    {
      id: 'b62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'admin',
      senderName: 'Administrator',
      role: 'reviewer',
      text: 'We can help with recruitment.',
      sentAt: Date.now(),
    },
    {
      id: 'c62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'applicant',
      text: 'My earlier reply.',
      sentAt: Date.now(),
    },
  ];
  const seen = new Set<string>();
  let receipts = 0;
  const unread = () => messages.filter((message) => message.role === 'reviewer' && !seen.has(message.id)).length;
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: { ...player, details: { ...player.details, guild: { id: '2', name: 'Crimson Skies', rank: 100 } } },
    }),
  );
  await page.route('**/api/guilds?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [{ guild_id: '2', guild_name: 'Crimson Skies' }] } } }),
  );
  await page.route('**/api/guilds/2/members', (route) =>
    route.fulfill({
      json: {
        ok: true,
        canEdit: true,
        data: { rows: [{ player_id: 'tester', character_name: 'Desert Navigator', role_id: '100' }] },
      },
    }),
  );
  await page.route('**/api/guilds/2/logo', (route) => route.fulfill({ json: { ok: true, data: { logo: null } } }));
  await page.route('**/api/guilds/2/requirements', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { guildName: 'Crimson Skies', requirements: 'Be friendly', contact: '', published: true },
      },
    }),
  );
  await page.route('**/api/guilds/2/support/status', (route) =>
    route.fulfill({ json: { ok: true, data: { unreadCount: unread() } } }),
  );
  await page.route('**/api/guilds/2/support', (route) => route.fulfill({ json: { ok: true, data: { messages } } }));
  await page.route('**/api/guilds/2/support/read', (route) => {
    const batch = route.request().postDataJSON().messages;
    expect(batch.some((message: { senderId: string }) => message.senderId === 'leader')).toBe(false);
    batch.forEach((message: { id: string }) => seen.add(message.id));
    receipts++;
    if (receipts === 1)
      messages.push({
        ...messages[0],
        id: 'd62f594e-7a04-47d7-b3f9-94f9abf8aaab',
        text: 'A new message during acknowledgement.',
      });
    return route.fulfill({ json: { ok: true, data: { unreadCount: unread() } } });
  });
  await page.goto('/portal');
  const nav = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'My Guild', exact: true });
  await expect(nav.locator('[data-unread-count="2"]')).toBeVisible();
  await page.reload();
  await expect(nav.locator('[data-unread-count="2"]')).toBeVisible();
  await nav.click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chat with administrators', exact: true })).toBeVisible();
  expect(receipts).toBe(0);
  await expect(nav.locator('[data-unread-count="2"]')).toBeVisible();
  await page.getByRole('button', { name: 'Chat with administrators', exact: true }).click();
  await expect(nav.locator('[data-unread-count="1"]')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Chat with administrators', exact: true }).getByRole('log'),
  ).toContainText('A new message during acknowledgement.');
  await expect.poll(unread).toBe(0);
  await expect(nav.locator('[data-unread-count]')).toHaveCount(0);
  await page.reload();
  await expect(nav).toBeVisible();
  await expect(nav.locator('[data-unread-count]')).toHaveCount(0);
});
