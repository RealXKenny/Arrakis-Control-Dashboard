import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const installationScript = `#!/bin/bash
set -euo pipefail

apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl jq tar
rm -rf /var/lib/apt/lists/*

release_file=$(mktemp)
archive_file=$(mktemp)
trap 'rm -f "$release_file" "$archive_file"' EXIT

curl --fail --silent --show-error --location --retry 3 \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  'https://api.github.com/repos/RealXKenny/Arrakis-Control-Dashboard/releases/latest' \
  --output "$release_file"
download_url=$(jq --exit-status --raw-output '.tarball_url // empty' "$release_file")
test -n "$download_url"

curl --fail --silent --show-error --location --retry 3 "$download_url" --output "$archive_file"
mkdir -p /mnt/server
tar -xzf "$archive_file" --strip-components=1 -C /mnt/server
cd /mnt/server
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
chown -R 1000:1000 /mnt/server
`;

function variable(name, description, envVariable, defaultValue = '', overrides = {}) {
  return {
    name,
    description,
    env_variable: envVariable,
    default_value: defaultValue,
    user_viewable: true,
    user_editable: true,
    rules: 'required|string',
    field_type: 'text',
    ...overrides,
  };
}

export function createPterodactylEgg() {
  return {
    _comment: 'Import this PTDL_v2 egg into a Pterodactyl nest. Installation downloads the latest GitHub release.',
    meta: { version: 'PTDL_v2', update_url: null },
    name: 'Arrakis Control Dashboard',
    author: 'realxkenny@users.noreply.github.com',
    description:
      'Dune: Awakening dashboard built from the latest GitHub release. Configure Dune Console, Discord OAuth, the public URL, and Redis before starting.',
    features: null,
    docker_images: { 'Node.js 22': 'ghcr.io/pterodactyl/yolks:nodejs_22' },
    file_denylist: [],
    startup: 'cd /home/container && exec node src/config/server-launcher.mjs start',
    config: {
      files: '{}',
      startup: '{"done":"Arrakis Control Dashboard is listening"}',
      logs: '{}',
      stop: '^C',
    },
    scripts: {
      installation: {
        script: installationScript,
        container: 'node:22-bookworm',
        entrypoint: 'bash',
      },
    },
    variables: [
      variable(
        'Admin Console API Key',
        'Optional privileged Console key; hidden from ordinary panel users.',
        'ADMIN_CONSOLE_API_KEY',
        '',
        {
          user_viewable: false,
          user_editable: false,
          rules: 'nullable|string',
        },
      ),
      variable(
        'API Worker Concurrency',
        'Active API requests per worker before overload returns 503.',
        'API_MAX_CONCURRENCY',
        '100',
        {
          rules: 'required|integer|min:1|max:10000',
        },
      ),
      variable(
        'Global Read Budget',
        'Requests per read route per minute shared through Redis.',
        'API_GLOBAL_READ_LIMIT',
        '2400',
        {
          rules: 'required|integer|min:1|max:100000000',
        },
      ),
      variable(
        'Trusted Proxy Count',
        'Exact reverse-proxy count; use 0 when exposed directly.',
        'TRUSTED_PROXY_COUNT',
        '1',
        {
          rules: 'required|integer|min:0|max:5',
        },
      ),
      variable(
        'Dashboard Bot API Token',
        'Optional independent secret for the read-only bot API.',
        'BOT_API_TOKEN',
        '',
        {
          rules: 'nullable|string|min:32|max:256',
        },
      ),
      variable('Log Level', 'Console verbosity; INFO is recommended.', 'LOG_LEVEL', 'INFO', {
        rules: 'required|string|in:DEBUG,INFO,WARN,ERROR,FATAL',
      }),
      variable(
        'Server Bind Address',
        'Bind to all interfaces so Wings can reach the dashboard.',
        'SERVER_HOSTNAME',
        '0.0.0.0',
      ),
      variable('Dune Console URL', 'Dune Console URL reachable from this container.', 'CONSOLE_URL', '', {
        rules: 'required|url',
      }),
      variable('Dune Console API Key', 'Scoped Dune Console API key.', 'CONSOLE_API_KEY'),
      variable('Adapter Token', 'Adapter integration token.', 'ADAPTER_TOKEN'),
      variable('Discord Client ID', 'Discord OAuth application client ID.', 'DISCORD_CLIENT_ID'),
      variable('Discord Client Secret', 'Discord OAuth application client secret.', 'DISCORD_CLIENT_SECRET'),
      variable('Discord Guild ID', 'Discord server whose members may access the dashboard.', 'DISCORD_GUILD_ID'),
      variable(
        'Public App URL',
        'Canonical public HTTPS origin; the Discord callback is /api/auth/callback/discord.',
        'APP_URL',
        '',
        {
          rules: 'required|url',
        },
      ),
      variable(
        'Auth Secret',
        'At least 32 random characters for Auth.js state and sealed refresh tokens.',
        'AUTH_SECRET',
        '',
        {
          rules: 'required|string|min:32|max:256',
        },
      ),
      variable('Verified Member Role ID', 'Discord role required for dashboard access.', 'VERIFIED_MEMBER_ROLE_ID'),
      variable('Redis URL', 'Redis TCP URL with credentials; use rediss:// for TLS.', 'REDIS_URL'),
      variable(
        'Redis Cluster Nodes',
        'Optional comma-separated host:port bootstrap list for Redis Cluster.',
        'REDIS_CLUSTER_NODES',
        '',
        {
          rules: 'nullable|string',
        },
      ),
      variable(
        'Changelog Webhook URL',
        'Optional Discord webhook for release and progress announcements.',
        'CHANGELOG_WEBHOOK_URL',
        '',
        {
          rules: 'nullable|url',
        },
      ),
      variable(
        'Changelog Auto Announce',
        'Announce each newly deployed changelog release once.',
        'CHANGELOG_AUTO_ANNOUNCE',
        'false',
        {
          rules: 'required|string|in:true,false',
        },
      ),
    ],
  };
}

async function writeEgg(path) {
  if (!path) throw new Error('Usage: node src/config/pterodactyl-egg.mjs <output.json>');
  await writeFile(path, `${JSON.stringify(createPterodactylEgg(), null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeEgg(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to generate the Pterodactyl egg.');
    process.exitCode = 1;
  });
}
