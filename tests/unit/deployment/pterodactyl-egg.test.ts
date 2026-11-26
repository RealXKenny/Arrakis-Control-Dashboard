import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPterodactylEgg, SECRET_VARIABLES } from '../../../scripts/deployment/build-pterodactyl-egg.mjs';

const egg = createPterodactylEgg();

describe('Pterodactyl dashboard egg', () => {
  it('keeps the privileged administrator key hidden and non-editable for ordinary panel users', () => {
    const key = egg.variables.find((variable) => variable.env_variable === 'DUNE_API_KEY');
    expect(key).toMatchObject({ default_value: '', user_viewable: false, user_editable: false });
  });

  it('builds the latest GitHub release with the standard Node.js runtime', () => {
    expect(egg.meta.version).toBe('PTDL_v2');
    expect(Object.values(egg.docker_images)).toEqual(['ghcr.io/pterodactyl/yolks:nodejs_22']);
    expect(egg.startup).toContain('/home/container');
    expect(egg.startup).toContain('scripts/deployment/updater/supervisor.mjs');
    // The supervisor the egg starts must exist in the repository, or a fresh install cannot boot, and it must start
    // the same launcher and report the same ready line Wings waits for.
    expect(existsSync(egg.startup.match(/node (\S+\.mjs)/)![1])).toBe(true);
    const release = JSON.parse(readFileSync('package.json', 'utf8')).arrakisRelease;
    expect(release.start).toEqual(['node', 'scripts/server-launcher.mjs', 'start']);
    expect(release.readyPattern).toBe(JSON.parse(egg.config.startup).done);
    expect(JSON.parse(egg.config.startup)).toEqual({ done: 'Arrakis Control Dashboard is listening' });
    expect(egg.scripts.installation.script).toContain('repos/RealXKenny/Arrakis-Control-Dashboard/releases');
    expect(egg.scripts.installation.script).toContain('$api/latest');
    expect(egg.scripts.installation.script).toContain('npm ci --ignore-scripts');
    expect(egg.scripts.installation.script).toContain('npm run build');
    expect(egg.scripts.installation.script).toContain('npm prune --omit=dev');
    expect(JSON.stringify(egg)).not.toContain('ghcr.io/realxkenny');
  });

  it('exposes every required production setting and leaves the Wings port alone', () => {
    const variables = new Map<string, { default_value: string; rules: string }>(
      egg.variables.map((variable) => [variable.env_variable, variable] as const),
    );
    expect(variables.size).toBe(egg.variables.length);
    expect(variables.has('SERVER_PORT')).toBe(false);
    expect(variables.get('SERVER_HOSTNAME')?.default_value).toBe('0.0.0.0');
    expect(variables.get('TRUSTED_PROXY_COUNT')?.default_value).toBe('1');
    for (const key of [
      'DUNE_API_URL',
      'DUNE_API_KEY',
      'DUNE_ADAPTER_TOKEN',
      'DISCORD_GUILD_ID',
      'VERIFIED_MEMBER_ROLE_ID',
      'APP_URL',
      'REDIS_URL',
      'AUTH_SECRET',
    ]) {
      expect(variables.get(key)?.default_value, key).toBe('');
      expect(variables.get(key)?.rules, key).toContain('required');
    }
    // Both sign-in methods require the Discord application credentials.
    for (const key of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'])
      expect(variables.get(key)?.rules, key).toBe('required|string');
    for (const key of ['AUTH_PROVIDER', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'])
      expect(variables.has(key), key).toBe(false);
  });
});

describe('release integrity', () => {
  const script = egg.scripts.installation.script;

  it('verifies the published SHA-256 before extracting or building anything', () => {
    expect(script).toContain('sha256sum --check');
    expect(script.indexOf('sha256sum --check')).toBeLessThan(script.indexOf('tar -xzf'));
    expect(script.indexOf('tar -xzf')).toBeLessThan(script.indexOf('npm ci'));
    // Releases without a checksum fail closed unless the operator explicitly opts in, and then say so loudly.
    expect(script).toContain('WARNING: ALLOW_UNVERIFIED_RELEASE is true');
    expect(script).toContain('exit 1');
  });

  it('lets an installation pin an exact release and rejects anything else', () => {
    expect(script).toContain('RELEASE_TAG');
    expect(script).toContain("tag_pattern='^v[0-9]+\\.[0-9]+\\.[0-9]+$'");
    expect(script).toContain('[[ "$tag" =~ $tag_pattern ]]');
    const tag = egg.variables.find((variable) => variable.env_variable === 'RELEASE_TAG');
    expect(tag).toMatchObject({ default_value: 'latest' });
  });

  it('hides the dedicated owner-key secret from panel users', () => {
    const secret = egg.variables.find((variable) => variable.env_variable === 'OWNER_KEY_SECRET');
    expect(secret).toMatchObject({ user_viewable: false, default_value: '' });
  });

  it('is published together with a checksummed source archive by the release workflow', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain('git archive');
    expect(workflow).toContain('sha256sum --check');
    expect(workflow).toMatch(/gh release create[^\n]*ARCHIVE_FILE[^\n]*ARCHIVE_FILE\.sha256/);
  });

  it('inspects the archive for links and unsafe paths before writing anything, then extracts without owners or modes', () => {
    expect(script.indexOf('sha256sum --check')).toBeLessThan(script.indexOf('tar -tvzf'));
    expect(script.indexOf('tar -tvzf')).toBeLessThan(script.indexOf('tar -xzf'));
    expect(script).toContain('refusing to extract it');
    expect(script).toContain('--no-same-owner --no-same-permissions');
  });

  it('exposes the security settings an operator needs, with safe defaults', () => {
    const byName = new Map<string, { default_value: string; rules: string }>(
      egg.variables.map((variable) => [variable.env_variable, variable] as const),
    );
    expect(byName.get('REDIS_ALLOW_INSECURE')?.default_value).toBe('false');
    expect(byName.get('REDIS_REQUIRE_TLS')?.default_value).toBe('false');
    expect(byName.get('AUDIT_LOG_STDOUT')?.default_value).toBe('true');
    expect(byName.get('AUDIT_LOG_REDIS')?.default_value).toBe('true');
    expect(byName.get('AUDIT_LOG_MAX_ENTRIES')?.default_value).toBe('10000');
    // No administrator variables exist: access control is the member role only.
    expect([...byName.keys()].some((name) => name.startsWith('ADMIN_'))).toBe(false);
  });

  it('hides every credential variable from panel users and subusers without dropping any of them', () => {
    expect([...SECRET_VARIABLES].sort()).toEqual(
      [
        'AUTH_SECRET',
        'BOT_API_TOKEN',
        'DUNE_ADAPTER_TOKEN',
        'DISCORD_BOT_TOKEN',
        'DUNE_API_KEY',
        'DISCORD_CLIENT_SECRET',
        'OWNER_KEY_SECRET',
        'REDIS_URL',
        'ROADMAP_GITHUB_TOKEN',
        'RABBITMQ_URL',
        'RABBITMQ_TLS_KEY',
        'AUTO_UPDATE_GITHUB_TOKEN',
      ].sort(),
    );
    const byName = new Map<
      string,
      { rules: string; user_viewable: boolean; user_editable: boolean; default_value: string }
    >(egg.variables.map((variable) => [variable.env_variable, variable] as const));
    for (const name of SECRET_VARIABLES) {
      expect(byName.get(name), name).toMatchObject({ user_viewable: false, user_editable: false });
    }
    // Required settings stay required, so installation and startup validation still demand them.
    for (const name of ['AUTH_SECRET', 'REDIS_URL', 'DUNE_API_KEY', 'DUNE_ADAPTER_TOKEN', 'DISCORD_CLIENT_SECRET'])
      expect(byName.get(name)?.rules, name).toContain('required');
    // Ordinary operational settings stay editable.
    for (const name of ['APP_URL', 'TRUSTED_PROXY_COUNT', 'RELEASE_TAG'])
      expect(byName.get(name), name).toMatchObject({ user_viewable: true, user_editable: true });
  });

  it('keeps anonymous Next.js telemetry off during installation and at runtime', () => {
    expect(egg.variables.find((variable) => variable.env_variable === 'NEXT_TELEMETRY_DISABLED')).toMatchObject({
      default_value: '1',
      user_editable: false,
    });
    expect(script.indexOf('export NEXT_TELEMETRY_DISABLED=1')).toBeGreaterThan(-1);
    expect(script.indexOf('export NEXT_TELEMETRY_DISABLED=1')).toBeLessThan(script.indexOf('npm ci'));
    const launcher = readFileSync('scripts/server-launcher.mjs', 'utf8');
    expect(launcher).toContain("NEXT_TELEMETRY_DISABLED: '1'");
  });
});

describe('egg and configuration stay in sync', () => {
  const schema = readFileSync('src/config/env.ts', 'utf8');
  const schemaKeys = [...schema.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
  const eggKeys = new Set<string>(egg.variables.map((variable: { env_variable: string }) => variable.env_variable));
  const example = readFileSync('.env.example', 'utf8');
  /** Set by the platform, never by an operator: Wings assigns the port and the launcher sets production mode. */
  const PLATFORM = ['NODE_ENV', 'SERVER_PORT'];
  /** Egg-only settings read by the installer and the updater, not by the application. */
  const DEPLOYMENT = [
    'RELEASE_TAG',
    'ALLOW_UNVERIFIED_RELEASE',
    'NEXT_TELEMETRY_DISABLED',
    'AUTO_UPDATE_ENABLED',
    'AUTO_UPDATE_ON_STARTUP',
    'AUTO_UPDATE_CHANNEL',
    'AUTO_UPDATE_INTERVAL_HOURS',
    'AUTO_UPDATE_WINDOW_UTC',
    'AUTO_UPDATE_HEALTH_SECONDS',
    'AUTO_UPDATE_GITHUB_TOKEN',
  ];

  it('offers every application setting in the egg', () => {
    expect(schemaKeys.length).toBeGreaterThan(40);
    expect(schemaKeys.filter((key) => !PLATFORM.includes(key) && !eggKeys.has(key))).toEqual([]);
  });

  it('has no egg variable that nothing reads', () => {
    expect([...eggKeys].filter((key) => !schemaKeys.includes(key) && !DEPLOYMENT.includes(key))).toEqual([]);
  });

  it('documents every setting in .env.example', () => {
    const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]));
    const missing = [...schemaKeys, ...DEPLOYMENT].filter(
      (key) => key !== 'NODE_ENV' && key !== 'NEXT_TELEMETRY_DISABLED' && !documented.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('ships no real credentials', () => {
    for (const variable of egg.variables)
      if (SECRET_VARIABLES.includes(variable.env_variable))
        expect(variable.default_value, variable.env_variable).toBe('');
  });
});
