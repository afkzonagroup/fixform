/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dates, time zones and the period of validity of the form.
 *
 * Article 4(5) of Directive (EU) 2024/1799: "The repairer shall not alter the
 * conditions of repair specified in the European Repair Information Form for
 * a period of 30 calendar days from the date on which that form was provided
 * to the consumer. The repairer and the consumer may agree on a longer period
 * of validity".
 *
 * The directive does not say how the days are counted. Fixform counts them
 * the way Article 3 of Regulation (EEC, Euratom) No 1182/71 counts periods in
 * EU acts:
 *
 * - Article 3(1): the day on which the form is provided is not counted;
 * - Article 3(2)(b): the period ends with the expiry of the last hour of the
 *   last day;
 * - Article 3(3): calendar days include Saturdays, Sundays and public holidays;
 * - Article 3(4): if the last day is a public holiday, Sunday or Saturday, the
 *   period ends with the expiry of the last hour of the following working day.
 *
 * Article 3(4) is applied by default for weekends, and for public holidays the
 * caller lists. It only ever makes the period longer, so the form never states
 * less than the minimum. National law transposing the directive decides how
 * the period is counted; check it.
 *
 * @packageDocumentation
 */

import type { ComputedValidity, NormalisedRepairForm } from './types.js';

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 86_400_000;

/** Earliest and latest years accepted in dates. The directive was adopted in 2024. */
export const MIN_YEAR = 2024;
export const MAX_YEAR = 2199;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validCivil(year: number, month: number, day: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Parses an ISO 8601 date and time with a UTC offset ("Z" or "+02:00").
 * Returns milliseconds since the epoch, or `null` when the text is not a
 * valid, unambiguous instant. Local times without an offset are rejected.
 */
export function parseInstant(text: string): number | null {
  const m = INSTANT.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (!validCivil(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  const fraction = m[7] === undefined ? 0 : Number(`0.${m[7]}`);
  const zone = m[8] ?? 'Z';
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 14 || om > 59) return null;
    offsetMinutes = sign * (oh * 60 + om);
  }
  return Date.UTC(year, month - 1, day, hour, minute, second) + Math.floor(fraction * 1000) - offsetMinutes * 60_000;
}

/** True for a valid calendar date written as YYYY-MM-DD. */
export function isCivilDate(text: string): boolean {
  const m = DATE.exec(text);
  return m !== null && validCivil(Number(m[1]), Number(m[2]), Number(m[3]));
}

const TZ_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/u;
const formatters = new Map<string, Intl.DateTimeFormat>();
const MAX_CACHED_ZONES = 64;

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    if (formatters.size >= MAX_CACHED_ZONES) formatters.clear();
    formatters.set(timeZone, f);
  }
  return f;
}

/** True for an IANA time zone name known to the runtime, such as "Europe/Vilnius". */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length > 64 || !TZ_NAME.test(timeZone)) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(epochMs: number, timeZone: string): string {
  const parts = formatter(timeZone).formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}

function civilToUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function utcMsToCivil(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Adds calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  return utcMsToCivil(civilToUtcMs(date) + days * DAY_MS);
}

/** Day of the week of a YYYY-MM-DD date: 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(civilToUtcMs(date)).getUTCDay();
}

/**
 * The first instant (epoch ms) at which the local date in `timeZone` is
 * `date` or later: the start of that day. Handles days that do not begin at
 * 00:00 because of a daylight-saving change.
 */
export function startOfDay(date: string, timeZone: string): number {
  const nominal = civilToUtcMs(date);
  // Every UTC offset in use lies within +-14 hours, so the start of the day is in this window.
  let low = nominal - 15 * 3_600_000;
  let high = nominal + 15 * 3_600_000;
  while (high - low > 1000) {
    const mid = low + Math.floor((high - low) / 2000) * 1000;
    if (localDate(mid, timeZone) >= date) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * Computes the period of validity of a form (Article 4(5) of Directive (EU)
 * 2024/1799, counted as described in this module's documentation).
 *
 * @example
 * ```ts
 * computeValidity({ providedAt: '2026-11-09T10:00:00+02:00', timeZone: 'Europe/Vilnius', days: 30, rollForward: false });
 * // { providedOn: '2026-11-09', lastDay: '2026-12-09', endsAt: '2026-12-09T22:00:00.000Z', ... }
 * ```
 */
export function computeValidity(validity: NormalisedRepairForm['validity']): ComputedValidity {
  const provided = parseInstant(validity.providedAt);
  if (provided === null) throw new RangeError('providedAt is not a valid instant');
  const providedOn = localDate(provided, validity.timeZone);
  let lastDay = addDays(providedOn, validity.days);
  if (validity.rollForward !== false) {
    const holidays = new Set(validity.rollForward.publicHolidays);
    const weekends = validity.rollForward.weekends;
    // Bounded: at most a run of listed holidays plus a weekend.
    for (let guard = 0; guard < 400; guard += 1) {
      const dow = weekday(lastDay);
      if ((weekends && (dow === 0 || dow === 6)) || holidays.has(lastDay)) lastDay = addDays(lastDay, 1);
      else break;
    }
  }
  const endsAt = new Date(startOfDay(addDays(lastDay, 1), validity.timeZone)).toISOString();
  return { providedOn, lastDay, endsAt, timeZone: validity.timeZone, days: validity.days };
}
