import { z } from 'zod';

/**
 * Discord announcement builder (pure, browser-safe). The admin composer previews with this and the
 * server sends with this, so what you see is exactly what Discord receives.
 *
 * Buttons are Discord *link* buttons: plain webhooks may only send link buttons, which is exactly
 * what "interactive URL embeds" need. Callback buttons require an application-owned webhook.
 */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footer: 2048,
  /** Discord caps the sum of all embed text at 6000; stay under it with headroom. */
  total: 5800,
  buttonLabel: 80,
  buttonsPerRow: 5,
} as const;

export const SPICE_COLOR = 0xee8209;
export const SAND_COLOR = 0xd1bf96;

const httpsUrl = z
  .string()
  .trim()
  .max(512)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use a public https:// link');

export const buttonSchema = z.object({
  label: z.string().trim().min(1).max(EMBED_LIMITS.buttonLabel),
  url: httpsUrl,
});

export const PROGRESS_STATES = ['done', 'active', 'todo'] as const;
export const progressItemSchema = z.object({
  label: z.string().trim().min(1).max(120),
  state: z.enum(PROGRESS_STATES),
});

export const announcementInputSchema = z.object({
  kind: z.enum(['release', 'progress']),
  version: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\w.+-]+$/, 'Letters, numbers, dots and dashes only'),
  headline: z.string().trim().max(200).default(''),
  note: z.string().trim().max(1000).default(''),
  progress: z.array(progressItemSchema).max(15).default([]),
  buttons: z.array(buttonSchema).max(3).default([]),
});

export type AnnouncementInput = z.input<typeof announcementInputSchema>;
export type Announcement = z.output<typeof announcementInputSchema>;
export type ProgressItem = z.infer<typeof progressItemSchema>;

export interface ReleaseNotes {
  version: string;
  date: string;
  sections: Array<{ title: string; items: string[] }>;
}

export interface WebhookEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
}

export interface WebhookButton {
  type: 2;
  style: 5;
  label: string;
  url: string;
}

export interface WebhookPayload {
  username: string;
  embeds: WebhookEmbed[];
  components: Array<{ type: 1; components: WebhookButton[] }>;
  /** Always empty: an announcement must never be able to ping @everyone, roles or users. */
  allowed_mentions: { parse: [] };
}

export function clip(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** `[x] done`, `[~] doing`, `[ ] todo`; a plain line counts as todo. */
export function parseProgressLines(source: string): ProgressItem[] {
  const items: ProgressItem[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^[-*]?\s*\[([ xX~>])]\s*(.*)$/.exec(line);
    const state: ProgressItem['state'] = !match
      ? 'todo'
      : match[1].toLowerCase() === 'x'
        ? 'done'
        : match[1] === ' '
          ? 'todo'
          : 'active';
    const label = clip(match ? match[2] : line, 120);
    if (label) items.push({ label, state });
  }
  return items.slice(0, 15);
}

export function progressBar(items: ProgressItem[], width = 10): { bar: string; percent: number; done: number } {
  const done = items.filter((item) => item.state === 'done').length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const filled = Math.round((percent / 100) * width);
  return { bar: '▰'.repeat(filled) + '▱'.repeat(width - filled), percent, done };
}

const ICONS: Record<ProgressItem['state'], string> = { done: '✅', active: '🔧', todo: '⬜' };

function embedLength(embed: WebhookEmbed): number {
  return (
    embed.title.length +
    (embed.description?.length ?? 0) +
    embed.footer.text.length +
    (embed.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  );
}

/** Drop trailing fields (with a visible marker) until the embed fits Discord's total-size rule. */
function fitEmbed(embed: WebhookEmbed): WebhookEmbed {
  const fields = [...(embed.fields ?? [])];
  let dropped = 0;
  const withMarker = () =>
    dropped > 0
      ? [
          ...fields,
          { name: 'And more', value: `${dropped} more section${dropped === 1 ? '' : 's'} in the full changelog.` },
        ]
      : fields;
  while (fields.length > 1 && embedLength({ ...embed, fields: withMarker() }) > EMBED_LIMITS.total) {
    fields.pop();
    dropped++;
  }
  return { ...embed, fields: withMarker() };
}

export function changelogUrl(appUrl: string | undefined, version: string): string | undefined {
  if (!appUrl) return undefined;
  return new URL(`/changelog#v${encodeURIComponent(version)}`, appUrl).toString();
}

export function buildWebhookPayload(
  input: Announcement,
  context: { appUrl?: string; release?: ReleaseNotes; now?: Date },
): WebhookPayload {
  const { appUrl, release } = context;
  const now = context.now ?? new Date();
  const link = changelogUrl(appUrl, input.version);

  let embed: WebhookEmbed;
  if (input.kind === 'release') {
    if (!release) throw new Error(`Release ${input.version} was not found in CHANGELOG.md.`);
    const intro = [input.headline, input.note].filter(Boolean).join('\n\n');
    embed = {
      title: clip(`Arrakis Control v${release.version}`, EMBED_LIMITS.title),
      ...(link ? { url: link } : {}),
      ...(intro ? { description: clip(intro, EMBED_LIMITS.description) } : {}),
      color: SPICE_COLOR,
      fields: release.sections
        .filter((section) => section.items.length > 0)
        .slice(0, EMBED_LIMITS.fields)
        .map((section) => ({
          name: clip(section.title, EMBED_LIMITS.fieldName),
          value: clip(section.items.map((item) => `• ${clip(item, 240)}`).join('\n'), EMBED_LIMITS.fieldValue),
        })),
      footer: { text: clip(`Released ${release.date}`, EMBED_LIMITS.footer) },
      timestamp: now.toISOString(),
    };
  } else {
    const { bar, percent, done } = progressBar(input.progress);
    const summary = input.progress.length
      ? `${bar}  **${percent}%**  (${done} of ${input.progress.length} complete)`
      : '';
    const checklist = input.progress.map((item) => `${ICONS[item.state]} ${item.label}`).join('\n');
    const description = [input.headline, summary, checklist, input.note].filter(Boolean).join('\n\n');
    embed = {
      title: clip(`Arrakis Control v${input.version} in progress`, EMBED_LIMITS.title),
      ...(link ? { url: link } : {}),
      ...(description ? { description: clip(description, EMBED_LIMITS.description) } : {}),
      color: percent === 100 ? SPICE_COLOR : SAND_COLOR,
      footer: { text: percent === 100 ? 'Ready to ship' : 'Development update' },
      timestamp: now.toISOString(),
    };
  }

  const buttons: WebhookButton[] = [];
  if (link) buttons.push({ type: 2, style: 5, label: 'View changelog', url: link });
  if (appUrl) buttons.push({ type: 2, style: 5, label: 'Open dashboard', url: new URL('/', appUrl).toString() });
  for (const button of input.buttons) buttons.push({ type: 2, style: 5, label: button.label, url: button.url });

  return {
    username: 'Arrakis Control',
    embeds: [fitEmbed(embed)],
    components: buttons.length ? [{ type: 1, components: buttons.slice(0, EMBED_LIMITS.buttonsPerRow) }] : [],
    allowed_mentions: { parse: [] },
  };
}
