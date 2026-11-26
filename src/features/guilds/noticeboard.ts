import { z } from 'zod';

export const NOTICE_LIMIT = 20;
export const PINNED_NOTICE_LIMIT = 5;
export const noticeboardGuildId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const revision = z.uuid().nullable();
const postFields = {
  id: z.uuid(),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(3000),
  pinned: z.boolean(),
};
export const guildNoticeSchema = z.object({
  ...postFields,
  authorName: z.string().min(1).max(200),
  updatedAt: z.iso.datetime(),
});
export const noticeboardSchema = z.object({
  guildId: noticeboardGuildId,
  revision,
  message: z.string().max(1000),
  priorities: z.string().max(1000),
  posts: z
    .array(guildNoticeSchema)
    .max(NOTICE_LIMIT)
    .refine(
      (posts) =>
        new Set(posts.map((post) => post.id)).size === posts.length &&
        posts.filter((post) => post.pinned).length <= PINNED_NOTICE_LIMIT,
    ),
});
export const noticeboardViewSchema = z.object({ board: noticeboardSchema, canEdit: z.boolean() });
export const noticeboardInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('settings'),
      revision,
      message: z.string().trim().max(1000),
      priorities: z.string().trim().max(1000),
    })
    .strict(),
  z.object({ action: z.literal('save-post'), revision, post: z.object(postFields).strict() }).strict(),
  z.object({ action: z.literal('delete-post'), revision, id: z.uuid() }).strict(),
]);
export type GuildNotice = z.infer<typeof guildNoticeSchema>;
export type GuildNoticeboard = z.infer<typeof noticeboardSchema>;
export type NoticeboardView = z.infer<typeof noticeboardViewSchema>;
export type NoticeboardInput = z.infer<typeof noticeboardInputSchema>;

export function emptyNoticeboard(guildId: string): GuildNoticeboard {
  return { guildId: noticeboardGuildId.parse(guildId), revision: null, message: '', priorities: '', posts: [] };
}
