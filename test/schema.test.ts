import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { REPAIR_FORM_SCHEMA, validateRepairForm } from '../src/index.js';
import { mutableInput, validInput } from './fixtures.js';

describe('JSON schema', () => {
  it('data/repair-form.schema.json is generated from the library (run npm run schema:write)', () => {
    const file = JSON.parse(readFileSync(new URL('../data/repair-form.schema.json', import.meta.url), 'utf8')) as unknown;
    expect(file).toEqual(JSON.parse(JSON.stringify(REPAIR_FORM_SCHEMA)));
  });

  it('is a valid draft 2020-12 schema and agrees with the validator on structural cases', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(JSON.parse(JSON.stringify(REPAIR_FORM_SCHEMA)) as object);
    const cases: [string, (input: Record<string, unknown> & { repairer: Record<string, unknown>; validity: Record<string, unknown> }) => void][] = [
      ['valid', () => undefined],
      ['valid maximum price', (i) => (i['price'] = { type: 'maximum', calculationMethod: 'hourly', maximum: { amount: '10', currency: 'EUR' } })],
      ['valid no replacement', (i) => (i['temporaryReplacement'] = { available: false })],
      ['missing good', (i) => Reflect.deleteProperty(i, 'good')],
      ['unknown field', (i) => (i['x'] = 1)],
      ['bad language', (i) => (i['language'] = 'xx')],
      ['bad currency', (i) => (i['price'] = { type: 'fixed', total: { amount: '1', currency: 'USD' } })],
      ['bad amount', (i) => (i['price'] = { type: 'fixed', total: { amount: '1.234', currency: 'EUR' } })],
      ['short validity', (i) => (i.validity['days'] = 29)],
      ['completion zero', (i) => (i['completionDays'] = 0)],
      ['replacement yes without cost', (i) => (i['temporaryReplacement'] = { available: true })],
      ['empty identity', (i) => (i.repairer['identity'] = '')],
      ['too many services', (i) => (i['ancillaryServices'] = Array.from({ length: 21 }, () => ({ description: 'x', cost: { amount: '1', currency: 'EUR' } })))],
      ['bad telephone', (i) => (i.repairer['telephone'] = 'phone')],
      ['local time', (i) => (i.validity['providedAt'] = '2026-11-09T10:00:00')],
    ];
    for (const [name, mutate] of cases) {
      const input = mutableInput();
      mutate(input);
      expect(validate(input), name).toBe(validateRepairForm(input).ok);
    }
    expect(validate(validInput('ga'))).toBe(true);
  });
});
