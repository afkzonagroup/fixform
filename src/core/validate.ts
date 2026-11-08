/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation of untrusted form data at the boundary.
 *
 * The validator reads only own properties of plain objects, rejects unknown
 * fields and the keys `__proto__`, `constructor` and `prototype`, limits every
 * length and count, and builds a fresh output object. Nothing from the input
 * is copied by reference, so the result cannot carry prototype pollution or
 * extra properties into the renderers.
 *
 * @packageDocumentation
 */

import { isLanguage } from '../annex/index.js';
import { DIRECTIVE_2024_1799, MINIMUM_VALIDITY_DAYS } from '../law.js';
import { isCurrency, normaliseAmount } from './money.js';
import { computeValidity, isCivilDate, isValidTimeZone, localDate, parseInstant } from './time.js';
import type {
  AncillaryService,
  Currency,
  DiagnosticService,
  Money,
  NormalisedRepairForm,
  Price,
  Repairer,
  TemporaryReplacement,
} from './types.js';

/** Machine-readable reason for an issue. */
export type IssueCode =
  | 'type'
  | 'required'
  | 'unknown_field'
  | 'forbidden_key'
  | 'too_long'
  | 'too_many'
  | 'empty'
  | 'invalid_characters'
  | 'language'
  | 'email'
  | 'telephone'
  | 'amount'
  | 'currency'
  | 'integer'
  | 'range'
  | 'validity_too_short'
  | 'date'
  | 'datetime'
  | 'time_zone'
  | 'diagnostic_informed_late'
  | 'provided_at_set_by_caller'
  | 'mixed_currencies'
  | 'before_application_date';

/** A problem found in the input. `path` uses dots and indexes, for example "ancillaryServices.0.cost.amount". */
export interface Issue {
  readonly path: string;
  readonly code: IssueCode;
  /** English explanation for developers. User interfaces translate `code` instead. */
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: NormalisedRepairForm; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly errors: readonly Issue[]; readonly warnings: readonly Issue[] };

export interface ValidateOptions {
  /**
   * Sets the time the form is provided, for example from a server clock. When
   * given, the input must not contain `validity.providedAt`.
   */
  readonly providedAt?: string;
}

/** Length limits (in UTF-16 code units, after normalisation) and count limits. */
export const LIMITS = {
  identity: 200,
  address: 500,
  telephone: 40,
  email: 254,
  otherMeans: 300,
  otherMeansCount: 10,
  good: 500,
  defect: 2000,
  repairType: 2000,
  calculationMethod: 1000,
  handOverPlace: 500,
  serviceDescription: 300,
  servicesCount: 20,
  additionalInformation: 4000,
  timeZone: 64,
  publicHolidays: 100,
  completionDays: 3650,
  validityDays: 3650,
} as const;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Characters never accepted in text: C0 and C1 controls (line feed only where
 * line breaks are allowed), DEL, every invisible format character (Unicode
 * category Cf: bidirectional controls and isolates, zero-width characters,
 * the byte order mark, the soft hyphen and the invisible tag characters
 * U+E0000-E007F), line and paragraph separators, lone surrogates and
 * noncharacters. They can hide or reorder text in a document the consumer
 * relies on.
 */
// eslint-disable-next-line no-control-regex -- this pattern exists to find and reject control characters.
const FORBIDDEN_CHARS = /[\u{0}-\u{9}\u{B}-\u{1F}\u{7F}-\u{9F}\u{2028}\u{2029}]|\p{Cf}|\p{Cs}|\p{Noncharacter_Code_Point}/u;

const EMAIL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
const TELEPHONE = /^\+?\(?[0-9][0-9 ()./-]{2,38}$/u;

class Context {
  readonly errors: Issue[] = [];
  readonly warnings: Issue[] = [];

  error(path: string, code: IssueCode, message: string): void {
    // Keep the error list bounded even for hostile input.
    if (this.errors.length < 100) this.errors.push({ path, code, message });
  }

  warn(path: string, code: IssueCode, message: string): void {
    this.warnings.push({ path, code, message });
  }
}

const join = (base: string, key: string | number): string => (base === '' ? String(key) : `${base}.${String(key)}`);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reads a plain object with an allow-list of keys. Returns a null-prototype copy of the own values. */
function readObject(ctx: Context, value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    ctx.error(path, 'type', `${path || 'input'} must be an object`);
    return null;
  }
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      ctx.error(join(path, key), 'forbidden_key', `the key "${key}" is not allowed`);
    } else if (!allowed.includes(key)) {
      ctx.error(join(path, key.slice(0, 64)), 'unknown_field', 'unknown field');
    } else {
      out[key] = value[key];
    }
  }
  return out;
}

