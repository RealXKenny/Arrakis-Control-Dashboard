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

function imports(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
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
  it('keeps server modules out of the transitive browser import graph', () => {
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      expect(normalize(file)).not.toMatch(
        /(^infrastructure\/|^config\/env\.ts$|\/server\/|^lib\/(assert-server|logger|redis|session-store|rate-limit)\.ts$)/,
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
    const routes = files.filter((p) => normalize(p).startsWith('pages/api/'));
    expect(routes).toHaveLength(13);
    for (const route of routes) {
      const method = /\/auth\/logout\/|\/blueprints\/(publish|remove)\.ts$|\/bases\/import\.ts$/.test(normalize(route))
        ? 'POST'
        : 'GET';
      expect(fs.readFileSync(route, 'utf8').replaceAll("'", '"')).toContain(
        `return runPagesApiHandler(req, res, "${method}", ${method})`,
      );
      expect(imports(route).some((spec) => spec.includes('/modules/'))).toBe(true);
    }
  });
});
