import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDocs, slug } from '../../../scripts/maintenance/check-docs.mjs';

const read = (path: string) => readFileSync(path, 'utf8');
const envSource = read('src/config/env.ts');
const schemaBlock = envSource.slice(
  envSource.indexOf('const serverEnvSchema'),
  envSource.indexOf('export type ServerEnv'),
);
const schemaVariables = [...schemaBlock.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);

describe('documentation', () => {
  it('has no broken relative links or anchors, retired report references, or stub pages', () => {
    const { files, problems } = checkDocs();
    expect(files).toBeGreaterThan(50);
    expect(problems).toEqual([]);
  });

  it('documents every environment variable the schema accepts', () => {
    const page = read('docs/configuration/environment-variables.md');
    expect(schemaVariables.length).toBeGreaterThan(25);
    for (const name of schemaVariables) expect(page, name).toContain(`\`${name}\``);
  });

  it('lists every .env.example variable in the environment reference', () => {
    const page = read('docs/configuration/environment-variables.md');
    const example = [...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
    for (const name of example) expect(page, name).toContain(`\`${name}\``);
  });

  it('only names npm scripts that exist', () => {
    const scripts = Object.keys(JSON.parse(read('package.json')).scripts as Record<string, string>);
    const pages = [
      'docs/reference/commands.md',
      'docs/development/development-workflow.md',
      'docs/development/testing.md',
    ];
    for (const path of pages)
      for (const match of read(path).matchAll(/npm run ([a-z][a-z:-]*)/g))
        expect(scripts, `${path}: npm run ${match[1]}`).toContain(match[1]);
  });

  it('documents every npm script in the command reference', () => {
    const scripts = Object.keys(JSON.parse(read('package.json')).scripts as Record<string, string>);
    const page = read('docs/reference/commands.md');
    for (const name of scripts) expect(page, name).toMatch(new RegExp(`npm (run )?${name.replace(':', ':')}`));
  });

  it('keeps the high-risk operation list in the administrator guide in step with the code', async () => {
    const { LOW_RISK_MUTATING_OPERATIONS } = await import('../../../src/features/admin/server/risk');
    const page = read('docs/features/administrator-panel.md');
    for (const id of LOW_RISK_MUTATING_OPERATIONS) expect(page, id).toContain(id);
  });

  it('keeps the Pterodactyl variable guide aligned with the generated egg', async () => {
    const { createPterodactylEgg } = await import('../../../scripts/deployment/build-pterodactyl-egg.mjs');
    const page = read('docs/installation/pterodactyl.md');
    for (const variable of createPterodactylEgg().variables)
      expect(page, variable.env_variable).toContain(variable.env_variable);
  });

  it('retains the upstream attribution on the RedBlink integration page', () => {
    const page = read('docs/integrations/redblink-dune-docker.md');
    expect(page).toContain('Copyright (c) 2026 RedBlink');
    expect(page).toContain('https://github.com/Red-Blink/dune-awakening-selfhost-docker');
    expect(read('NOTICE.md')).toContain('RedBlink');
  });

  it('computes GitHub-style heading slugs', () => {
    expect(slug('`DELETE /api/v2/admin/sessions`')).toBe('delete-apiv2adminsessions');
    expect(slug('What was verified, and what was not')).toBe('what-was-verified-and-what-was-not');
    expect(slug('3. Postdeployment')).toBe('3-postdeployment');
  });
});
