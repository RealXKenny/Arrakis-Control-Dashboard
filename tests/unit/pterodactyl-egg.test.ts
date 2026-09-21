import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const egg = JSON.parse(readFileSync(resolve('pterodactyl/egg-arrakis-control-dashboard.json'), 'utf8')) as {
  meta: { version: string };
  docker_images: Record<string, string>;
  startup: string;
  variables: Array<{ env_variable: string; default_value: string; rules: string }>;
};

describe('Pterodactyl dashboard egg', () => {
  it('uses the published image and built application', () => {
    expect(egg.meta.version).toBe('PTDL_v2');
    expect(Object.values(egg.docker_images)).toEqual(['ghcr.io/realxkenny/arrakis-control-dashboard:latest']);
    expect(egg.startup).toContain('/opt/arrakis-dashboard');
    expect(egg.startup).toContain('server-launcher.mjs start');
  });

  it('exposes every required production setting and leaves the Wings port alone', () => {
    const variables = new Map(egg.variables.map((variable) => [variable.env_variable, variable]));
    expect(variables.size).toBe(egg.variables.length);
    expect(variables.has('SERVER_PORT')).toBe(false);
    expect(variables.get('SERVER_HOSTNAME')?.default_value).toBe('0.0.0.0');
    for (const key of [
      'CONSOLE_URL',
      'CONSOLE_API_KEY',
      'ADAPTER_TOKEN',
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
      'DISCORD_GUILD_ID',
      'VERIFIED_MEMBER_ROLE_ID',
      'APP_URL',
      'REDIS_URL',
    ]) {
      expect(variables.get(key)?.default_value, key).toBe('');
      expect(variables.get(key)?.rules, key).toContain('required');
    }
  });
});
