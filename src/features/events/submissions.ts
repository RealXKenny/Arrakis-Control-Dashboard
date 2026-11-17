import { z } from 'zod';

export const EVENT_SUBMISSION_LIMIT = 25;
export const EVENT_SUBMISSION_IMAGE_MAX_BYTES = 700 * 1024;
export const EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES = 256 * 1024;
export const submissionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'withdrawn']);
export const judgingResultSchema = z.enum(['winner', 'finalist', 'not-selected']);
export const eventSubmissionSchema = z
  .object({
    id: z.uuid(),
    owner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    authorName: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(120),
    note: z.string().trim().min(10).max(2000),
    status: submissionStatusSchema,
    reviewNote: z.string().trim().max(1000).nullable(),
    result: judgingResultSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().nullable(),
    judgedAt: z.iso.datetime().nullable(),
    revision: z.uuid(),
    imageVersion: z.uuid(),
  })
  .strict();
export type EventSubmission = z.infer<typeof eventSubmissionSchema>;
export const submissionSaveSchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.uuid().optional(),
    title: z.string().trim().min(3).max(120),
    note: z.string().trim().min(10).max(2000),
  })
  .strict();
export const submissionReviewSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('review'),
      revision: z.uuid(),
      status: z.enum(['approved', 'rejected']),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal('judge'),
      revision: z.uuid(),
      result: judgingResultSchema,
    })
    .strict(),
]);

export const eventSubmissionViewSchema = z
  .object({
    id: z.uuid(),
    authorName: z.string().min(1).max(100),
    title: z.string().min(3).max(120),
    note: z.string().min(10).max(2000),
    status: submissionStatusSchema,
    result: judgingResultSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    judgedAt: z.iso.datetime().nullable(),
    imageUrl: z.string().regex(/^\/api\/v2\/events\/[a-z0-9-]+\/submissions\/[a-f0-9-]+\/image\?v=[a-f0-9-]+$/),
    revision: z.uuid().optional(),
    reviewNote: z.string().max(1000).nullable().optional(),
    canEdit: z.boolean().optional(),
    canWithdraw: z.boolean().optional(),
  })
  .strict();
export type EventSubmissionView = z.infer<typeof eventSubmissionViewSchema>;

export function submissionView(
  eventId: string,
  submission: EventSubmission,
  viewer: { owner: string; reviewer: boolean },
): EventSubmissionView | null {
  const own = submission.owner === viewer.owner;
  if (submission.status !== 'approved' && !own && !viewer.reviewer) return null;
  const privileged = own || viewer.reviewer;
  return eventSubmissionViewSchema.parse({
    id: submission.id,
    authorName: submission.authorName,
    title: submission.title,
    note: submission.note,
    status: submission.status,
    result: submission.result,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    judgedAt: submission.judgedAt,
    imageUrl: `/api/v2/events/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(submission.id)}/image?v=${submission.imageVersion}`,
    ...(privileged
      ? {
          revision: submission.revision,
          reviewNote: submission.reviewNote,
          canEdit: !submission.result && ['pending', 'rejected', 'withdrawn'].includes(submission.status),
          canWithdraw: !submission.result,
        }
      : {}),
  });
}
