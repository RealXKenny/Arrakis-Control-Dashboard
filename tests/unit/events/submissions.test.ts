import { expect, it } from 'vitest';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import {
  EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES,
  submissionView,
  type EventSubmission,
} from '../../../src/features/events/submissions';
import { processSubmissionImage } from '../../../src/features/events/server/submission-image';

const record: EventSubmission = {
  id: randomUUID(),
  owner: 'private-owner',
  authorName: 'Public builder',
  title: 'Desert home',
  note: 'A detailed building submission.',
  status: 'pending',
  reviewNote: 'Private review note',
  result: null,
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  reviewedAt: null,
  judgedAt: null,
  revision: randomUUID(),
  imageVersion: randomUUID(),
};

it('keeps pending entries private and removes ownership/review internals from the public gallery', () => {
  expect(submissionView('event', record, { owner: 'other', reviewer: false })).toBeNull();
  const own = submissionView('event', record, { owner: 'private-owner', reviewer: false });
  expect(own).toMatchObject({ status: 'pending', canEdit: true, canWithdraw: true });
  expect(JSON.stringify(own)).not.toContain('private-owner');
  const approved = submissionView(
    'event',
    { ...record, status: 'approved', result: 'winner' },
    { owner: 'other', reviewer: false },
  );
  expect(approved).toMatchObject({ status: 'approved', result: 'winner' });
  expect(approved).not.toHaveProperty('revision');
  expect(approved).not.toHaveProperty('reviewNote');
  expect(approved).not.toHaveProperty('canWithdraw');
});

it('validates and re-encodes static images while rejecting malformed input', async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#a65f32' } })
    .png()
    .toBuffer();
  const result = await processSubmissionImage(png);
  expect(result.bytes.length).toBeLessThanOrEqual(EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES);
  expect(result.bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(result.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  await expect(processSubmissionImage(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
    code: 'INVALID_SUBMISSION_IMAGE',
  });
  await expect(processSubmissionImage(new Uint8Array(700 * 1024 + 1))).rejects.toMatchObject({
    code: 'SUBMISSION_IMAGE_TOO_LARGE',
  });
});
