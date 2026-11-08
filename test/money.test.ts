import { describe, expect, it } from 'vitest';
import { formatMoney, isCurrency, normaliseAmount } from '../src/core/money.js';
import { isZero } from '../src/core/money.js';

describe('amounts', () => {
  it('normalises to the currency minor unit', () => {
    expect(normaliseAmount('129.9', 'EUR')).toBe('129.90');
    expect(normaliseAmount('129', 'EUR')).toBe('129.00');
    expect(normaliseAmount('0', 'EUR')).toBe('0.00');
    expect(normaliseAmount('999999999.99', 'EUR')).toBe('999999999.99');
    expect(normaliseAmount('1500', 'ISK')).toBe('1500');
    expect(normaliseAmount('1500.00', 'ISK')).toBe('1500');
  });

  it('rejects negative, oversized, exponent and over-precise amounts', () => {
    for (const bad of ['-1', '1e3', '1000000000', '01', '1.', '.5', '1.234', '1,50', ' 1', 'NaN', 'Infinity', '0x10', '1500.5']) {
      expect(normaliseAmount(bad, bad === '1500.5' ? 'ISK' : 'EUR'), bad).toBeNull();
    }
  });

  it('currency allow-list', () => {
    expect(isCurrency('EUR')).toBe(true);
    expect(isCurrency('BGN')).toBe(false);
    expect(isCurrency('USD')).toBe(false);
    expect(isCurrency('toString')).toBe(false);
    expect(isCurrency('__proto__')).toBe(false);
  });

  it('formats per language without locale data', () => {
    expect(formatMoney({ amount: '1299.00', currency: 'EUR' }, 'en')).toBe('1,299.00\u{a0}EUR');
    expect(formatMoney({ amount: '1299.00', currency: 'EUR' }, 'de')).toBe('1.299,00\u{a0}EUR');
    expect(formatMoney({ amount: '1299.00', currency: 'EUR' }, 'fr')).toBe('1\u{a0}299,00\u{a0}EUR');
    expect(formatMoney({ amount: '1234567.50', currency: 'SEK' }, 'sv')).toBe('1\u{a0}234\u{a0}567,50\u{a0}SEK');
    expect(formatMoney({ amount: '15000', currency: 'ISK' }, 'en')).toBe('15,000\u{a0}ISK');
    expect(formatMoney({ amount: '0.00', currency: 'EUR' }, 'lt')).toBe('0,00\u{a0}EUR');
    expect(formatMoney({ amount: '999', currency: 'EUR' }, 'en')).toBe('999\u{a0}EUR');
  });

  it('isZero', () => {
    expect(isZero({ amount: '0.00', currency: 'EUR' })).toBe(true);
    expect(isZero({ amount: '0.01', currency: 'EUR' })).toBe(false);
  });
});
