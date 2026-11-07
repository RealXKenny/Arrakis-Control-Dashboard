/**
 * Strict allowlist for Discord webhook URLs. Pure (no server imports) so the environment
 * schema can use it. Anything else, including look-alike hosts, is rejected up front so a
 * misconfigured value can never turn the announcer into a server-side request forger.
 */
const WEBHOOK_HOSTS = new Set(['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com']);
const WEBHOOK_PATH = /^\/api\/(?:v\d{1,2}\/)?webhooks\/\d{15,25}\/[A-Za-z0-9_-]{20,120}$/;

export function isDiscordWebhookUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    WEBHOOK_HOSTS.has(url.hostname) &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    WEBHOOK_PATH.test(url.pathname)
  );
}