interface TextRule {
  readonly max: number;
  readonly multiline?: boolean;
}

function normaliseText(raw: string, multiline: boolean): string {
  let text = raw.normalize('NFC').replace(/\r\n?/gu, '\n').replace(/\t/gu, ' ');
  if (multiline) {
    text = text
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n');
  }
  return text.trim();
}

function readText(ctx: Context, value: unknown, path: string, rule: TextRule): string | undefined {
  if (value === undefined) {
    ctx.error(path, 'required', 'required');
    return undefined;
  }
  if (typeof value !== 'string') {
    ctx.error(path, 'type', 'must be a string');
    return undefined;
  }
  // Reject absurd input before any work on it.
  if (value.length > rule.max * 4) {
    ctx.error(path, 'too_long', `at most ${String(rule.max)} characters`);
    return undefined;
  }
  const multiline = rule.multiline === true;
  const text = normaliseText(value, multiline);
  if (FORBIDDEN_CHARS.test(text) || (!multiline && text.includes('\n'))) {
    ctx.error(path, 'invalid_characters', multiline ? 'contains control or invisible formatting characters' : 'must be a single line without control or invisible formatting characters');
    return undefined;
  }
  if (text.length === 0) {
    ctx.error(path, 'empty', 'must not be empty');
    return undefined;
  }
  if (text.length > rule.max) {
    ctx.error(path, 'too_long', `at most ${String(rule.max)} characters`);
    return undefined;
  }
  return text;
}

function readInteger(ctx: Context, value: unknown, path: string, min: number, max: number): number | undefined {
  if (value === undefined) {
    ctx.error(path, 'required', 'required');
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    ctx.error(path, 'integer', 'must be a whole number');
    return undefined;
  }
  if (value < min || value > max) {
    ctx.error(path, 'range', `must be between ${String(min)} and ${String(max)}`);
    return undefined;
  }
  return value;
}

function readBoolean(ctx: Context, value: unknown, path: string): boolean | undefined {
  if (typeof value !== 'boolean') {
    ctx.error(path, value === undefined ? 'required' : 'type', 'must be true or false');
    return undefined;
  }
  return value;
}

function readArray(ctx: Context, value: unknown, path: string, max: number): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    ctx.error(path, value === undefined ? 'required' : 'type', 'must be a list');
    return undefined;
  }
  if (value.length > max) {
    ctx.error(path, 'too_many', `at most ${String(max)} entries`);
    return undefined;
  }
  return value as readonly unknown[];
}

function readMoney(ctx: Context, value: unknown, path: string, currencies: Set<Currency>): Money | undefined {
  const o = readObject(ctx, value, path, ['amount', 'currency']);
  if (!o) return undefined;
  const currency = o['currency'];
  if (!isCurrency(currency)) {
    ctx.error(join(path, 'currency'), currency === undefined ? 'required' : 'currency', 'must be one of EUR, CZK, DKK, HUF, PLN, RON, SEK, ISK, CHF, NOK');
    return undefined;
  }
  let raw = o['amount'];
  // Numbers from JSON or YAML are accepted when their decimal form is exact, for example 129.9.
  if (typeof raw === 'number' && Number.isFinite(raw)) raw = String(raw);
  if (typeof raw !== 'string') {
    ctx.error(join(path, 'amount'), raw === undefined ? 'required' : 'type', 'must be a decimal string such as "129.90"');
    return undefined;
  }
  const amount = raw.length <= 16 ? normaliseAmount(raw, currency) : null;
  if (amount === null) {
    ctx.error(join(path, 'amount'), 'amount', `must be a non-negative amount with at most 9 digits and ${currency === 'ISK' ? 'no' : 'at most 2'} decimal places`);
    return undefined;
  }
  currencies.add(currency);
  return { amount, currency };
}

