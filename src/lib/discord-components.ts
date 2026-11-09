/** Shared, client-safe Discord Components V2 payloads. No credentials or provider calls. */
export type DiscordLinkButton = { type: 2; style: 5; label: string; url: string };
export type DiscordContainerChild =
  | { type: 10; content: string }
  | { type: 14; divider: boolean; spacing: 1 }
  | { type: 1; components: DiscordLinkButton[] };
export type DiscordContainerPayload = {
  flags: 32768;
  allowed_mentions: { parse: [] };
  components: [{ type: 17; accent_color: number; components: DiscordContainerChild[] }];
};

export function discordContainer(
  text: string | string[],
  buttons: DiscordLinkButton[] = [],
  color = 0xee8209,
): DiscordContainerPayload {
  // All Text Displays share Discord's 4,000-character budget. Sixteen blocks leave
  // room below 40 total components, including separators, a row and five buttons.
  const source = (Array.isArray(text) ? text : [text]).filter((block) => block.trim());
  const blocks = source.slice(0, 16);
  if (source.length > blocks.length) blocks[blocks.length - 1] += '\n… See the dashboard for more.';
  const children: DiscordContainerChild[] = [];
  let remaining = 3900;
  for (const block of blocks) {
    if (remaining <= 0) break;
    const content = block.length > remaining ? `${block.slice(0, remaining - 1).trimEnd()}…` : block;
    if (children.length) children.push({ type: 14, divider: true, spacing: 1 });
    children.push({ type: 10, content });
    remaining -= content.length;
  }
  return {
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: color,
        components: [
          ...children,
          ...(buttons.length
            ? [
                { type: 14 as const, divider: true, spacing: 1 as const },
                { type: 1 as const, components: buttons.slice(0, 5) },
              ]
            : []),
        ],
      },
    ],
  };
}

export function discordPageButton(label: string, appUrl: string | undefined, path: string): DiscordLinkButton[] {
  if (!appUrl) return [];
  const url = new URL(path, appUrl);
  if (url.protocol !== 'https:' || url.username || url.password) return [];
  return [{ type: 2, style: 5, label, url: url.toString() }];
}
