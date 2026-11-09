import { z } from 'zod';
import { discordContainer, discordPageButton, type DiscordContainerPayload } from '../../lib/discord-components';

/**
 * Discord announcement builder (pure, browser-safe). The admin composer previews with this and the
 * server sends the same Components V2 tree.
 *
 * Buttons are Discord link buttons, so no interaction endpoint or extra bot process is required.
 */
export const ANNOUNCEMENT_LIMITS = { buttonLabel: 80, buttonsPerRow: 5, parts: 50, body: 3400 } as const;

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
  label: z.string().trim().min(1).max(ANNOUNCEMENT_LIMITS.buttonLabel),
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

/** Split only oversized individual notes; ordinary bullets stay together, without clipping any text. */
function splitNote(text: string): string[] {
  const chunks: string[] = [];
  while (text.length > 2800) {
    let end = Math.max(text.lastIndexOf('\n', 2800), text.lastIndexOf(' ', 2800));
    if (end < 1400) end = 2800;
    if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text) chunks.push(text);
  return chunks;
}

/** The 4,000-character limit applies to the entire Discord message, so large releases need several messages. */
export function buildAnnouncementPayloads(
  input: Announcement,
  context: { appUrl?: string; release?: ReleaseNotes; now?: Date },
): DiscordContainerPayload[] {
  const { release, appUrl } = context;
  if (input.kind === 'release' && !release) throw new Error(`Release ${input.version} was not found in CHANGELOG.md.`);
  const title = `# Arrakis Control v${input.version}${input.kind === 'progress' ? ' in progress' : ''}`;
  const progress = progressBar(input.progress);
  const footer =
    input.kind === 'release'
      ? release?.date
        ? `Released ${release.date}`
        : 'Release notes'
      : progress.percent === 100
        ? 'Ready to ship'
        : 'Development update';
  if (title.length + footer.length > 400) throw new Error('The announcement title or date is too long.');
  const units: Array<{ section: string | null; text: string }> = [];
  for (const text of [input.headline, input.note].filter(Boolean)) units.push({ section: null, text });
  if (input.kind === 'release') {
    for (const section of release!.sections) {
      if (section.title.length > 400) throw new Error('A changelog section title is too long.');
      for (const item of section.items)
        for (const text of splitNote(`- ${item}`)) units.push({ section: section.title, text });
    }
  } else {
    if (input.progress.length)
      units.push({
        section: 'Progress',
        text: `${progress.bar}  **${progress.percent}%**  (${progress.done} of ${input.progress.length} complete)`,
      });
    for (const item of input.progress) units.push({ section: 'Progress', text: `${ICONS[item.state]} ${item.label}` });
  }

  const pages: string[][] = [];
  let blocks: string[] = [];
  let currentSection: string | null | undefined;
  let length = 0;
  const seen = new Set<string>();
  function flush() {
    if (blocks.length) pages.push(blocks);
    blocks = [];
    currentSection = undefined;
    length = 0;
    if (pages.length >= ANNOUNCEMENT_LIMITS.parts)
      throw new Error('This announcement exceeds 50 messages. Split it into smaller releases before sending.');
  }
  for (const unit of units) {
    const heading = () => (unit.section ? `## ${unit.section}${seen.has(unit.section) ? ' (continued)' : ''}\n` : '');
    let same = unit.section !== null && currentSection === unit.section;
    let prefix = same ? '\n' : heading();
    if (length + prefix.length + unit.text.length > ANNOUNCEMENT_LIMITS.body || (!same && blocks.length >= 12)) {
      flush();
      same = false;
      prefix = heading();
    }
    if (same) blocks[blocks.length - 1] += prefix + unit.text;
    else blocks.push(prefix + unit.text);
    length += prefix.length + unit.text.length;
    currentSection = unit.section;
    if (unit.section) seen.add(unit.section);
  }
  if (blocks.length) pages.push(blocks);
  if (!pages.length) pages.push([]);
  const buttons = [
    ...discordPageButton('View changelog', appUrl, `/changelog#v${encodeURIComponent(input.version)}`),
    ...discordPageButton('Open dashboard', appUrl, '/'),
    ...input.buttons.map((button) => ({ type: 2 as const, style: 5 as const, label: button.label, url: button.url })),
  ];
  return pages.map((body, index) =>
    discordContainer(
      [title, ...body, `-# ${footer}${pages.length > 1 ? ` · Part ${index + 1} of ${pages.length}` : ''}`],
      buttons,
      input.kind === 'release' || progress.percent === 100 ? SPICE_COLOR : SAND_COLOR,
    ),
  );
}