function readRepairer(ctx: Context, value: unknown): Repairer | undefined {
  const o = readObject(ctx, value, 'repairer', ['identity', 'address', 'telephone', 'email', 'otherMeans']);
  if (!o) return undefined;
  const identity = readText(ctx, o['identity'], 'repairer.identity', { max: LIMITS.identity });
  const address = readText(ctx, o['address'], 'repairer.address', { max: LIMITS.address, multiline: true });
  const telephone = readText(ctx, o['telephone'], 'repairer.telephone', { max: LIMITS.telephone });
  if (telephone !== undefined && !TELEPHONE.test(telephone)) ctx.error('repairer.telephone', 'telephone', 'must be a telephone number such as "+370 600 00000"');
  const email = readText(ctx, o['email'], 'repairer.email', { max: LIMITS.email });
  if (email !== undefined && (!EMAIL.test(email) || (email.split('@')[0] ?? '').length > 64)) ctx.error('repairer.email', 'email', 'must be an e-mail address');
  let otherMeans: string[] | undefined;
  if (o['otherMeans'] !== undefined) {
    const list = readArray(ctx, o['otherMeans'], 'repairer.otherMeans', LIMITS.otherMeansCount);
    if (list) {
      otherMeans = [];
      list.forEach((item, i) => {
        const text = readText(ctx, item, `repairer.otherMeans.${String(i)}`, { max: LIMITS.otherMeans });
        if (text !== undefined) otherMeans?.push(text);
      });
    }
  }
  if (identity === undefined || address === undefined || telephone === undefined || email === undefined) return undefined;
  return otherMeans && otherMeans.length > 0 ? { identity, address, telephone, email, otherMeans } : { identity, address, telephone, email };
}

function readPrice(ctx: Context, value: unknown, currencies: Set<Currency>): Price | undefined {
  if (!isPlainObject(value)) {
    ctx.error('price', value === undefined ? 'required' : 'type', 'must be an object');
    return undefined;
  }
  const type = Object.hasOwn(value, 'type') ? value['type'] : undefined;
  if (type === 'fixed') {
    const o = readObject(ctx, value, 'price', ['type', 'total']);
    const total = o ? readMoney(ctx, o['total'], 'price.total', currencies) : undefined;
    return total ? { type: 'fixed', total } : undefined;
  }
  if (type === 'maximum') {
    const o = readObject(ctx, value, 'price', ['type', 'calculationMethod', 'maximum']);
    if (!o) return undefined;
    const calculationMethod = readText(ctx, o['calculationMethod'], 'price.calculationMethod', { max: LIMITS.calculationMethod, multiline: true });
    const maximum = readMoney(ctx, o['maximum'], 'price.maximum', currencies);
    return calculationMethod !== undefined && maximum ? { type: 'maximum', calculationMethod, maximum } : undefined;
  }
  ctx.error('price.type', type === undefined ? 'required' : 'type', 'must be "fixed" or "maximum"');
  return undefined;
}

function readReplacement(ctx: Context, value: unknown, currencies: Set<Currency>): TemporaryReplacement | undefined {
  if (!isPlainObject(value)) {
    ctx.error('temporaryReplacement', value === undefined ? 'required' : 'type', 'must be an object');
    return undefined;
  }
  const available = Object.hasOwn(value, 'available') ? value['available'] : undefined;
  if (available === false) {
    return readObject(ctx, value, 'temporaryReplacement', ['available']) ? { available: false } : undefined;
  }
  if (available === true) {
    const o = readObject(ctx, value, 'temporaryReplacement', ['available', 'cost']);
    const cost = o ? readMoney(ctx, o['cost'], 'temporaryReplacement.cost', currencies) : undefined;
    return cost ? { available: true, cost } : undefined;
  }
  ctx.error('temporaryReplacement.available', available === undefined ? 'required' : 'type', 'must be true or false');
  return undefined;
}

function readServices(ctx: Context, value: unknown, currencies: Set<Currency>): AncillaryService[] | undefined {
  const list = readArray(ctx, value, 'ancillaryServices', LIMITS.servicesCount);
  if (!list) return undefined;
  const out: AncillaryService[] = [];
  let ok = true;
  for (const [i, item] of list.entries()) {
    const path = `ancillaryServices.${String(i)}`;
    const o = readObject(ctx, item, path, ['description', 'cost']);
    if (!o) {
      ok = false;
      continue;
    }
    const description = readText(ctx, o['description'], `${path}.description`, { max: LIMITS.serviceDescription });
    const cost = readMoney(ctx, o['cost'], `${path}.cost`, currencies);
    if (description === undefined || !cost) ok = false;
    else out.push({ description, cost });
  }
  return ok ? out : undefined;
}

