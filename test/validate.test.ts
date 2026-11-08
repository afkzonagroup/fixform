import { describe, expect, it } from 'vitest';
import { LIMITS, validateRepairForm, type Issue } from '../src/index.js';
import { mutableInput, validInput } from './fixtures.js';

function errors(input: unknown, options = {}): Issue[] {
  const r = validateRepairForm(input, options);
  return r.ok ? [] : [...r.errors];
}

function codes(input: unknown, options = {}): string[] {
  return errors(input, options).map((e) => `${e.path}:${e.code}`);
}

describe('validateRepairForm', () => {
  it('accepts a complete form and fills defaults', () => {
    const r = validateRepairForm(validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.validity).toEqual({ providedAt: '2026-11-09T10:15:00+02:00', timeZone: 'Europe/Vilnius', days: 30, rollForward: { weekends: true, publicHolidays: [] } });
    expect(r.value.price).toEqual({ type: 'fixed', total: { amount: '89.00', currency: 'EUR' } });
    expect(r.warnings).toEqual([]);
  });

  it('accepts every one of the 24 languages', () => {
    for (const lang of ['bg', 'es', 'cs', 'da', 'de', 'et', 'el', 'en', 'fr', 'ga', 'hr', 'it', 'lv', 'lt', 'hu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'fi', 'sv'] as const) {
      expect(validateRepairForm(validInput(lang)).ok, lang).toBe(true);
    }
  });

  it('requires every field Annex I asks for (Article 4(4)(a) to (j))', () => {
    const required = ['language', 'repairer', 'good', 'defect', 'repairType', 'price', 'completionDays', 'temporaryReplacement', 'handOverPlace', 'ancillaryServices', 'validity'];
    for (const key of required) {
      const input = mutableInput();
      Reflect.deleteProperty(input, key);
      expect(codes(input).length, key).toBeGreaterThan(0);
      expect(errors(input).some((e) => e.path.startsWith(key)), key).toBe(true);
    }
    for (const key of ['identity', 'address', 'telephone', 'email']) {
      const input = mutableInput();
      Reflect.deleteProperty(input.repairer, key);
      expect(codes(input), key).toContain(`repairer.${key}:required`);
    }
    for (const key of ['providedAt', 'timeZone']) {
      const input = mutableInput();
      Reflect.deleteProperty(input.validity, key);
      expect(codes(input), key).toContain(`validity.${key}:required`);
    }
  });

  it('optional fields: other means of communication, diagnostic, additional information', () => {
    const input = mutableInput();
    Reflect.deleteProperty(input.repairer, 'otherMeans');
    Reflect.deleteProperty(input, 'diagnostic');
    Reflect.deleteProperty(input, 'additionalInformation');
    expect(validateRepairForm(input).ok).toBe(true);
    const empty = mutableInput();
    empty.repairer['otherMeans'] = [];
    const r = validateRepairForm(empty);
    expect(r.ok && r.value.repairer.otherMeans).toBe(undefined);
  });

  it('rejects unknown fields and dangerous keys at every level', () => {
    expect(codes({ ...validInput(), extra: 1 })).toEqual(['extra:unknown_field']);
    const polluted = JSON.parse(`{"__proto__":{"polluted":true},${JSON.stringify(validInput()).slice(1)}`) as unknown;
    expect(codes(polluted)).toEqual(['__proto__:forbidden_key']);
    const nested = mutableInput();
    nested.repairer = JSON.parse('{"constructor":{"prototype":{"x":1}},"identity":"a","address":"b","telephone":"+3706","email":"a@b.lt"}') as Record<string, unknown>;
    expect(codes(nested)).toContain('repairer.constructor:forbidden_key');
    const price = mutableInput();
    price['price'] = { type: 'fixed', total: { amount: '1', currency: 'EUR', prototype: 1 } };
    expect(codes(price)).toContain('price.total.prototype:forbidden_key');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('rejects non-plain objects and wrong types', () => {
    expect(codes(null)).toEqual([':type']);
    expect(codes([])).toEqual([':type']);
    expect(codes('form')).toEqual([':type']);
    expect(codes(new Map())).toEqual([':type']);
    class Fake {
      readonly marker = true;
    }
    expect(codes(Object.assign(new Fake(), validInput()))).toEqual([':type']);
    const input = mutableInput();
    input['good'] = 42;
    input['completionDays'] = '5';
    input['ancillaryServices'] = {};
    expect(codes(input)).toEqual(expect.arrayContaining(['good:type', 'completionDays:integer', 'ancillaryServices:type']));
  });

  it('accepts a null-prototype object', () => {
    const input = Object.assign(Object.create(null) as object, validInput());
    expect(validateRepairForm(input).ok).toBe(true);
  });

  it('normalises text: NFC, line endings, trimming, tabs', () => {
    const input = mutableInput();
    input.repairer['identity'] = '  Cafe\u{301} Repairs\t ';
    input['defect'] = 'Line 1\r\nLine 2  \r\n\r\n\r\n\r\nLine 3';
    const r = validateRepairForm(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.repairer.identity).toBe('Caf\u{e9} Repairs');
    expect(r.value.defect).toBe('Line 1\nLine 2\n\nLine 3');
  });

  it('rejects empty text, single-line text with line breaks, and too long text', () => {
    const input = mutableInput();
    input.repairer['identity'] = '   ';
    input.repairer['telephone'] = '+370\n600';
    input['good'] = 'x'.repeat(LIMITS.good + 1);
    input['handOverPlace'] = 'x'.repeat(LIMITS.handOverPlace * 5);
    // Absurdly long input is refused before normalising, even if trimming would make it short.
    input['defect'] = `${' '.repeat(LIMITS.defect * 4)}x`;
    expect(codes(input)).toEqual(expect.arrayContaining(['repairer.identity:empty', 'repairer.telephone:invalid_characters', 'good:too_long', 'handOverPlace:too_long', 'defect:too_long']));
  });

  it('rejects control, bidirectional, zero-width, other invisible format and lone surrogate characters', () => {
    const bad = ['a\u{0}b', 'a\u{7}b', 'a\u{1b}[31mb', 'a\u{7f}b', 'a\u{85}b', 'a\u{202e}b', 'a\u{2066}b', 'a\u{200b}b', 'a\u{200f}b', 'a\u{2028}b', 'a\u{feff}b', 'a\u{61c}b', `a${String.fromCharCode(0xd800)}b`];
    // Invisible tag characters can carry a hidden second text ("ASCII smuggling"); also the soft hyphen,
    // the Mongolian vowel separator, an Arabic number sign and a noncharacter.
    bad.push('Price 89 EUR\u{e0001}\u{e0069}\u{e0067}\u{e006e}', 'a\u{ad}b', 'a\u{180e}b', 'a\u{600}b', 'a\u{fffe}b', 'a\u{10ffff}b');
    for (const value of bad) {
      const input = mutableInput();
      input['defect'] = value;
      expect(codes(input), JSON.stringify(value)).toEqual(['defect:invalid_characters']);
    }
    const ok = mutableInput();
    ok['defect'] = 'Ąčę Ελληνικά — 漢字 \u{1f527} non\u{a0}breaking';
    expect(validateRepairForm(ok).ok).toBe(true);
  });

  it('checks e-mail and telephone formats', () => {
    for (const email of ['no-at', 'a@b', 'a@@b.lt', 'a b@c.lt', '<a@b.lt>', 'a@-b.lt', `${'x'.repeat(65)}@b.lt`, 'a@b.lt\r\nBcc: c@d.lt']) {
      const input = mutableInput();
      input.repairer['email'] = email;
      expect(errors(input).map((e) => e.path), email).toContain('repairer.email');
    }
    for (const telephone of ['phone', '12', '+', '++37060000000', '+370 600 00000 ext. 5']) {
      const input = mutableInput();
      input.repairer['telephone'] = telephone;
      expect(codes(input), telephone).toContain('repairer.telephone:telephone');
    }
    const input = mutableInput();
    input.repairer['telephone'] = '(0)30 1234-567';
    expect(validateRepairForm(input).ok).toBe(true);
  });

  it('pattern checks stay fast on hostile input (no catastrophic backtracking)', () => {
    const input = mutableInput();
    input.repairer['email'] = `${'a'.repeat(60)}@${'b-'.repeat(95)}`;
    input.repairer['telephone'] = `+${'1 '.repeat(19)}x`;
    input.validity['providedAt'] = `2026-11-09T10:15:00${'0'.repeat(20)}`;
    const start = performance.now();
    for (let i = 0; i < 200; i += 1) validateRepairForm(input);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('checks amounts and the currency allow-list, and accepts exact JSON numbers', () => {
    const input = mutableInput();
    input['price'] = { type: 'fixed', total: { amount: -5, currency: 'EUR' } };
    input['temporaryReplacement'] = { available: true, cost: { amount: '1', currency: 'USD' } };
    input['ancillaryServices'] = [{ description: 'Transport', cost: { amount: '1.999', currency: 'EUR' } }];
    expect(codes(input)).toEqual(expect.arrayContaining(['price.total.amount:amount', 'temporaryReplacement.cost.currency:currency', 'ancillaryServices.0.cost.amount:amount']));
    const numbers = mutableInput();
    numbers['price'] = { type: 'fixed', total: { amount: 129.9, currency: 'EUR' } };
    const r = validateRepairForm(numbers);
    expect(r.ok && r.value.price).toEqual({ type: 'fixed', total: { amount: '129.90', currency: 'EUR' } });
    const missing = mutableInput();
    missing['price'] = { type: 'fixed', total: { currency: 'EUR' } };
    expect(codes(missing)).toEqual(['price.total.amount:required']);
    const longAmount = mutableInput();
    longAmount['price'] = { type: 'fixed', total: { amount: '1'.repeat(100), currency: 'EUR' } };
    expect(codes(longAmount)).toEqual(['price.total.amount:amount']);
  });

  it('price: fixed total or calculation method plus maximum price (Article 4(4)(e))', () => {
    const input = mutableInput();
    input['price'] = { type: 'maximum', calculationMethod: '45 EUR per hour plus parts at cost', maximum: { amount: '250', currency: 'EUR' } };
    const r = validateRepairForm(input);
    expect(r.ok && r.value.price).toEqual({ type: 'maximum', calculationMethod: '45 EUR per hour plus parts at cost', maximum: { amount: '250.00', currency: 'EUR' } });
    const noMax = mutableInput();
    noMax['price'] = { type: 'maximum', calculationMethod: 'hourly' };
    expect(codes(noMax)).toEqual(['price.maximum:type']);
    const noMethod = mutableInput();
    noMethod['price'] = { type: 'maximum', maximum: { amount: '1', currency: 'EUR' } };
    expect(codes(noMethod)).toEqual(['price.calculationMethod:required']);
    const wrongType = mutableInput();
    wrongType['price'] = { type: 'estimate' };
    expect(codes(wrongType)).toEqual(['price.type:type']);
    const mixed = mutableInput();
    mixed['price'] = { type: 'fixed', total: { amount: '1', currency: 'EUR' }, maximum: {} };
    expect(codes(mixed)).toEqual(['price.maximum:unknown_field']);
  });

  it('temporary replacement: yes needs a cost (zero allowed), no allows nothing else (Article 4(4)(g))', () => {
    const yes = mutableInput();
    yes['temporaryReplacement'] = { available: true };
    expect(codes(yes)).toEqual(['temporaryReplacement.cost:type']);
    const no = mutableInput();
    no['temporaryReplacement'] = { available: false, cost: { amount: '1', currency: 'EUR' } };
    expect(codes(no)).toEqual(['temporaryReplacement.cost:unknown_field']);
    const unset = mutableInput();
    unset['temporaryReplacement'] = { available: 'yes' };
    expect(codes(unset)).toEqual(['temporaryReplacement.available:type']);
  });

  it('limits list sizes', () => {
    const input = mutableInput();
    input['ancillaryServices'] = Array.from({ length: LIMITS.servicesCount + 1 }, () => ({ description: 'x', cost: { amount: '1', currency: 'EUR' } }));
    input.repairer['otherMeans'] = Array.from({ length: LIMITS.otherMeansCount + 1 }, () => 'x');
    expect(codes(input)).toEqual(expect.arrayContaining(['ancillaryServices:too_many', 'repairer.otherMeans:too_many']));
  });

  it('bounds the number of reported errors', () => {
    const input = mutableInput();
    input['ancillaryServices'] = Array.from({ length: LIMITS.servicesCount }, () => ({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }));
    expect(errors(input).length).toBeLessThanOrEqual(100);
  });

  it('completion time in whole days from 1', () => {
    for (const [value, code] of [[0, 'range'], [1.5, 'integer'], [LIMITS.completionDays + 1, 'range'], [Number.NaN, 'integer']] as const) {
      const input = mutableInput();
      input['completionDays'] = value;
      expect(codes(input)).toEqual([`completionDays:${code}`]);
    }
  });

  it('period of validity: at least 30 days (Article 4(5)), longer allowed', () => {
    const short = mutableInput();
    short.validity['days'] = 29;
    const e = errors(short);
    expect(e.map((i) => `${i.path}:${i.code}`)).toEqual(['validity.days:validity_too_short']);
    expect(e[0]?.message).toContain('Article 4(5)');
    const long = mutableInput();
    long.validity['days'] = 90;
    const r = validateRepairForm(long);
    expect(r.ok && r.value.validity.days).toBe(90);
    const huge = mutableInput();
    huge.validity['days'] = LIMITS.validityDays + 1;
    expect(codes(huge)).toEqual(['validity.days:range']);
    const text = mutableInput();
    text.validity['days'] = '30';
    expect(codes(text)).toEqual(['validity.days:integer']);
  });

  it('providedAt and time zone', () => {
    const local = mutableInput();
    local.validity['providedAt'] = '2026-11-09T10:15:00';
    expect(codes(local)).toEqual(['validity.providedAt:datetime']);
    const tz = mutableInput();
    tz.validity['timeZone'] = 'Europe/Atlantis';
    expect(codes(tz)).toEqual(['validity.timeZone:time_zone']);
    const notString = mutableInput();
    notString.validity['providedAt'] = 1;
    expect(codes(notString)).toEqual(['validity.providedAt:type']);
  });

  it('providedAt set by the caller (server clock) cannot be overridden by the input', () => {
    const r = validateRepairForm(validInput(), { providedAt: '2026-11-10T08:00:00Z' });
    expect(r.ok).toBe(false);
    expect(codes(validInput(), { providedAt: '2026-11-10T08:00:00Z' })).toEqual(['validity.providedAt:provided_at_set_by_caller']);
    const input = mutableInput();
    Reflect.deleteProperty(input.validity, 'providedAt');
    const ok = validateRepairForm(input, { providedAt: '2026-11-10T08:00:00Z' });
    expect(ok.ok && ok.value.validity.providedAt).toBe('2026-11-10T08:00:00Z');
    expect(codes(input, { providedAt: 'yesterday' })).toEqual(['validity.providedAt:datetime']);
  });

  it('roll-forward options', () => {
    const off = mutableInput();
    off.validity['rollForward'] = false;
    const r = validateRepairForm(off);
    expect(r.ok && r.value.validity.rollForward).toBe(false);
    const holidays = mutableInput();
    holidays.validity['rollForward'] = { publicHolidays: ['2026-12-25', '2026-12-24', '2026-12-25'] };
    const h = validateRepairForm(holidays);
    expect(h.ok && h.value.validity.rollForward).toEqual({ weekends: true, publicHolidays: ['2026-12-24', '2026-12-25'] });
    const bad = mutableInput();
    bad.validity['rollForward'] = { weekends: 'yes', publicHolidays: ['25.12.2026'] };
    expect(codes(bad)).toEqual(expect.arrayContaining(['validity.rollForward.weekends:type', 'validity.rollForward.publicHolidays.0:date']));
    const isTrue = mutableInput();
    isTrue.validity['rollForward'] = true;
    expect(codes(isTrue)).toEqual(['validity.rollForward:type']);
  });

  it('diagnostic cost: the consumer must have been informed no later than the day the form is provided (Article 4(3), recital 12)', () => {
    const same = mutableInput();
    same['diagnostic'] = { cost: { amount: '25', currency: 'EUR' }, consumerInformedOn: '2026-11-09', deductedFromRepairPrice: false };
    expect(validateRepairForm(same).ok).toBe(true);
    const late = mutableInput();
    late['diagnostic'] = { cost: { amount: '25', currency: 'EUR' }, consumerInformedOn: '2026-11-10', deductedFromRepairPrice: false };
    const e = errors(late);
    expect(e.map((i) => i.code)).toEqual(['diagnostic_informed_late']);
    expect(e[0]?.message).toContain('Article 4(3)');
    const incomplete = mutableInput();
    incomplete['diagnostic'] = { cost: { amount: '25', currency: 'EUR' }, consumerInformedOn: '9.11.2026' };
    expect(codes(incomplete)).toEqual(expect.arrayContaining(['diagnostic.consumerInformedOn:date', 'diagnostic.deductedFromRepairPrice:required']));
  });

  it('warnings: mixed currencies and a date before 31 July 2026 (Article 22(1))', () => {
    const input = mutableInput();
    input['ancillaryServices'] = [{ description: 'Transport', cost: { amount: '100', currency: 'SEK' } }];
    input.validity['providedAt'] = '2026-07-30T12:00:00+02:00';
    Reflect.deleteProperty(input, 'diagnostic');
    const r = validateRepairForm(input);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['mixed_currencies', 'before_application_date']);
    const onDate = mutableInput();
    onDate.validity['providedAt'] = '2026-07-31T00:30:00+02:00';
    Reflect.deleteProperty(onDate, 'diagnostic');
    expect(validateRepairForm(onDate).warnings).toEqual([]);
  });

  it('returns fresh objects that share nothing with the input', () => {
    const input = validInput();
    const r = validateRepairForm(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toBe(input);
    expect(r.value.repairer).not.toBe(input.repairer);
    expect(r.value.ancillaryServices).not.toBe(input.ancillaryServices);
    expect(Object.getPrototypeOf(r.value)).toBe(Object.prototype);
  });
});
