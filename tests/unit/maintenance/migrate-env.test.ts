import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateEnv, migrateEnvFile } from '../../../scripts/maintenance/migrate-env.mjs';

const template = [
  'DUNE_API_URL=http://x',
  'DUNE_API_KEY=replace_me',
  'DUNE_ADAPTER_TOKEN=replace_me',
  'NEW_SETTING=1',
  '',
].join('\n');
const old = [
  '# my comment',
  'CONSOLE_URL=http://console:8088',
  'CONSOLE_API_KEY="member-secret-value"',
  'ADAPTER_TOKEN=adapter-secret-value',
  'SEASON_AUTOMATION_ENABLED=true',
  'MY_CUSTOM=keep-me',
  '',
].join('\n');

describe('env migration', () => {
  it('renames, removes and adds without ever reporting values', () => {
    const result = migrateEnv(old, template);
    expect(result.text).toContain('DUNE_API_URL=http://console:8088');
    expect(result.text).toContain('DUNE_API_KEY="member-secret-value"');
    expect(result.text).toContain('DUNE_ADAPTER_TOKEN=adapter-secret-value');
    expect(result.text).not.toMatch(/^CONSOLE_|^ADAPTER_TOKEN|SEASON_AUTOMATION/m);
    expect(result.text).toContain('# my comment');
    expect(result.text).toContain('MY_CUSTOM=keep-me');
    expect(result.text).toContain('# NEW_SETTING=1');
    const report = JSON.stringify(result.changes) + JSON.stringify(result.warnings);
    expect(report).not.toMatch(/secret-value|console:8088/);
    expect(result.changed).toBe(true);
  });
  it('prefers the administrator key when both old keys exist, with a scope warning', () => {
    const result = migrateEnv('CONSOLE_API_KEY=member\nADMIN_CONSOLE_API_KEY=admin\n', template);
    expect(result.text).toContain('DUNE_API_KEY=admin');
    expect(result.text).not.toContain('=member');
    expect(result.warnings.join(' ')).toContain('scope');
  });
  it('never overwrites a value that is already set under the new name', () => {
    const result = migrateEnv('DUNE_API_KEY=current\nCONSOLE_API_KEY=old\n', template);
    expect(result.text).toContain('DUNE_API_KEY=current');
    expect(result.text).not.toContain('old');
  });
  it('is idempotent and preserves CRLF line endings', () => {
    const once = migrateEnv(old.replace(/\n/g, '\r\n'), template);
    expect(once.text).toContain('\r\n');
    expect(once.text).not.toMatch(/[^\r]\n/);
    const twice = migrateEnv(once.text, template);
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
  });
  it('writes a backup and the migrated file atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'env-migrate-'));
    writeFileSync(join(directory, '.env'), old);
    writeFileSync(join(directory, '.env.example'), template);
    const result = migrateEnvFile(directory);
    expect(result.applied).toBe(true);
    expect(readFileSync(join(directory, '.env'), 'utf8')).toContain('DUNE_API_KEY="member-secret-value"');
    expect(readdirSync(directory).some((name) => name.startsWith('.env.bak-'))).toBe(true);
    expect(readFileSync(result.backup!, 'utf8')).toBe(old);
    expect(migrateEnvFile(directory).changed).toBe(false);
  });
  it('does nothing without an .env file', () => {
    expect(migrateEnvFile(mkdtempSync(join(tmpdir(), 'env-none-'))).skipped).toBe(true);
  });
});
