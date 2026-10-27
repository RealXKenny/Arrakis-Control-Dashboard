/** Public copy shared by server-rendered previews; never include member or live telemetry here. */
export const SHARE = {
  title: 'Crimson Skies | Dune: Awakening Community',
  description:
    'Your community, connected. Explore 3D live maps, preview your bases, and keep your character, storage and market in one workspace.',
  color: '#b94d58',
  discordUrl: 'https://discord.gg/crimsonskies',
  imagePath: '/api/assets/share/preview-v1.png',
  markPath: '/api/assets/share/mark-v1.png',
} as const;

/** APP_URL is the sole authority. Never construct share URLs from request Host/Forwarded headers. */
export function getShareMetadata(configuredOrigin?: string | null) {
  if (!configuredOrigin) return null;
  let origin: string;
  try {
    const url = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    origin = url.origin;
  } catch {
    return null;
  }
  const url = `${origin}/`;
  const absolute = (path: string) => new URL(path, url).href;
  const embed = {
    component: {
      type: 17,
      accent_color: Number.parseInt(SHARE.color.slice(1), 16),
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content: `## [Crimson Skies](${url})\nYour Dune: Awakening community workspace. Explore, build and stay connected.`,
            },
          ],
          accessory: {
            type: 11,
            media: { url: absolute(SHARE.markPath) },
            description: 'Crimson Skies community mark',
          },
        },
        { type: 14, spacing: 1 },
        {
          type: 10,
          content:
            '**3D live maps** · Explore Hagga Basin and Deep Desert.\n**Your bases** · Preview structures and manage private blueprints.\n**One workspace** · Character, storage, vehicles and the market.',
        },
        { type: 10, content: '-# Your community. Connected. Member features require Discord sign-in.' },
        { type: 14, spacing: 1 },
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: 'Visit website', url },
            { type: 2, style: 5, label: 'Open portal', url: absolute('/portal') },
            { type: 2, style: 5, label: 'Join Discord', url: SHARE.discordUrl },
          ],
        },
      ],
    },
  };
  // Dev note: this JSON is a postcard, not a script; keep the closing tag out of the envelope.
  const json = JSON.stringify(embed).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
  return { url, image: absolute(SHARE.imagePath), json };
}
