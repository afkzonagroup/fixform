import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical.js';
import { sha256Bytes, sha256Hex, toBase64, toCrockford, toHex, utf8 } from '../src/core/sha256.js';

describe('sha256', () => {
  it('matches the FIPS 180-4 examples', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('matches node:crypto for every length around the block boundaries and for random data', () => {
    for (let length = 0; length < 200; length += 1) {
      const data = randomBytes(length);
      expect(toHex(sha256Bytes(data))).toBe(createHash('sha256').update(data).digest('hex'));
    }
    const text = 'Ąčę ΕΛΛΗΝΙΚΆ 漢字 \u{1F527}';
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });

  it('base64 matches Buffer for all padding cases', () => {
    for (let length = 0; length < 40; length += 1) {
      const data = randomBytes(length);
      expect(toBase64(data)).toBe(Buffer.from(data).toString('base64'));
    }
    expect(toBase64(utf8('Ž'))).toBe(Buffer.from('Ž', 'utf8').toString('base64'));
  });

  it('crockford base32', () => {
    expect(toCrockford(new Uint8Array([0, 0, 0, 0, 0]))).toBe('00000000');
    expect(toCrockford(new Uint8Array([255, 255, 255, 255, 255]))).toBe('ZZZZZZZZ');
    expect(toCrockford(new Uint8Array([1]))).toBe('04');
    expect(toCrockford(new Uint8Array(10).fill(0xaa))).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/u);
  });
});

describe('canonicalJson', () => {
  it('sorts keys by UTF-16 code units and drops undefined properties', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined, A: { z: 1, y: 2 } })).toBe('{"A":{"y":2,"z":1},"a":[true,null,"x"],"b":1}');
    expect(canonicalJson({ é: 1, e: 2, '\u{1F600}': 3, 'ﬁ': 4 })).toBe('{"e":2,"é":1,"\u{1F600}":3,"ﬁ":4}');
  });

  it('is independent of insertion order', () => {
    expect(canonicalJson({ x: 1, y: { b: 2, a: 1 } })).toBe(canonicalJson({ y: { a: 1, b: 2 }, x: 1 }));
  });

  it('rejects values that would make the hash ambiguous', () => {
    expect(() => canonicalJson(1.5)).toThrow(TypeError);
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(new Date(0))).toThrow(TypeError);
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson(10n)).toThrow(TypeError);
    expect(() => canonicalJson(new Map())).toThrow(TypeError);
    expect(canonicalJson(Object.create(null) as object)).toBe('{}');
  });
});
