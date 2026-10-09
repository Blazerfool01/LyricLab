import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const domainRoot = resolve(process.cwd(), 'src/domain');
const foundationRoot = join(domainRoot, 'foundation');
const isRuntimeFile = (file: string) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !['test-context.ts', 'contracts.typecheck.ts'].includes(file);
function inspect(source: string, file: string) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: string[] = [], violations: string[] = [];
  const add = (node: ts.Node, message: string) => violations.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${message}`);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every(element => element.isTypeOnly));
      if (!onlyTypes) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const target = node.expression;
      if (target.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
        else add(node, 'Opaque dynamic runtime import bypasses the reviewed pure dependency graph.');
      }
      if (ts.isIdentifier(target) && ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Date'].includes(target.text)) add(node, `Ambient/network call ${target.text} is forbidden in the pure domain.`);
      if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
        const object = target.expression.text, method = target.name.text;
        if ((object === 'Math' && method === 'random') || (object === 'Date' && method === 'now') || (object === 'crypto' && method === 'randomUUID') || ['localStorage', 'sessionStorage', 'window', 'navigator'].includes(object) || (object === 'document' && ['createElement', 'querySelector', 'getElementById'].includes(method))) add(node, `Impure browser/ambient call ${object}.${method} is forbidden.`);
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && (['XMLHttpRequest', 'WebSocket', 'EventSource'].includes(node.expression.text) || (node.expression.text === 'Date' && !node.arguments?.length))) add(node, `Ambient/network constructor ${node.expression.text} is forbidden.`);
    ts.forEachChild(node, visit);
  };
  visit(ast); return { imports, violations };
}

describe('foundation runtime dependency boundaries', () => {
  it('keeps the complete foundation runtime graph inside pure domain modules', () => {
    const pending = readdirSync(foundationRoot).filter(isRuntimeFile).map(file => join(foundationRoot, file)), visited = new Set<string>(), violations: string[] = [];
    while (pending.length) {
      const file = pending.pop()!; if (visited.has(file)) continue;
      visited.add(file);
      const findings = inspect(readFileSync(file, 'utf8'), relative(domainRoot, file)); violations.push(...findings.violations);
      for (const specifier of findings.imports) {
        if (!specifier.startsWith('.')) { violations.push(`${relative(domainRoot, file)} imports external runtime dependency ${specifier}`); continue; }
        const dependency = resolve(dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`);
        const dependencyFromDomain = relative(domainRoot, dependency);
        if (dependencyFromDomain === '..' || dependencyFromDomain.startsWith(`..${sep}`) || isAbsolute(dependencyFromDomain) || dependency === join(domainRoot, 'project.ts')) { violations.push(`${relative(domainRoot, file)} imports browser/project boundary ${specifier}`); continue; }
        pending.push(dependency);
      }
    }
    expect(visited.size).toBeGreaterThan(12);
    expect(violations).toEqual([]);
  });

  it('checks executable syntax while allowing explicit seeds, deterministic timestamps and document values', () => {
    const valid = inspect(`import type {Project} from '../types';
      const explanatory = 'Math.random() localStorage.fetch()';
      // new Date() and fetch() are comments, not dependencies.
      const document = {revision: 'fixed'};
      Date.parse('2026-10-08T00:00:00.000Z'); structuredClone(document); new TextEncoder();`, 'fixture.ts');
    expect(valid).toEqual({ imports: [], violations: [] });
    const invalid = inspect(`import React from 'react'; import('openai');
      Math.random(); Date.now(); crypto.randomUUID(); new Date();
      localStorage.setItem('x','y'); navigator.sendBeacon('/x'); fetch('/x');`, 'fixture.ts');
    expect(invalid.imports).toEqual(['react', 'openai']);
    expect(invalid.violations).toHaveLength(7);
  });
});
