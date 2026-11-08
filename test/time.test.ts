import { describe, expect, it } from 'vitest';
import { addDays, computeValidity, isCivilDate, isValidTimeZone, localDate, parseInstant, startOfDay, weekday } from '../src/core/time.js';

type V = Parameters<typeof computeValidity>[0];
const v = (providedAt: string, timeZone: string, days = 30, rollForward: V['rollForward'] = false): V => ({ providedAt, timeZone, days, rollForward });

describe('parseInstant', () => {
  it('accepts ISO 8601 date-times with an offset', () => {
    expect(parseInstant('2026-11-09T10:15:00Z')).toBe(Date.UTC(2026, 10, 9, 10, 15));
    expect(parseInstant('2026-11-09T10:15:00+02:00')).toBe(Date.UTC(2026, 10, 9, 8, 15));
    expect(parseInstant('2026-11-09T10:15-01:30')).toBe(Date.UTC(2026, 10, 9, 11, 45));
    expect(parseInstant('2026-11-09T10:15:00.123456789Z')).toBe(Date.UTC(2026, 10, 9, 10, 15, 0, 123));
    expect(parseInstant('2028-02-29T00:00:00Z')).toBe(Date.UTC(2028, 1, 29));
  });

  it('rejects local times, impossible dates and other formats', () => {
    for (const bad of [
      '2026-11-09T10:15:00',
      '2026-11-09',
      '2026-02-29T00:00:00Z',
      '2026-13-01T00:00:00Z',
      '2026-11-31T00:00:00Z',
      '2026-11-09T24:00:00Z',
      '2026-11-09T10:60:00Z',
      '2026-11-09T10:15:60Z',
      '2026-11-09T10:15:00+15:00',
      '2026-11-09T10:15:00+02:60',
      '2023-12-31T23:59:59Z',
      '2200-01-01T00:00:00Z',
      '2026-11-09 10:15:00Z',
      ' 2026-11-09T10:15:00Z',
      '+002026-11-09T10:15:00Z',
    ]) {
      expect(parseInstant(bad), bad).toBeNull();
    }
  });
});

describe('dates and time zones', () => {
  it('validates civil dates', () => {
    expect(isCivilDate('2028-02-29')).toBe(true);
    expect(isCivilDate('2026-02-29')).toBe(false);
    expect(isCivilDate('2026-4-01')).toBe(false);
  });

  it('validates IANA time zones and rejects odd input before asking Intl', () => {
    expect(isValidTimeZone('Europe/Vilnius')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('Europe/../../etc')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('A'.repeat(65))).toBe(false);
  });

  it('adds days across month and year ends, and in leap years', () => {
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
    expect(addDays('2028-01-31', 30)).toBe('2028-03-01');
    expect(addDays('2026-12-15', 30)).toBe('2027-01-14');
    expect(weekday('2026-11-09')).toBe(1);
  });

  it('takes the date in the repairer time zone, not in UTC', () => {
    // 23:30 UTC on 8 November is already 9 November in Vilnius (UTC+2).
    expect(localDate(Date.UTC(2026, 10, 8, 23, 30), 'Europe/Vilnius')).toBe('2026-11-09');
    expect(localDate(Date.UTC(2026, 10, 8, 23, 30), 'Atlantic/Azores')).toBe('2026-11-08');
  });

  it('finds the start of a day, also when midnight does not exist (DST at 00:00)', () => {
    expect(new Date(startOfDay('2026-11-10', 'Europe/Vilnius')).toISOString()).toBe('2026-11-09T22:00:00.000Z');
    // Chile moves clocks from 00:00 to 01:00 on 6 September 2026.
    const start = startOfDay('2026-09-06', 'America/Santiago');
    expect(localDate(start, 'America/Santiago')).toBe('2026-09-06');
    expect(localDate(start - 1000, 'America/Santiago')).toBe('2026-09-05');
  });
});

