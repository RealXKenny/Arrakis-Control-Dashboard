import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve('src');
const files = fs
  .readdirSync(root, { recursive: true })
  .map(String)
  .filter((p) => /\.tsx?$/.test(p))
  .map((p) => path.join(root, p));
const normalize = (file: string) => path.relative(root, file).replaceAll('\\', '/');

function imports(file: string, text = fs.readFileSync(file, 'utf8')): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
    // Dev note: Next hides server props from browsers; everything else gets frisked.
    if (/^pages\/(?!api\/)/.test(normalize(file))) {
      const declaration = ts.isVariableDeclaration(node) ? node.parent.parent : node;
      const isServerProps =
        (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'getServerSideProps';
      if (
        isServerProps &&
        declaration.parent === source &&
        ts.canHaveModifiers(declaration) &&
        ts.getModifiers(declaration)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      )
        return;
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      result.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

describe('module boundaries', () => {
  it('excludes page server props while retaining browser and non-page dynamic imports', () => {
    const text = `
      export const getServerSideProps = async () => { await import('../lib/session-store'); return { props: {} }; };
      export default function Page() { import('../lib/redis'); return null; }
    `;
    expect(imports(path.join(root, 'pages/index.tsx'), text)).toEqual(['../lib/redis']);
    expect(imports(path.join(root, 'components/Example.tsx'), text)).toEqual(['../lib/session-store', '../lib/redis']);
  });
  it('keeps server modules out of the transitive browser import graph', () => {
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      expect(normalize(file)).not.toMatch(
        /(^infrastructure\/|^config\/env\.ts$|\/server\/|^lib\/(assert-server|logger)\.ts$|^lib\/(redis|security)\/)/,
      );
      for (const spec of imports(file)) {
        expect(spec).not.toBe('server-only');
        if (!spec.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), spec);
        const resolved = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find((p) =>
          files.includes(p),
        );
        if (resolved) visit(resolved);
      }
    }
    for (const file of files.filter((p) => /^(pages\/(?!api\/)|instrumentation-client)/.test(normalize(p))))
      visit(file);
  });

  it('keeps every API route behind the common handler', () => {
    const routes = files.filter(
      (p) => normalize(p).startsWith('pages/api/') && normalize(p) !== 'pages/api/assets/[...path].ts',
    );
    expect(routes).toHaveLength(42);
    for (const route of routes) {
      const method = /\/guilds\/\[guildId\]\/(index|members\/\[playerId\])\.ts$/.test(normalize(route))
        ? 'DELETE'
        : /\/auth\/logout\/|\/blueprints\/(publish|remove)\.ts$|\/bases\/import\.ts$|\/bases\/\[[^\]]+\]\/marketplace\.ts$|\/admin\/(execute|upload)\.ts$|\/(?:messages|support)\/(send|read)\.ts$|\/members\/\[playerId\]\/(promote|demote)\.ts$/.test(
              normalize(route),
            )
          ? 'POST'
          : 'GET';
      expect(fs.readFileSync(route, 'utf8').replaceAll("'", '"')).toContain(
        `return runPagesApiHandler(req, res, "${method}", ${method})`,
      );
      expect(imports(route).some((spec) => spec.includes('/features/'))).toBe(true);
    }
  });
});

describe('repository organization', () => {
  it('retires obsolete homes and keeps feature implementations out of route folders', () => {
    for (const file of files) {
      expect(normalize(file)).not.toMatch(/^(modules|infrastructure)\//);
      expect(normalize(file)).not.toMatch(/^app\/.*\/_components\//);
      expect(normalize(file)).not.toMatch(/^app\/(globals|tokens|legacy-bridge)\.css$/);
    }
  });

  it('uses predictable kebab-case source filenames with framework exceptions', () => {
    const special = /^(page|layout|route|loading|error|not-found|template|default|global-error|instrumentation)\.tsx?$/;
    for (const file of files) {
      const name = path.basename(file);
      if (special.test(name) || name.startsWith('[') || name === 'next-auth.d.ts') continue;
      expect(name, normalize(file)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.d)?\.(ts|tsx)$/);
    }
  });

  it('detects static and dynamic dependency cycles', () => {
    const available = new Set(files.map((file) => path.resolve(file)));
    const graph = new Map<string, string[]>();
    for (const file of files) {
      const absolute = path.resolve(file);
      const edges = [];
      for (const spec of imports(file)) {
        if (!spec.startsWith('.')) continue;
        const base = path.resolve(path.dirname(absolute), spec);
        const resolved = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, 'index.ts'),
          path.join(base, 'index.tsx'),
        ].find((candidate) => available.has(candidate));
        if (resolved) edges.push(resolved);
      }
      graph.set(absolute, edges);
    }
    const state = new Map<string, number>();
    const stack: string[] = [];
    const cycles: string[] = [];
    function visit(file: string) {
      if (state.get(file) === 2) return;
      if (state.get(file) === 1) {
        const start = stack.indexOf(file);
        cycles.push([...stack.slice(start), file].map((entry) => normalize(entry)).join(' -> '));
        return;
      }
      state.set(file, 1);
      stack.push(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      stack.pop();
      state.set(file, 2);
    }
    for (const file of graph.keys()) visit(file);
    expect(cycles).toEqual([]);
  });

  it('allows only documented files in the repository root', () => {
    const allowed = new Set([
      '.env',
      '.env.example',
      '.gitattributes',
      '.gitignore',
      '.prettierignore',
      '.prettierrc.json',
      'AGENTS.md',
      'CHANGELOG.md',
      'LICENSE',
      'NOTICE.md',
      'README.md',
      'SECURITY_AUDIT.md',
      'SECURITY_PRODUCTION_READINESS.md',
      'SECURITY_REAUDIT.md',
      'SECURITY_REMEDIATION.md',
      'eslint.config.mjs',
      'next-env.d.ts',
      'next.config.ts',
      'package-lock.json',
      'package.json',
      'playwright.config.ts',
      'postcss.config.mjs',
      'tailwind.config.ts',
      'tsconfig.json',
      'vitest.config.mjs',
    ]);
    const rootFiles = fs
      .readdirSync(path.dirname(root), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== 'tsconfig.tsbuildinfo')
      .map((entry) => entry.name);
    expect(rootFiles.filter((file) => !allowed.has(file))).toEqual([]);
  });
});
