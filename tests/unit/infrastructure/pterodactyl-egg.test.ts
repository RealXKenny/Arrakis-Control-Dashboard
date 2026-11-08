import { describe, expect, it } from 'vitest';
import { createPterodactylEgg } from '../../../src/config/pterodactyl-egg.mjs';

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
    expect(egg.startup).toContain('server-launcher.mjs start');
    expect(JSON.parse(egg.config.startup)).toEqual({ done: 'Arrakis Control Dashboard is listening' });
    expect(egg.scripts.installation.script).toContain('/releases/latest');
    expect(egg.scripts.installation.script).toContain('npm ci');
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
