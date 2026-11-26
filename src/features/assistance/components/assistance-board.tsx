'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import {
  helpCategories,
  helpRequestViewSchema,
  helpVolunteerViewSchema,
  type HelpRequestView,
  type HelpVolunteerView,
} from '../model';

const messageSchema = z
  .object({
    id: z.uuid(),
    authorName: z.string().min(1).max(100),
    body: z.string().min(1).max(1000),
    sentAt: z.iso.datetime(),
    isOwn: z.boolean(),
  })
  .strict();
type Message = z.infer<typeof messageSchema>;

export function AssistanceBoard({
  initialRequests,
  initialVolunteer,
}: {
  initialRequests: HelpRequestView[];
  initialVolunteer: HelpVolunteerView;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [volunteer, setVolunteer] = useState(initialVolunteer);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatText, setChatText] = useState('');
  function update(record: HelpRequestView) {
    setRequests((current) => [record, ...current.filter((item) => item.id !== record.id)]);
  }
  async function call(url: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw: unknown = await response.json();
    if (!response.ok) {
      const error = (raw as { error?: unknown })?.error;
      throw new Error(typeof error === 'string' ? error : 'The assistance action failed.');
    }
    return raw as { request?: unknown; volunteer?: unknown; message?: unknown };
  }
  async function action(record: HelpRequestView, body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const raw = await call(`/api/v2/assistance/${record.id}`, body);
      const next = helpRequestViewSchema.parse(raw.request);
      update(next);
      if (raw.volunteer) setVolunteer(helpVolunteerViewSchema.parse(raw.volunteer));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The assistance action failed.');
    } finally {
      setBusy(false);
    }
  }
  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const raw = await call('/api/v2/assistance/volunteer', {
        available: data.get('available') === 'on',
        categories: helpCategories.filter((category) => data.get(`category-${category}`) === 'on'),
        note: data.get('note'),
        revision: volunteer.revision,
      });
      setVolunteer(helpVolunteerViewSchema.parse(raw.volunteer));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Availability could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const raw = await call('/api/v2/assistance', {
        title: data.get('title'),
        category: data.get('category'),
        details: data.get('details'),
      });
      update(helpRequestViewSchema.parse(raw.request));
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The help request could not be created.');
    } finally {
      setBusy(false);
    }
  }
  async function loadMessages(record: HelpRequestView, markRead: boolean) {
    const response = await fetch(`/api/v2/assistance/${record.id}/messages`, { cache: 'no-store' });
    const raw: unknown = await response.json();
    if (!response.ok) throw new Error('Private assistance messages are unavailable.');
    setMessages(z.array(messageSchema).parse((raw as { messages?: unknown }).messages));
    if (markRead) await action(record, { action: 'read', revision: record.revision });
  }
  async function openChat(record: HelpRequestView) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setChatId(record.id);
    try {
      await loadMessages(record, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private chat could not be opened.');
    } finally {
      setBusy(false);
    }
  }
  async function sendMessage(event: FormEvent<HTMLFormElement>, record: HelpRequestView) {
    event.preventDefault();
    if (busy || !chatText.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const raw = await call(`/api/v2/assistance/${record.id}/messages`, { body: chatText });
      setMessages((current) => [...current, messageSchema.parse(raw.message)]);
      setChatText('');
      await action(record, { action: 'read', revision: record.revision });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The message could not be sent.');
    } finally {
      setBusy(false);
    }
  }
  const chat = requests.find((record) => record.id === chatId) ?? null;
  return (
    <>
      {message && (
        <p role="alert" className="mb-5 text-sm text-status-danger">
          {message}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card as="section" className="panel p-5" aria-label="Volunteer availability">
          <h2 className="text-lg">Volunteer availability</h2>
          <p className="mt-2 text-sm text-sand-400">
            One active assignment per volunteer. Availability never grants game access.
          </p>
          <form className="mt-4 space-y-3" onSubmit={saveAvailability}>
            <label className="flex items-center gap-2 text-sm">
              <input name="available" type="checkbox" defaultChecked={volunteer.available} /> Available to help
            </label>
            <fieldset>
              <legend className="text-sm">Help categories</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {helpCategories.map((category) => (
                  <label key={category} className="flex items-center gap-2 text-sm capitalize">
                    <input
                      name={`category-${category}`}
                      type="checkbox"
                      defaultChecked={volunteer.categories.includes(category)}
                    />
                    {category.replaceAll('-', ' ')}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              Availability note
              <textarea
                name="note"
                maxLength={500}
                defaultValue={volunteer.note}
                className="mt-1 w-full bg-obsidian-900 p-3"
              />
            </label>
            <Button type="submit" className="btn btn-secondary min-h-11" disabled={busy}>
              Save availability
            </Button>
          </form>
        </Card>
        <Card as="section" className="panel p-5" aria-label="New help request">
          <h2 className="text-lg">Request help</h2>
          <p className="mt-2 text-sm text-sand-400">
            Keep at most three active requests. Do not include credentials or private locations.
          </p>
          <form className="mt-4 space-y-3" onSubmit={create}>
            <label className="block text-sm">
              Title
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                className="mt-1 min-h-11 w-full bg-obsidian-900 px-3"
              />
            </label>
            <label className="block text-sm">
              Category
              <select name="category" className="mt-1 min-h-11 w-full bg-obsidian-900 px-3">
                {helpCategories.map((category) => (
                  <option key={category} value={category}>
                    {category.replaceAll('-', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              What do you need help with?
              <textarea
                name="details"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                className="mt-1 w-full bg-obsidian-900 p-3"
              />
            </label>
            <Button type="submit" className="btn btn-primary min-h-11" disabled={busy}>
              Publish help request
            </Button>
          </form>
        </Card>
      </div>
      <section aria-label="Help requests" className="mt-8">
        <h2 className="text-xl">Help requests</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {requests.map((record) => (
            <Card key={record.id} className="panel p-5" aria-label={record.title}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg">{record.title}</h3>
                <span className="border border-sand-200/20 px-2 py-1 text-xs">{record.status}</span>
              </div>
              <p className="mt-2 text-xs capitalize text-spice-300">{record.category.replaceAll('-', ' ')}</p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{record.details}</p>
              <p className="mt-3 text-xs text-sand-400">
                Requested by {record.requesterName}; updated <LocalTime value={record.updatedAt} />.
              </p>
              {record.volunteerName && <p className="mt-2 text-sm">Volunteer: {record.volunteerName}</p>}
              {record.abuseReported && <p className="mt-2 text-xs text-sand-500">An abuse report has been recorded.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {record.status === 'open' &&
                  !record.isRequester &&
                  volunteer.available &&
                  !volunteer.activeRequestId &&
                  volunteer.categories.includes(record.category) && (
                    <Button
                      type="button"
                      className="btn btn-primary min-h-11"
                      disabled={busy}
                      onClick={() => void action(record, { action: 'claim', revision: record.revision })}
                    >
                      Claim request
                    </Button>
                  )}
                {record.status === 'assigned' && (record.isRequester || record.isVolunteer) && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'start', revision: record.revision })}
                  >
                    Start helping
                  </Button>
                )}
                {['assigned', 'in-progress'].includes(record.status) && (record.isRequester || record.isVolunteer) && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'resolve', revision: record.revision })}
                  >
                    Mark resolved
                  </Button>
                )}
                {['assigned', 'in-progress'].includes(record.status) && record.isVolunteer && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'unassign', revision: record.revision })}
                  >
                    Leave assignment
                  </Button>
                )}
                {['open', 'assigned', 'in-progress'].includes(record.status) && record.isRequester && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'cancel', revision: record.revision })}
                  >
                    Cancel request
                  </Button>
                )}
                {record.status === 'resolved' && record.isRequester && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'close', revision: record.revision })}
                  >
                    Close request
                  </Button>
                )}
                {record.volunteerName && (record.isRequester || record.isVolunteer) && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void openChat(record)}
                  >
                    Private chat
                  </Button>
                )}
              </div>
              {!record.abuseReported && (
                <details className="mt-4 text-sm">
                  <summary>Report abuse</summary>
                  <form
                    className="mt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void action(record, { action: 'report', revision: record.revision, reason: data.get('reason') });
                    }}
                  >
                    <label>
                      Reason
                      <textarea
                        name="reason"
                        required
                        minLength={10}
                        maxLength={1000}
                        className="mt-1 w-full bg-obsidian-900 p-2"
                      />
                    </label>
                    <Button type="submit" className="btn btn-secondary mt-2 min-h-11" disabled={busy}>
                      Submit abuse report
                    </Button>
                  </form>
                </details>
              )}
            </Card>
          ))}
        </div>
        {!requests.length && <p className="mt-4 text-sm text-sand-400">No help requests are visible.</p>}
      </section>
      {chat && (
        <Card as="section" className="panel mt-8 p-5" aria-label={`Private chat for ${chat.title}`}>
          <h2 className="text-lg">Private assistance chat</h2>
          <p className="mt-2 text-sm text-sand-400">
            Only the requester and assigned volunteer can read these messages.
          </p>
          <ul className="mt-4 space-y-3">
            {messages.map((item) => (
              <li key={item.id} className="text-sm">
                <strong>{item.authorName}</strong> <LocalTime value={item.sentAt} />
                <p className="whitespace-pre-wrap break-words">{item.body}</p>
              </li>
            ))}
          </ul>
          {!messages.length && <p className="mt-3 text-sm text-sand-400">No messages yet.</p>}
          {['assigned', 'in-progress'].includes(chat.status) && (
            <form className="mt-4" onSubmit={(event) => void sendMessage(event, chat)}>
              <label className="text-sm">
                Message
                <textarea
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  maxLength={1000}
                  required
                  className="mt-1 w-full bg-obsidian-900 p-3"
                />
              </label>
              <Button type="submit" className="btn btn-primary mt-2 min-h-11" disabled={busy}>
                Send private message
              </Button>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
