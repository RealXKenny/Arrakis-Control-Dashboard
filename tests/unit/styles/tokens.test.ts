import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config';

const root = process.cwd();
const tokens = readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? cssFiles(full) : full.endsWith('.css') ? [full] : [];
  });
}

const defined = new Map(
  [...tokens.matchAll(/--color-([a-z]+-[a-z0-9]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
);

describe('colour tokens', () => {
  it('mirror the Tailwind palette exactly, so plain CSS and utilities cannot drift apart', () => {
    const palette = config.theme.extend.colors as Record<string, Record<string, string>>;
    const expected = new Map(
      Object.entries(palette).flatMap(([group, shades]) =>
        Object.entries(shades).map(([shade, value]) => [`${group}-${shade}`, value.toLowerCase()] as const),
      ),
    );
    expect(defined).toEqual(expected);
  });

  it('define every colour variable the stylesheets read; an undefined one silently voids the whole declaration', () => {
    const used = new Set<string>();
    for (const file of cssFiles(path.join(root, 'src'))) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/var\(--color-([a-z]+-[a-z0-9]+)\)/g)) used.add(name!);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