function readDiagnostic(ctx: Context, value: unknown, currencies: Set<Currency>): DiagnosticService | undefined {
  const o = readObject(ctx, value, 'diagnostic', ['cost', 'consumerInformedOn', 'deductedFromRepairPrice']);
  if (!o) return undefined;
  const cost = readMoney(ctx, o['cost'], 'diagnostic.cost', currencies);
  const informed = o['consumerInformedOn'];
  let consumerInformedOn: string | undefined;
  if (typeof informed === 'string' && isCivilDate(informed)) consumerInformedOn = informed;
  else ctx.error('diagnostic.consumerInformedOn', informed === undefined ? 'required' : 'date', 'must be a date written as YYYY-MM-DD');
  const deductedFromRepairPrice = readBoolean(ctx, o['deductedFromRepairPrice'], 'diagnostic.deductedFromRepairPrice');
  if (!cost || consumerInformedOn === undefined || deductedFromRepairPrice === undefined) return undefined;
  return { cost, consumerInformedOn, deductedFromRepairPrice };
}

function readValidity(ctx: Context, value: unknown, options: ValidateOptions): NormalisedRepairForm['validity'] | undefined {
  const o = readObject(ctx, value, 'validity', ['providedAt', 'timeZone', 'days', 'rollForward']);
  if (!o) return undefined;
  let providedAt: string | undefined;
  if (options.providedAt !== undefined) {
    if (o['providedAt'] !== undefined) ctx.error('validity.providedAt', 'provided_at_set_by_caller', 'is set by the server and must not be sent');
    providedAt = options.providedAt;
  } else {
    providedAt = typeof o['providedAt'] === 'string' ? o['providedAt'] : undefined;
    if (providedAt === undefined) ctx.error('validity.providedAt', o['providedAt'] === undefined ? 'required' : 'type', 'must be an ISO 8601 date and time with an offset');
  }
  if (providedAt !== undefined && (providedAt.length > 40 || parseInstant(providedAt) === null)) {
    ctx.error('validity.providedAt', 'datetime', 'must be an ISO 8601 date and time with an offset, for example "2026-11-09T10:15:00+02:00"');
    providedAt = undefined;
  }
  const tz = o['timeZone'];
  let timeZone: string | undefined;
  if (typeof tz === 'string' && isValidTimeZone(tz)) timeZone = tz;
  else ctx.error('validity.timeZone', tz === undefined ? 'required' : 'time_zone', 'must be an IANA time zone such as "Europe/Vilnius"');

  let days: number | undefined = MINIMUM_VALIDITY_DAYS;
  if (o['days'] !== undefined) {
    const d = o['days'];
    if (typeof d === 'number' && Number.isInteger(d) && d < MINIMUM_VALIDITY_DAYS) {
      ctx.error('validity.days', 'validity_too_short', `Article 4(5) of Directive (EU) 2024/1799: at least ${String(MINIMUM_VALIDITY_DAYS)} calendar days`);
      days = undefined;
    } else {
      days = readInteger(ctx, d, 'validity.days', MINIMUM_VALIDITY_DAYS, LIMITS.validityDays);
    }
  }

  let rollForward: NormalisedRepairForm['validity']['rollForward'] | undefined = { weekends: true, publicHolidays: [] };
  const rf = o['rollForward'];
  if (rf === false) {
    rollForward = false;
  } else if (rf !== undefined) {
    const r = readObject(ctx, rf, 'validity.rollForward', ['weekends', 'publicHolidays']);
    if (!r) {
      rollForward = undefined;
    } else {
      const weekends = r['weekends'] === undefined ? true : readBoolean(ctx, r['weekends'], 'validity.rollForward.weekends');
      let publicHolidays: string[] | undefined = [];
      if (r['publicHolidays'] !== undefined) {
        const list = readArray(ctx, r['publicHolidays'], 'validity.rollForward.publicHolidays', LIMITS.publicHolidays);
        if (!list) publicHolidays = undefined;
        else {
          const dates = new Set<string>();
          list.forEach((item, i) => {
            if (typeof item === 'string' && isCivilDate(item)) dates.add(item);
            else ctx.error(`validity.rollForward.publicHolidays.${String(i)}`, 'date', 'must be a date written as YYYY-MM-DD');
          });
          publicHolidays = [...dates].sort();
        }
      }
      rollForward = weekends === undefined || publicHolidays === undefined ? undefined : { weekends, publicHolidays };
    }
  }
  if (providedAt === undefined || timeZone === undefined || days === undefined || rollForward === undefined) return undefined;
  return { providedAt, timeZone, days, rollForward };
}

