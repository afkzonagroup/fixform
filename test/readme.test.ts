import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { createRepairForm, validateRepairForm } from '../src/index.js';

/**
 * Doctest: every ```ts block in README.md preceded by `<!-- doctest -->` is
 * written to a temporary module and executed. A block fails by throwing.
 * The JSON quick-start file is checked too.
 */
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const blocks = [...readme.matchAll(/<!-- doctest -->\s*```ts\n([\s\S]*?)```/gu)].map((match) => match[1] ?? '');
const dir = new URL('./.doctest/', import.meta.url);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('README examples', () => {
  it('has examples marked for testing', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  it.each(blocks.map((code, index) => [index, code] as const))('example %i runs', async (index, code) => {
    mkdirSync(dir, { recursive: true });
    const file = new URL(`example-${String(index)}.ts`, dir);
    writeFileSync(file, `${code}\nexport {};\n`);
    await expect(import(/* @vite-ignore */ file.href)).resolves.toBeDefined();
  });

  it('the quick-start form.json is valid when the time is set with --provided-at', () => {
    const json = /Save this as `form.json`:\s*```json\n([\s\S]*?)```/u.exec(readme)?.[1] ?? '';
    const input = JSON.parse(json) as unknown;
    expect(validateRepairForm(input, { providedAt: '2026-11-09T08:00:00Z' }).ok).toBe(true);
    expect(createRepairForm(input, { providedAt: '2026-11-09T08:00:00Z' }).validity.lastDay).toBe('2026-12-09');
  });
});
