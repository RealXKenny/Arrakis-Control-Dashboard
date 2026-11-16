import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps native buttons and card articles behind the shared UI primitives', () => {
  const violations: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'assets') walk(file);
        continue;
      }
      if (!file.endsWith('.tsx')) continue;
      const name = relative(process.cwd(), file).replaceAll('\\', '/');
      if (['src/components/ui/button.tsx', 'src/components/ui/card.tsx'].includes(name)) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (['button', 'article'].includes(node.tagName.getText(source)))
            violations.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  walk(join(process.cwd(), 'src'));
  expect(violations).toEqual([]);
});
