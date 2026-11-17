// Isolated browser fixture only. Production executes the Lua scripts against Redis.
const records = new Map();
const registrations = new Map();
const submissions = new Map();
const submissionImages = new Map();
const KEY = 'arrakis:{community-events}:records';
const values = (records) => [...records].flat();

export function setFixtureEvent(event) {
  records.set('__seeded', '1');
  records.set(event.id, JSON.stringify(event));
}

export function resetFixtureEvents() {
  records.clear();
  registrations.clear();
  submissions.clear();
  submissionImages.clear();
}

function registrationReply(script, args) {
  const key = args[1];
  const stored = registrations.get(key) ?? new Map();
  if (script.includes('event-registration-read')) return { value: values(stored) };
  if (!script.includes('event-registration-mutate')) return undefined;
  const [owner, expected, action] = args.slice(3, 6);
  const revision = args[7];
  const eventId = args[11];
  if ((stored.get('__revision') ?? '') !== expected) return { value: 'conflict' };
  const event = JSON.parse(records.get(eventId) ?? '{}');
  const open =
    event.visibility === 'published' &&
    ['upcoming', 'open'].includes(event.status) &&
    event.startsAt === args[12] &&
    Date.now() < Number(args[13]) &&
    Date.now() < Number(args[14]);
  if (action === 'register' && !open) return { value: 'closed' };
  const existing = stored.get(owner) ? JSON.parse(stored.get(owner)) : null;
  if (action === 'register' && existing) return { value: values(stored) };
  if (action === 'cancel' && !existing) return { value: values(stored) };
  const entries = [...stored]
    .filter(([field]) => field !== '__revision')
    .map(([field, raw]) => [field, JSON.parse(raw)]);
  if (action === 'register') {
    const registered = entries.filter(([, entry]) => entry.status === 'registered').length;
    const waiting = entries.filter(([, entry]) => entry.status === 'waiting').length;
    if (registered >= Number(args[9]) && waiting >= Number(args[10])) return { value: 'full' };
    stored.set(
      owner,
      JSON.stringify({ status: registered >= Number(args[9]) ? 'waiting' : 'registered', joinedAt: args[8] }),
    );
  } else {
    stored.delete(owner);
    if (existing.status === 'registered' && open) {
      const waiting = entries
        .filter(([field, entry]) => field !== owner && entry.status === 'waiting')
        .sort(([a, first], [b, second]) => first.joinedAt.localeCompare(second.joinedAt) || a.localeCompare(b));
      if (waiting.length) {
        const [field, entry] = waiting[0];
        stored.set(field, JSON.stringify({ ...entry, status: 'registered' }));
      }
    }
  }
  stored.set('__revision', revision);
  registrations.set(key, stored);
  return { value: values(stored) };
}

function submissionReply(script, args) {
  const key = args[1];
  const stored = submissions.get(key) ?? new Map();
  if (script.includes('event-submissions-read')) return { value: values(stored) };
  if (!script.includes('event-submission-mutate')) return undefined;
  const [id, expected, action, payload, owner, eventId, endsAt, endsMs, limit, image] = args.slice(4);
  const old = stored.get(id) ? JSON.parse(stored.get(id)) : null;
  if ((old?.revision ?? '') !== expected) return { value: 'conflict' };
  const event = JSON.parse(records.get(eventId) ?? '{}');
  const open =
    event.visibility === 'published' &&
    event.status === 'open' &&
    event.endsAt === endsAt &&
    Date.now() < Number(endsMs);
  if (action === 'save' || action === 'withdraw') {
    if (!open) return { value: 'closed' };
    if (old && (old.owner !== owner || old.result !== null)) return { value: 'forbidden' };
    if (action === 'save' && old && !['pending', 'rejected', 'withdrawn'].includes(old.status))
      return { value: 'forbidden' };
    if (!old && [...stored.values()].some((raw) => JSON.parse(raw).owner === owner)) return { value: 'duplicate' };
    if (!old && stored.size >= Number(limit)) return { value: 'full' };
  } else if (action === 'review') {
    if (!old || old.status !== 'pending' || !['open', 'judging'].includes(event.status)) return { value: 'closed' };
  } else if (action === 'judge') {
    if (!old || old.status !== 'approved' || !['judging', 'completed'].includes(event.status))
      return { value: 'closed' };
    const next = JSON.parse(payload);
    if (
      next.result === 'winner' &&
      [...stored].some(([field, raw]) => field !== id && JSON.parse(raw).result === 'winner')
    )
      return { value: 'winner-conflict' };
  }
  stored.set(id, payload);
  submissions.set(key, stored);
  if (image) submissionImages.set(args[3], image);
  return { value: 'ok' };
}

export function eventsReply(operation, key, args) {
  if (operation.toUpperCase() === 'GET' && String(key).startsWith('arrakis:{community-events}:submission-image:'))
    return { value: submissionImages.get(key) ?? null };
  if (operation.toUpperCase() === 'HGET' && key === KEY) return { value: records.get(args[0]) ?? null };
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  if (String(args[1]).startsWith('arrakis:{community-events}:registration:')) return registrationReply(key, args);
  if (String(args[1]).startsWith('arrakis:{community-events}:submissions:')) return submissionReply(key, args);
  if (args[1] !== KEY) return undefined;
  const values = args.slice(2);
  if (key.includes('community-events:initialize')) {
    if (!records.has('__seeded')) {
      const seed = JSON.parse(values[0]);
      records.set('__seeded', '1');
      records.set(seed.id, values[0]);
    }
    return { value: [...records].flat() };
  }
  if (key.includes('community-events:mutate')) {
    const [id, revision, payload, method, limit] = values;
    const old = records.get(id);
    if (Number(revision) === 0) {
      if (old) return { value: 'conflict' };
      if (records.size >= Number(limit) + 1) return { value: 'full' };
    } else {
      if (!old) return { value: 'missing' };
      if (JSON.parse(old).revision !== Number(revision)) return { value: 'conflict' };
    }
    if (method === 'delete') records.delete(id);
    else records.set(id, payload);
    return { value: 'ok' };
  }
  return undefined;
}
