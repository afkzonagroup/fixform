/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical JSON for hashing: object keys sorted by UTF-16 code units, no
 * white space, strings escaped as `JSON.stringify` does. This matches the
 * JSON Canonicalization Scheme (RFC 8785) for the value types a form record
 * contains (strings, booleans, null, safe integers, arrays and plain objects).
 * Object properties whose value is `undefined` are left out, as in JSON.
 * Any other type throws, so a hash can never silently depend on, for
 * example, a Date, a float or a class instance.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError('canonicalJson: only safe integers are supported');
      return String(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalJson: only plain objects are supported');
      const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}
