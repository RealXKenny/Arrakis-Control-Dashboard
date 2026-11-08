import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPterodactylEgg } from '../../../scripts/deployment/build-pterodactyl-egg.mjs';

const egg = createPterodactylEgg();

describe('Pterodactyl dashboard egg', () => {
  it('keeps the privileged administrator key hidden and non-editable for ordinary panel users', () => {
    const key = egg.variables.find((variable) => variable.env_variable === 'ADMIN_CONSOLE_API_KEY');
    expect(key).toMatchObject({ default_value: '', user_viewable: false, user_editable: false });
  });

  it('builds the latest GitHub release with the standard Node.js runtime', () => {
    expect(egg.meta.version).toBe('PTDL_v2');
    expect(Object.values(egg.docker_images)).toEqual(['ghcr.io/pterodactyl/yolks:nodejs_22']);
    expect(egg.startup).toContain('/home/container');
    expect(egg.startup).toContain('scripts/server-launcher.mjs start');
    // The launcher the egg starts must exist in the repository, or a fresh install cannot boot.
    expect(existsSync(egg.startup.match(/node (\S+) start/)![1])).toBe(true);
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
      'CONSOLE_URL',
      'CONSOLE_API_KEY',
      'ADAPTER_TOKEN',
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
    expect(byName.get('ADMIN_DISCORD_IDS')).toMatchObject({ default_value: '' });
    expect(byName.get('ADMIN_HIGH_RISK_REAUTH_MINUTES')?.default_value).toBe('60');
    expect(byName.get('ADMIN_REAUTH_HOURS')?.default_value).toBe('12');
    expect(byName.get('REDIS_ALLOW_INSECURE')?.default_value).toBe('false');
    expect(byName.get('REDIS_REQUIRE_TLS')?.default_value).toBe('false');
    expect(byName.get('AUDIT_LOG_STDOUT')?.default_value).toBe('true');
    expect(byName.get('AUDIT_LOG_REDIS')?.default_value).toBe('true');
    expect(byName.get('AUDIT_LOG_MAX_ENTRIES')?.default_value).toBe('10000');
    // The administrator list rule accepts Discord IDs only.
    const rule = byName.get('ADMIN_DISCORD_IDS')!.rules;
    const pattern = new RegExp(rule.slice(rule.indexOf('/') + 1, rule.lastIndexOf('/')));
    expect(pattern.test('456084885220884480, 123')).toBe(true);
    expect(pattern.test('everyone')).toBe(false);
    expect(pattern.test('1;2')).toBe(false);
  });
});
