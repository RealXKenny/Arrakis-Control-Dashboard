import '../../../lib/assert-server';
import { z } from 'zod';
import operations from '../catalog.json';
import type { AdminOperation } from '../types';
import { AppError } from '../../../lib/errors';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const input = z
  .object({
    operation: z.string().min(1).max(180),
    path: z.record(z.string(), z.string().max(1024)).default({}),
    query: z.record(z.string(), z.union([z.string().max(2000), z.number().finite(), z.boolean()])).default({}),
    body: z.record(z.string(), z.unknown()).default({}),
    acknowledgement: z.string().max(300).default(''),
  })
  .strict();

/** Reject prototype keys, excessive nesting and unsafe numeric IDs before any provider call. */
function bounded(value: unknown, depth = 0) {
  if (depth > 10) throw new AppError('Request nesting is too deep.', 400, 'INVALID_REQUEST', true);
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    throw new AppError('Send large numeric identifiers as decimal strings.', 400, 'INVALID_REQUEST', true);
  if (Array.isArray(value)) {
    if (value.length > 1000)
      throw new AppError('At most 1000 array entries are allowed.', 400, 'INVALID_REQUEST', true);
    value.forEach((entry) => bounded(entry, depth + 1));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 200) throw new AppError('Too many request fields.', 400, 'INVALID_REQUEST', true);
    for (const [key, entry] of entries) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new AppError('Invalid request field.', 400, 'INVALID_REQUEST', true);
      bounded(entry, depth + 1);
    }
  }
}

export function parseAdminRequest(raw: unknown) {
  bounded(raw);
  if (Buffer.byteLength(JSON.stringify(raw) ?? '') > 64 * 1024)
    throw new AppError('Request exceeds 64 KiB.', 413, 'REQUEST_TOO_LARGE', true);
  const parsed = input.safeParse(raw);
  if (!parsed.success) throw new AppError('Invalid operation request.', 400, 'INVALID_REQUEST', true);
  const request = parsed.data;
  const operation: AdminOperation | undefined = operations.find((entry) => entry.id === request.operation);
  if (!operation) throw new AppError('Unknown operation.', 400, 'INVALID_OPERATION', true);
  if (operation.restriction) throw new AppError(operation.restriction, 403, 'CONSOLE_OPERATION_RESTRICTED', true);
  if (operation.method !== 'GET' && request.acknowledgement !== `${operation.method} ${operation.route}`)
    throw new AppError('Type the operation confirmation before making changes.', 400, 'CONFIRMATION_REQUIRED', true);
  if (Object.keys(request.path).some((key) => !operation.pathParameters.includes(key)))
    throw new AppError('Unexpected path parameter.', 400, 'INVALID_REQUEST', true);
  let route = operation.route;
  for (const name of operation.pathParameters) {
    const value = request.path[name];
    const parts = name === 'path' ? value?.split('/') : [value];
    if (
      !parts?.length ||
      parts.length > 8 ||
      parts.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9_.@ -]{1,200}$/.test(part))
    )
      throw new AppError(`Invalid ${name} path parameter.`, 400, 'INVALID_PATH_PARAMETER', true);
    route = route.replace(`{${name}}`, parts.map(encodeURIComponent).join('/'));
  }
  // Dev note: the catalog draws the map; requests do not get to invent new roads.
  if (Object.keys(request.query).some((key) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)))
    throw new AppError('Invalid query parameter.', 400, 'INVALID_REQUEST', true);
  if (operation.method === 'GET' && Object.keys(request.body).length)
    throw new AppError('Read operations use query parameters, not request bodies.', 400, 'INVALID_REQUEST', true);
  for (const key of ['pageSize', 'limit']) {
    if (
      request.query[key] !== undefined &&
      (!/^\d+$/.test(String(request.query[key])) || Number(request.query[key]) < 1 || Number(request.query[key]) > 1000)
    )
      throw new AppError(`${key} must be between 1 and 1000.`, 400, 'INVALID_REQUEST', true);
  }
  if (['/api/server/status', '/api/maps', '/api/map/status'].includes(route)) request.query.raw = '0';
  return { operation, request, route };
}
