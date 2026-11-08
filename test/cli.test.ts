import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/cli.js';
import { MAX_INPUT_BYTES } from '../src/cli/files.js';
import { createRepairForm, verifyRepairForm } from '../src/index.js';
import { mutableInput, validInput } from './fixtures.js';

let dir: string;
let outside: string;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'fixform-cli-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'fixform-outside-')));
  writeFileSync(join(dir, 'form.json'), JSON.stringify(validInput()));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await runCli(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd: dir, now: () => Date.UTC(2026, 10, 9, 8, 0) });
  return { code, out, err };
}

const file = (name: string): string => join(dir, name);

describe('fixform CLI', () => {
  it('renders HTML (default), text, Markdown and JSON', async () => {
    const html = await run('render', file('form.json'));
    expect(html.code).toBe(0);
    expect(html.out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect((await run('render', file('form.json'), '--format', 'text')).out).toContain('EUROPEAN REPAIR INFORMATION FORM');
    expect((await run('render', file('form.json'), '--format', 'md')).out.startsWith('# EUROPEAN REPAIR INFORMATION FORM')).toBe(true);
    const json = await run('render', file('form.json'), '--format', 'json');
    expect(verifyRepairForm(JSON.parse(json.out)).ok).toBe(true);
  });

  it('re-renders a stored record after verifying it, and refuses a tampered one', async () => {
    const record = createRepairForm(validInput());
    writeFileSync(file('record.json'), JSON.stringify(record));
    const ok = await run('render', file('record.json'), '--format', 'text');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain(record.id);
    writeFileSync(file('tampered.json'), JSON.stringify({ ...record, form: { ...record.form, good: 'Other' } }));
    const bad = await run('render', file('tampered.json'));
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('Record check failed');
    expect((await run('render', file('record.json'), '--lang', 'de')).code).toBe(2);
    expect((await run('verify', file('record.json'))).out).toBe(`ok ${record.id} ${record.integrity}\n`);
    expect((await run('verify', file('tampered.json'))).code).toBe(1);
  });

  it('--lang and --provided-at', async () => {
    const de = await run('render', file('form.json'), '--lang', 'de', '--format', 'text');
    expect(de.out).toContain('EUROPÄISCHES FORMULAR FÜR REPARATURINFORMATIONEN');
    expect((await run('render', file('form.json'), '--lang', 'xx')).code).toBe(2);
    const input = mutableInput();
    Reflect.deleteProperty(input.validity, 'providedAt');
    writeFileSync(file('no-time.json'), JSON.stringify(input));
    const now = await run('render', file('no-time.json'), '--provided-at', 'now', '--format', 'json');
    expect((JSON.parse(now.out) as { form: { validity: { providedAt: string } } }).form.validity.providedAt).toBe('2026-11-09T08:00:00.000Z');
    expect((await run('render', file('no-time.json'))).code).toBe(1);
    expect((await run('render', file('form.json'), '--provided-at', 'now')).code).toBe(1);
  });

  it('validate: exit codes, issues and warnings', async () => {
    expect(await run('validate', file('form.json'))).toEqual({ code: 0, out: 'valid\n', err: '' });
    const input = mutableInput();
    input['completionDays'] = 0;
    input.validity['providedAt'] = '2026-07-01T10:00:00Z';
    Reflect.deleteProperty(input, 'diagnostic');
    writeFileSync(file('bad.json'), JSON.stringify(input));
    const bad = await run('validate', file('bad.json'));
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('completionDays: range');
    input['completionDays'] = 3;
    writeFileSync(file('early.json'), JSON.stringify(input));
    const early = await run('validate', file('early.json'));
    expect(early.code).toBe(0);
    expect(early.err).toContain('before_application_date');
  });

  it('reads YAML safely: core schema, no aliases, no duplicate keys, no prototype keys', async () => {
    const yaml = (await import('yaml')).stringify(validInput());
    writeFileSync(file('form.yaml'), yaml);
    expect((await run('validate', file('form.yaml'))).code).toBe(0);
    writeFileSync(file('alias.yaml'), `${yaml}\nx: &a [1]\ny: *a\n`);
    expect((await run('validate', file('alias.yaml'))).code).toBe(2);
    writeFileSync(file('dup.yml'), 'language: en\nlanguage: de\n');
    expect((await run('validate', file('dup.yml'))).code).toBe(2);
    writeFileSync(file('proto.yaml'), `__proto__:\n  polluted: true\n${yaml}`);
    const proto = await run('validate', file('proto.yaml'));
    expect(proto.code).toBe(1);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    writeFileSync(file('bomb.yaml'), 'a: &a ["x","x"]\nb: &b [*a,*a]\nc: &c [*b,*b]\n');
    expect((await run('validate', file('bomb.yaml'))).code).toBe(2);
  });

  it('rejects invalid JSON, non-regular files, missing files and oversized input', async () => {
    writeFileSync(file('broken.json'), '{');
    expect((await run('validate', file('broken.json'))).code).toBe(2);
    expect((await run('validate', dir)).err).toContain('not a regular file');
    expect((await run('validate', file('missing.json'))).err).toContain('cannot open');
    writeFileSync(file('big.json'), ' '.repeat(MAX_INPUT_BYTES + 1));
    expect((await run('validate', file('big.json'))).err).toContain('larger than');
    writeFileSync(file('latin1.json'), Buffer.from([0x22, 0xe9, 0x22]));
    expect((await run('validate', file('latin1.json'))).err).toContain('not valid UTF-8');
    if (process.platform !== 'win32') expect((await run('validate', '/dev/zero')).err).toContain('not a regular file');
    expect((await run('validate', 'a\u{0}b')).code).toBe(2);
  });

  it('writes output only inside the working directory, exclusively, with mode 0600', async () => {
    const ok = await run('render', file('form.json'), '--out', 'out/form.html');
    expect(ok.code).toBe(2);
    mkdirSync(file('out'));
    const written = await run('render', file('form.json'), '--out', 'out/form.html');
    expect(written.code).toBe(0);
    expect(readFileSync(file('out/form.html'), 'utf8').startsWith('<!DOCTYPE html>')).toBe(true);
    if (process.platform !== 'win32') expect(statSync(file('out/form.html')).mode & 0o777).toBe(0o600);
    const again = await run('render', file('form.json'), '--out', 'out/form.html');
    expect(again.code).toBe(2);
    expect(again.err).toContain('--force');
    expect((await run('render', file('form.json'), '--out', 'out/form.html', '--force')).code).toBe(0);
    for (const target of ['../escape.html', join(outside, 'abs.html'), '/etc/fixform.html', '.', '']) {
      const r = await run('render', file('form.json'), '--out', target);
      expect(r.code, target).toBe(2);
    }
  });

  it('does not follow symbolic links out of the working directory', async () => {
    if (process.platform === 'win32') return;
    symlinkSync(outside, file('link-dir'));
    const viaDir = await run('render', file('form.json'), '--out', 'link-dir/x.html');
    expect(viaDir.code).toBe(2);
    expect(viaDir.err).toContain('inside the current directory');
    writeFileSync(join(outside, 'victim.html'), 'original');
    symlinkSync(join(outside, 'victim.html'), file('victim-link.html'));
    expect((await run('render', file('form.json'), '--out', 'victim-link.html')).code).toBe(2);
    expect((await run('render', file('form.json'), '--out', 'victim-link.html', '--force')).code).toBe(2);
    expect(readFileSync(join(outside, 'victim.html'), 'utf8')).toBe('original');
  });

  it('usage errors', async () => {
    expect((await run()).out).toContain('Usage');
    expect((await run('--help')).out).toContain('Usage');
    expect((await run('--version')).out).toBe('0.1.0\n');
    expect((await run('nope')).code).toBe(2);
    expect((await run('render')).code).toBe(2);
    expect((await run('validate')).code).toBe(2);
    expect((await run('verify')).code).toBe(2);
    expect((await run('render', 'a', 'b')).code).toBe(2);
    expect((await run('render', file('form.json'), '--evil')).code).toBe(2);
    expect((await run('render', file('form.json'), '--format')).code).toBe(2);
    expect((await run('render', file('form.json'), '--format', 'pdf')).code).toBe(2);
    expect((await run('render', file('form.json'), '--out', 'a', '--out', 'b')).code).toBe(2);
    expect((await run('validate', file('form.json'), '--out', 'x')).code).toBe(2);
    expect((await run('languages')).out.split('\n')).toHaveLength(25);
    expect(JSON.parse((await run('schema')).out)).toHaveProperty('$schema');
  });

  it('the built binary runs (requires npm run build)', async () => {
    const bin = new URL('../dist/cli/bin.js', import.meta.url).pathname;
    const { stdout } = await promisify(execFile)(process.execPath, [bin, 'render', file('form.json'), '--format', 'text']);
    expect(stdout).toContain('EUROPEAN REPAIR INFORMATION FORM');
    await expect(promisify(execFile)(process.execPath, [bin, 'validate', file('bad.json')])).rejects.toMatchObject({ code: 1 });
  });
});
