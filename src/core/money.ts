/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Amounts of money as decimal strings. No floating point is used for
 * amounts, and formatting does not depend on the runtime's locale data, so a
 * rendered form is byte-for-byte the same on every machine.
 *
 * @packageDocumentation
 */

import type { Language } from '../annex/types.js';
import type { Currency, Money } from './types.js';

/** Accepted currencies and their number of decimal places (ISO 4217 minor units, ISK has none). */
export const CURRENCIES: Readonly<Record<Currency, number>> = {
  EUR: 2,
  CZK: 2,
  DKK: 2,
  HUF: 2,
  PLN: 2,
  RON: 2,
  SEK: 2,
  ISK: 0,
  CHF: 2,
  NOK: 2,
};

/** True for an accepted ISO 4217 currency code. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && Object.hasOwn(CURRENCIES, value);
}

/** Largest accepted amount in whole units (999 999 999). */
const AMOUNT = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/u;

/**
 * Normalises an amount to the currency's number of decimal places, for
 * example "129.9" EUR to "129.90". Returns `null` for anything else: negative
 * numbers, exponents, more decimals than the currency has, or more than nine
 * digits before the decimal point.
 */
export function normaliseAmount(amount: string, currency: Currency): string | null {
  const m = AMOUNT.exec(amount);
  if (!m) return null;
  const whole = m[1] ?? '0';
  const fraction = m[2] ?? '';
  const digits = CURRENCIES[currency];
  if (fraction.length > digits) {
    // Trailing zeros beyond the minor unit are harmless ("1500.00" ISK).
    if (!/^0+$/u.test(fraction.slice(digits))) return null;
  }
  if (digits === 0) return whole;
  return `${whole}.${fraction.slice(0, digits).padEnd(digits, '0')}`;
}

/** True when the amount is zero. */
export function isZero(money: Money): boolean {
  return /^0(?:\.0+)?$/u.test(money.amount);
}

/** Decimal separator and digit-group separator per language (common written usage). */
const SEPARATORS: Readonly<Record<Language, readonly [decimal: string, group: string]>> = {
  bg: [',', '\u00a0'],
  cs: [',', '\u00a0'],
  da: [',', '.'],
  de: [',', '.'],
  el: [',', '.'],
  en: ['.', ','],
  es: [',', '.'],
  et: [',', '\u00a0'],
  fi: [',', '\u00a0'],
  fr: [',', '\u00a0'],
  ga: ['.', ','],
  hr: [',', '.'],
  hu: [',', '\u00a0'],
  it: [',', '.'],
  lt: [',', '\u00a0'],
  lv: [',', '\u00a0'],
  mt: ['.', ','],
  nl: [',', '.'],
  pl: [',', '\u00a0'],
  pt: [',', '\u00a0'],
  ro: [',', '.'],
  sk: [',', '\u00a0'],
  sl: [',', '.'],
  sv: [',', '\u00a0'],
};

/**
 * Formats an amount for a language: "1,299.00 EUR" in English,
 * "1.299,00 EUR" in German. The ISO currency code is used rather than a
 * symbol, as the official text does ("EUR/national currency").
 */
export function formatMoney(money: Money, language: Language): string {
  const [decimal, group] = SEPARATORS[language];
  const [whole = '0', fraction] = money.amount.split('.');
  let grouped = '';
  for (let i = 0; i < whole.length; i += 1) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += group;
    grouped += whole.charAt(i);
  }
  return `${grouped}${fraction === undefined ? '' : decimal + fraction}\u00a0${money.currency}`;
}