describe('computeValidity (Article 4(5) of Directive (EU) 2024/1799)', () => {
  it('30 calendar days; the day of provision is not counted; ends at the end of the last day', () => {
    const r = computeValidity(v('2026-11-09T10:15:00+02:00', 'Europe/Vilnius'));
    expect(r).toEqual({ providedOn: '2026-11-09', lastDay: '2026-12-09', endsAt: '2026-12-09T22:00:00.000Z', timeZone: 'Europe/Vilnius', days: 30 });
  });

  it('uses the repairer time zone for the day of provision', () => {
    expect(computeValidity(v('2026-11-08T23:30:00Z', 'Europe/Vilnius')).providedOn).toBe('2026-11-09');
    expect(computeValidity(v('2026-11-08T23:30:00Z', 'Europe/Lisbon')).providedOn).toBe('2026-11-08');
  });

  it('month ends and leap years', () => {
    expect(computeValidity(v('2026-01-31T12:00:00Z', 'Europe/Berlin')).lastDay).toBe('2026-03-02');
    expect(computeValidity(v('2028-01-31T12:00:00Z', 'Europe/Berlin')).lastDay).toBe('2028-03-01');
    expect(computeValidity(v('2026-02-28T12:00:00Z', 'Europe/Berlin')).lastDay).toBe('2026-03-30');
    expect(computeValidity(v('2026-12-31T12:00:00Z', 'Europe/Berlin')).lastDay).toBe('2027-01-30');
  });

  it('spring-forward DST change inside the period (Vilnius, 29 March 2026)', () => {
    const r = computeValidity(v('2026-03-20T09:00:00+02:00', 'Europe/Vilnius'));
    expect(r.lastDay).toBe('2026-04-19');
    // After the change Vilnius is UTC+3, so the day ends at 21:00 UTC, not 22:00.
    expect(r.endsAt).toBe('2026-04-19T21:00:00.000Z');
  });

  it('fall-back DST change inside the period (Paris, 25 October 2026)', () => {
    const r = computeValidity(v('2026-10-10T09:00:00+02:00', 'Europe/Paris'));
    expect(r.lastDay).toBe('2026-11-09');
    expect(r.endsAt).toBe('2026-11-09T23:00:00.000Z');
  });

  it('provided during the DST change night itself', () => {
    const r = computeValidity(v('2026-03-29T00:30:00Z', 'Europe/Vilnius'));
    expect(r.providedOn).toBe('2026-03-29');
    expect(r.lastDay).toBe('2026-04-28');
    expect(r.endsAt).toBe('2026-04-28T21:00:00.000Z');
  });

  it('a longer agreed period', () => {
    expect(computeValidity(v('2026-11-09T10:00:00Z', 'Europe/Dublin', 60)).lastDay).toBe('2027-01-08');
  });

  it('rolls the last day past a weekend and listed public holidays (Regulation 1182/71, Article 3(4))', () => {
    // 2026-11-01 + 30 = 2026-12-01 (Tuesday): no change.
    expect(computeValidity(v('2026-11-01T10:00:00Z', 'Europe/Riga', 30, { weekends: true, publicHolidays: [] })).lastDay).toBe('2026-12-01');
    // 2026-11-07 + 30 = 2026-12-07 (Monday); 2026-11-05 + 30 = 2026-12-05 (Saturday) -> Monday 2026-12-07.
    expect(computeValidity(v('2026-11-05T10:00:00Z', 'Europe/Riga', 30, { weekends: true, publicHolidays: [] })).lastDay).toBe('2026-12-07');
    // 2026-11-25 + 30 = 2026-12-25 (Friday, a holiday) -> Saturday, Sunday -> Monday 2026-12-28; also a listed holiday -> 2026-12-29.
    expect(computeValidity(v('2026-11-25T10:00:00Z', 'Europe/Riga', 30, { weekends: true, publicHolidays: ['2026-12-25', '2026-12-28'] })).lastDay).toBe('2026-12-29');
    // Holidays only, no weekend rule.
    expect(computeValidity(v('2026-11-05T10:00:00Z', 'Europe/Riga', 30, { weekends: false, publicHolidays: ['2026-12-05'] })).lastDay).toBe('2026-12-06');
    expect(computeValidity(v('2026-11-05T10:00:00Z', 'Europe/Riga', 30, false)).lastDay).toBe('2026-12-05');
  });

  it('throws on an invalid instant (validation normally prevents this)', () => {
    expect(() => computeValidity(v('nope', 'UTC'))).toThrow(RangeError);
  });
});
