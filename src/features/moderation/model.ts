import { z } from 'zod';
import type { HelpRequest } from '../assistance/model';

export const MODERATION_CASE_LIMIT = 200;
export const MODERATION_HISTORY_LIMIT = 30;
export const moderationCaseTypeSchema = z.enum(['player-report', 'assistance-abuse']);
export const moderationStatusSchema = z.enum(['open', 'assigned', 'resolved', 'closed']);
export const moderationDecisionSchema = z.enum(['confirmed', 'dismissed']);
export const moderationHistorySchema = z
  .object({
    action: z.string().min(1).max(40),
    actorName: z.string().min(1).max(100),
    at: z.iso.datetime(),
    note: z.string().max(2000).nullable(),
  })
  .strict();
export const moderationCaseSchema = z
  .object({
    id: z.uuid(),
    type: moderationCaseTypeSchema,
    reporterOwner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    reporterName: z.string().trim().min(1).max(100),
    subjectName: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(10).max(1000),
    evidence: z.string().trim().min(10).max(4000),
    sourceId: z.uuid().nullable(),
    status: moderationStatusSchema,
    assigneeOwner: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .nullable(),
    assigneeName: z.string().trim().min(1).max(100).nullable(),
    decision: moderationDecisionSchema.nullable(),
    decisionReason: z.string().trim().min(10).max(2000).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable(),
    revision: z.uuid(),
    history: z.array(moderationHistorySchema).max(MODERATION_HISTORY_LIMIT),
  })
  .strict();
export type ModerationCase = z.infer<typeof moderationCaseSchema>;
export const reportInputSchema = z
  .object({
    subjectName: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(10).max(1000),
    evidence: z.string().trim().min(10).max(4000),
  })
  .strict();
export const moderationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['assign', 'unassign', 'close']), revision: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('decide'),
      revision: z.uuid(),
      decision: moderationDecisionSchema,
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
]);

export function assistanceModerationCase(request: HelpRequest): ModerationCase | null {
  if (!request.abuse) return null;
  return {
    id: request.id,
    type: 'assistance-abuse',
    reporterOwner: request.abuse.reporter,
    reporterName: 'Member report',
    subjectName: request.title,
    summary: `Abuse reported for a ${request.category} assistance request.`,
    evidence: `Assistance request: ${request.details}\n\nAbuse report: ${request.abuse.reason}`,
    sourceId: request.id,
    status: 'open',
    assigneeOwner: null,
    assigneeName: null,
    decision: null,
    decisionReason: null,
    createdAt: request.abuse.at,
    updatedAt: request.abuse.at,
    closedAt: null,
    revision: request.revision,
    history: [{ action: 'reported', actorName: 'Member report', at: request.abuse.at, note: null }],
  };
}

export function moderationCaseView(record: ModerationCase) {
  return {
    id: record.id,
    type: record.type,
    reporterName: record.reporterName,
    subjectName: record.subjectName,
    summary: record.summary,
    evidence: record.evidence,
    sourceId: record.sourceId,
    status: record.status,
    assigneeName: record.assigneeName,
    decision: record.decision,
    decisionReason: record.decisionReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    closedAt: record.closedAt,
    revision: record.revision,
    history: record.history,
  };
}

export function reporterCaseView(record: ModerationCase) {
  return {
    id: record.id,
    type: record.type,
    subjectName: record.subjectName,
    summary: record.summary,
    status: record.status,
    decision: record.decision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const moderationCaseViewSchema = moderationCaseSchema
  .omit({ reporterOwner: true, assigneeOwner: true })
  .strict();
export const reporterCaseViewSchema = moderationCaseSchema
  .pick({
    id: true,
    type: true,
    subjectName: true,
    summary: true,
    status: true,
    decision: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();
