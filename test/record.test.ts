import { describe, expect, it } from 'vitest';
import { assertRecord, canonicalJson, createRepairForm, FixformValidationError, renderHtml, renderHtmlFragment, renderMarkdown, renderText, sha256Hex, verifyRepairForm } from '../src/index.js';
import { mutableInput, validInput } from './fixtures.js';

describe('records', () => {
  it('creates a deterministic record with an ID and an integrity hash', () => {
    const a = createRepairForm(validInput());
    const b = createRepairForm(JSON.parse(JSON.stringify(validInput())) as unknown);
    expect(a).toEqual(b);
    expect(a.format).toBe('fixform/1');
    expect(a.id).toMatch(/^FX-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/u);
    expect(a.integrity).toBe(`sha256-${sha256Hex(canonicalJson({ format: a.format, form: a.form, validity: a.validity }))}`);
    expect(a.validity.lastDay).toBe('2026-12-09');
  });

  it('key order and insignificant input differences do not change the ID; content changes do', () => {
    const base = createRepairForm(validInput());
    const reordered = mutableInput();
    const { good, ...rest } = reordered;
    expect(createRepairForm({ ...rest, good }).id).toBe(base.id);
    const spaced = mutableInput();
    spaced['good'] = `  ${String(spaced['good'])}  `;
    expect(createRepairForm(spaced).id).toBe(base.id);
    const changed = mutableInput();
    changed['completionDays'] = 6;
    expect(createRepairForm(changed).id).not.toBe(base.id);
    const otherLanguage = createRepairForm(validInput('de'));
    expect(otherLanguage.id).not.toBe(base.id);
  });

  it('throws FixformValidationError with the issues', () => {
    try {
      createRepairForm({ language: 'xx' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FixformValidationError);
      expect((error as FixformValidationError).issues.length).toBeGreaterThan(5);
      expect((error as Error).message).toContain('language (language)');
    }
  });

  it('verifies a stored record after a JSON round trip', () => {
    const record = createRepairForm(validInput());
    const stored = JSON.parse(JSON.stringify(record)) as unknown;
    const result = verifyRepairForm(stored);
    expect(result.ok).toBe(true);
    expect(assertRecord(stored)).toEqual(record);
  });

  it('detects tampering with the data, the validity, the ID or the hash', () => {
    const record = createRepairForm(validInput());
    const copy = (): Record<string, unknown> & { form: Record<string, unknown>; validity: Record<string, unknown> } =>
      JSON.parse(JSON.stringify(record)) as Record<string, unknown> & { form: Record<string, unknown>; validity: Record<string, unknown> };
    const price = copy();
    price.form['price'] = { type: 'fixed', total: { amount: '1.00', currency: 'EUR' } };
    expect(verifyRepairForm(price)).toEqual({ ok: false, reason: 'integrity hash does not match' });
    const validity = copy();
    validity.validity['lastDay'] = '2027-01-01';
    expect(verifyRepairForm(validity)).toEqual({ ok: false, reason: 'data or validity does not match' });
    const id = copy();
    id['id'] = 'FX-0000-0000-0000-0000';
    expect(verifyRepairForm(id)).toEqual({ ok: false, reason: 'ID does not match' });
    const hash = copy();
    hash['integrity'] = `sha256-${'0'.repeat(64)}`;
    expect(verifyRepairForm(hash)).toEqual({ ok: false, reason: 'integrity hash does not match' });
    const unnormalised = copy();
    unnormalised.form['good'] = ` ${String(unnormalised.form['good'])}`;
    expect(verifyRepairForm(unnormalised)).toEqual({ ok: false, reason: 'data or validity does not match' });
    const extra = copy();
    extra['note'] = 'x';
    expect(verifyRepairForm(extra)).toEqual({ ok: false, reason: 'unexpected fields' });
    const format = copy();
    format['format'] = 'fixform/2';
    expect(verifyRepairForm(format)).toEqual({ ok: false, reason: 'unsupported format' });
    const badForm = copy();
    badForm.form['language'] = 'xx';
    expect(verifyRepairForm(badForm)).toEqual({ ok: false, reason: 'invalid form data' });
    const floatValidity = copy();
    floatValidity.validity['days'] = 30.5;
    expect(verifyRepairForm(floatValidity)).toEqual({ ok: false, reason: 'invalid record' });
    const deep = copy();
    let nested: unknown = 1;
    for (let i = 0; i < 100_000; i += 1) nested = [nested];
    deep['validity'] = nested as Record<string, unknown>;
    expect(verifyRepairForm(deep)).toEqual({ ok: false, reason: 'invalid record' });
    expect(verifyRepairForm(null)).toEqual({ ok: false, reason: 'not an object' });
    expect(verifyRepairForm([])).toEqual({ ok: false, reason: 'not an object' });
  });

  it('renderers refuse records that do not verify', () => {
    const record = createRepairForm(validInput());
    const tampered = { ...record, form: { ...record.form, good: 'Something else' } };
    expect(() => renderHtml(tampered)).toThrow(TypeError);
    expect(() => renderHtmlFragment(tampered)).toThrow(TypeError);
    expect(() => renderText(tampered)).toThrow(TypeError);
    expect(() => renderMarkdown(tampered)).toThrow(TypeError);
  });
});
