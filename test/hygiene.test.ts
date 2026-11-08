import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-typecheck', 'coverage', '.doctest', 'outbox']);
const TEXT = /\.(ts|tsx|js|mjs|json|md|html|css|yml|yaml|txt|sh)$/u;
// Bidirectional controls, line/paragraph separators, zero-width characters and the BOM.
// Written with \u{...} escapes so no raw invisible character appears in this file.
const INVISIBLE = /[\u{202A}-\u{202E}\u{2066}-\u{2069}\u{2028}\u{2029}\u{200B}-\u{200F}\u{FEFF}\u{2060}-\u{2064}]/u;
// In code, also no-break and other special spaces and soft hyphens: they must be written as escapes.
const SPECIAL_SPACE = /[\u{A0}\u{AD}\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}]/u;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (TEXT.test(name) || ['LICENSE', 'NOTICE', '.gitignore', '.editorconfig', '.npmrc'].includes(name)) out.push(path);
  }
  return out;
}

const all = files(ROOT);
const rel = (p: string): string => relative(ROOT, p);
const source = all.filter((p) => rel(p).startsWith('src/') && p.endsWith('.ts'));

describe('repository hygiene', () => {
  it('scans the repository', () => {
    expect(all.length).toBeGreaterThan(40);
    expect(source.length).toBeGreaterThan(20);
  });

  it('no raw bidirectional, separator or zero-width characters anywhere (Trojan Source)', () => {
    expect(all.filter((p) => INVISIBLE.test(readFileSync(p, 'utf8'))).map(rel)).toEqual([]);
  });

  it('no raw special spaces in code; they are written as escapes', () => {
    const code = all.filter((p) => /\.(ts|mjs|js)$/u.test(p));
    expect(code.filter((p) => SPECIAL_SPACE.test(readFileSync(p, 'utf8'))).map(rel)).toEqual([]);
  });

  it('the scanners detect what they look for', () => {
    expect(INVISIBLE.test(`a${String.fromCodePoint(0x202e)}b`)).toBe(true);
    expect(INVISIBLE.test(`a${String.fromCodePoint(0x200b)}b`)).toBe(true);
    expect(SPECIAL_SPACE.test(`a${String.fromCodePoint(0xa0)}b`)).toBe(true);
    expect(INVISIBLE.test('plain text, äöü, ąčęėįšųūž, Ελληνικά')).toBe(false);
  });

  it('library code never builds HTML from strings in the DOM, never evaluates code, never spawns processes', () => {
    const forbidden = [/\.innerHTML\b/u, /\.outerHTML\b/u, /insertAdjacentHTML/u, /\beval\(/u, /new Function\(/u, /document\.write/u, /child_process/u, /setTimeout\(\s*['"`]/u];
    for (const path of source) {
      const text = readFileSync(path, 'utf8');
      for (const pattern of forbidden) expect(pattern.test(text), `${rel(path)} ${pattern.source}`).toBe(false);
    }
  });

  it('dynamic import is used once, with a constant module name', () => {
    const imports = source.flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/await import\(([^)]*)\)/gu)].map((m) => `${rel(p)}:${m[1] ?? ''}`));
    expect(imports).toEqual(["src/cli/cli.ts:'yaml'"]);
  });

  it('every source file carries the licence header', () => {
    for (const path of source) {
      const text = readFileSync(path, 'utf8');
      expect(text, rel(path)).toContain('Copyright 2026 MB AFKzona Group');
      expect(text, rel(path)).toContain('SPDX-License-Identifier: Apache-2.0');
    }
  });

  it('package.json: zero runtime dependencies, exact dev versions, no install scripts, files allow-list', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown> & {
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
      files: string[];
      engines: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional: boolean }>;
    };
    expect(pkg['dependencies']).toBeUndefined();
    for (const [name, version] of Object.entries(pkg.devDependencies)) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/u);
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) expect(pkg.scripts[hook]).toBeUndefined();
    expect(pkg.files).toContain('dist/');
    expect(pkg.license).toBe('Apache-2.0');
    expect(pkg.engines['node']).toBe('>=22');
    for (const peer of ['react', 'vue', 'yaml']) expect(pkg.peerDependenciesMeta[peer]?.optional).toBe(true);
  });

  it('CI runs only on pull requests and on demand, with pinned actions and read-only permissions', () => {
    for (const name of readdirSync(join(ROOT, '.github/workflows'))) {
      const text = readFileSync(join(ROOT, '.github/workflows', name), 'utf8');
      expect(text, name).not.toMatch(/^\s*(push|schedule):/mu);
      expect(text, name).toMatch(/permissions:\s*\n\s*contents: read/u);
      for (const m of text.matchAll(/uses:\s*(\S+)/gu)) expect(m[1], name).toMatch(/@[0-9a-f]{40}$/u);
    }
  });
});