const TOP_LEVEL = [
  'language',
  'repairer',
  'good',
  'defect',
  'repairType',
  'price',
  'completionDays',
  'temporaryReplacement',
  'handOverPlace',
  'ancillaryServices',
  'validity',
  'diagnostic',
  'additionalInformation',
] as const;

/**
 * Validates and normalises untrusted form data (for example parsed JSON).
 *
 * Errors make the form unusable. Warnings point at things to check but do
 * not stop a form from being created.
 *
 * @example
 * ```ts
 * const result = validateRepairForm(JSON.parse(body));
 * if (!result.ok) console.log(result.errors.map((e) => `${e.path}: ${e.code}`));
 * ```
 */
export function validateRepairForm(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const ctx = new Context();
  const currencies = new Set<Currency>();
  const o = readObject(ctx, input, '', TOP_LEVEL);
  if (!o) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };

  const language = o['language'];
  if (!isLanguage(language)) ctx.error('language', language === undefined ? 'required' : 'language', 'must be one of the 24 official EU language codes, for example "en"');
  const repairer = readRepairer(ctx, o['repairer']);
  const good = readText(ctx, o['good'], 'good', { max: LIMITS.good, multiline: true });
  const defect = readText(ctx, o['defect'], 'defect', { max: LIMITS.defect, multiline: true });
  const repairType = readText(ctx, o['repairType'], 'repairType', { max: LIMITS.repairType, multiline: true });
  const price = readPrice(ctx, o['price'], currencies);
  const completionDays = readInteger(ctx, o['completionDays'], 'completionDays', 1, LIMITS.completionDays);
  const temporaryReplacement = readReplacement(ctx, o['temporaryReplacement'], currencies);
  const handOverPlace = readText(ctx, o['handOverPlace'], 'handOverPlace', { max: LIMITS.handOverPlace, multiline: true });
  const ancillaryServices = readServices(ctx, o['ancillaryServices'], currencies);
  const validity = readValidity(ctx, o['validity'], options);
  const diagnostic = o['diagnostic'] === undefined ? undefined : readDiagnostic(ctx, o['diagnostic'], currencies);
  const additionalInformation =
    o['additionalInformation'] === undefined ? undefined : readText(ctx, o['additionalInformation'], 'additionalInformation', { max: LIMITS.additionalInformation, multiline: true });

  if (
    ctx.errors.length > 0 ||
    !isLanguage(language) ||
    !repairer ||
    good === undefined ||
    defect === undefined ||
    repairType === undefined ||
    !price ||
    completionDays === undefined ||
    !temporaryReplacement ||
    handOverPlace === undefined ||
    !ancillaryServices ||
    !validity
  ) {
    return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  }

  const providedOn = localDate(parseInstant(validity.providedAt) ?? 0, validity.timeZone);
  if (diagnostic && diagnostic.consumerInformedOn > providedOn) {
    ctx.error(
      'diagnostic.consumerInformedOn',
      'diagnostic_informed_late',
      'Article 4(3) of Directive (EU) 2024/1799 requires the repairer to inform the consumer about the costs of the diagnostic service; recital 12 says before the consumer requests it and before the form is provided',
    );
    return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  }
  if (currencies.size > 1) ctx.warn('price', 'mixed_currencies', 'the form uses more than one currency');
  if (providedOn < DIRECTIVE_2024_1799.applicationDate) {
    ctx.warn('validity.providedAt', 'before_application_date', `Member States apply the measures transposing Directive (EU) 2024/1799 from ${DIRECTIVE_2024_1799.applicationDate} (Article 22(1))`);
  }
  // Fail early if the time zone cannot express the period (never expected for valid input).
  computeValidity(validity);

  const value: NormalisedRepairForm = {
    language,
    repairer,
    good,
    defect,
    repairType,
    price,
    completionDays,
    temporaryReplacement,
    handOverPlace,
    ancillaryServices,
    validity,
    ...(diagnostic ? { diagnostic } : {}),
    ...(additionalInformation !== undefined ? { additionalInformation } : {}),
  };
  return { ok: true, value, warnings: ctx.warnings };
}
