// Isolated browser fixture only. Real Redis scripts and races are covered by integration tests.
const volunteers = new Map();
const requests = new Map();
const messages = new Map();
const values = (map) => [...map].flat();

export function resetAssistance() {
  volunteers.clear();
  requests.clear();
  messages.clear();
}

function volunteerReply(script, args) {
  if (script.includes('assistance-volunteers-read')) return { value: values(volunteers) };
  if (!script.includes('assistance-volunteer-save')) return undefined;
  const [owner, expected, payload, disabling, limit] = args.slice(2);
  const old = volunteers.get(owner) ? JSON.parse(volunteers.get(owner)) : null;
  if ((old?.revision ?? '') !== expected) return { value: 'conflict' };
  if (old?.activeRequestId && disabling === 'true') return { value: 'active' };
  if (!old && volunteers.size >= Number(limit)) return { value: 'full' };
  volunteers.set(owner, payload);
  return { value: 'ok' };
}

function requestReply(script, args) {
  if (script.includes('assistance-requests-read')) return { value: values(requests) };
  if (script.includes('assistance-request-create')) {
    const [id, payload, limit, owner, openLimit] = args.slice(2);
    const next = JSON.parse(payload);
    const open = [...requests.values()].filter((raw) => {
      const request = JSON.parse(raw);
      return request.owner === owner && ['open', 'assigned', 'in-progress'].includes(request.status);
    });
    if (requests.size >= Number(limit)) return { value: 'full' };
    if (open.length >= Number(openLimit)) return { value: 'open-limit' };
    if (open.some((raw) => JSON.parse(raw).title === next.title)) return { value: 'duplicate' };
    requests.set(id, payload);
    return { value: 'ok' };
  }
  if (script.includes('assistance-request-claim')) {
    const [id, expected, nextRequest, nextVolunteer, owner, volunteerRevision] = args.slice(3);
    const request = requests.get(id) ? JSON.parse(requests.get(id)) : null;
    if (!request) return { value: 'missing' };
    if (request.revision !== expected) return { value: 'conflict' };
    if (request.status !== 'open' || request.owner === owner) return { value: 'closed' };
    const volunteer = volunteers.get(owner) ? JSON.parse(volunteers.get(owner)) : null;
    if (!volunteer || (volunteer.revision ?? '') !== volunteerRevision) return { value: 'conflict' };
    if (!volunteer.available || volunteer.activeRequestId || !volunteer.categories.includes(request.category))
      return { value: 'unavailable' };
    requests.set(id, nextRequest);
    volunteers.set(owner, nextVolunteer);
    return { value: 'ok' };
  }
  if (!script.includes('assistance-request-action')) return undefined;
  const [id, expected, payload, action, owner, reason, volunteerPayload, , volunteerOwner] = args.slice(3);
  const request = requests.get(id) ? JSON.parse(requests.get(id)) : null;
  if (!request) return { value: 'missing' };
  if (action !== 'read' && request.revision !== expected) return { value: 'conflict' };
  const participant = request.owner === owner || request.volunteerOwner === owner;
  const allowed =
    (action === 'start' && participant && request.status === 'assigned') ||
    (action === 'resolve' && participant && ['assigned', 'in-progress'].includes(request.status)) ||
    (action === 'cancel' && request.owner === owner && ['open', 'assigned', 'in-progress'].includes(request.status)) ||
    (action === 'unassign' &&
      request.volunteerOwner === owner &&
      ['assigned', 'in-progress'].includes(request.status)) ||
    (action === 'close' && request.owner === owner && request.status === 'resolved') ||
    (action === 'read' && participant) ||
    (action === 'report' && !request.abuse && reason.length >= 10);
  if (!allowed) return { value: 'forbidden' };
  requests.set(id, payload);
  if (volunteerPayload) volunteers.set(volunteerOwner, volunteerPayload);
  return { value: 'ok' };
}

function messageReply(script, args) {
  const key = args[1];
  const stored = messages.get(key) ?? new Map();
  if (script.includes('assistance-messages-read')) return { value: values(stored) };
  if (!script.includes('assistance-message-send')) return undefined;
  const [id, requestId, owner, payload, limit] = args.slice(3);
  const request = requests.get(requestId) ? JSON.parse(requests.get(requestId)) : null;
  if (!request) return { value: 'missing' };
  if (
    (request.owner !== owner && request.volunteerOwner !== owner) ||
    !['assigned', 'in-progress'].includes(request.status)
  )
    return { value: 'forbidden' };
  if (stored.size >= Number(limit)) return { value: 'full' };
  stored.set(id, payload);
  messages.set(key, stored);
  return { value: 'ok' };
}

export function assistanceReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  if (String(args[1]).startsWith('arrakis:{assistance}:volunteers')) return volunteerReply(script, args);
  if (String(args[1]).startsWith('arrakis:{assistance}:requests')) return requestReply(script, args);
  if (String(args[1]).startsWith('arrakis:{assistance}:messages:')) return messageReply(script, args);
  return undefined;
}
