/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Form records: the validated data, the computed period of validity, a
 * deterministic short ID and an integrity hash.
 *
 * The same input always gives the same record, ID and hash, on any machine.
 * A repairer who keeps the record (and the exact rendered document that was
 * sent) can later show what the consumer was given: anyone can recompute the
 * hash with {@link verifyRepairForm}. The hash shows that a record was not
 * changed after it was hashed; it does not prove when or to whom the form was
 * given. Keep the sent e-mail or other delivery evidence for that.
 *
 * @packageDocumentation
 */

import { canonicalJson } from './canonical.js';
import { sha256Bytes, toCrockford, toHex, utf8 } from './sha256.js';
import { computeValidity } from './time.js';
import type { ComputedValidity, NormalisedRepairForm, RepairFormRecord } from './types.js';
import { validateRepairForm, type Issue, type ValidateOptions } from './validate.js';

/** The record format written by this version. */
export const RECORD_FORMAT = 'fixform/1';

/** Thrown by {@link createRepairForm} when the input is not valid. */
export class FixformValidationError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(`Invalid repair form: ${issues.map((i) => `${i.path || 'input'} (${i.code})`).join(', ')}`);
    this.name = 'FixformValidationError';
    this.issues = issues;
  }
}

function digest(form: NormalisedRepairForm, validity: ComputedValidity): Uint8Array {
  return sha256Bytes(utf8(canonicalJson({ format: RECORD_FORMAT, form, validity })));
}

function formId(hash: Uint8Array): string {
  const code = toCrockford(hash.subarray(0, 10));
  return `FX-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}

/**
 * Validates the input and creates the record of a European Repair
 * Information Form. Throws {@link FixformValidationError} with all issues if
 * the input is not valid.
 *
 * @example
 * ```ts
 * const record = createRepairForm(input);
 * record.id;              // 'FX-....-....-....-....'
 * record.validity.lastDay; // last day the conditions are binding
 * ```
 */
export function createRepairForm(input: unknown, options: ValidateOptions = {}): RepairFormRecord {
  const result = validateRepairForm(input, options);
  if (!result.ok) throw new FixformValidationError(result.errors);
  const form = result.value;
  const validity = computeValidity(form.validity);
  const hash = digest(form, validity);
  return { format: RECORD_FORMAT, id: formId(hash), integrity: `sha256-${toHex(hash)}`, form, validity };
}

export type VerifyResult = { readonly ok: true; readonly record: RepairFormRecord } | { readonly ok: false; readonly reason: string };

/**
 * Checks a stored record (for example parsed from JSON): the data is valid
 * and already normalised, the period of validity is computed correctly, and
 * the ID and integrity hash match. Returns the record rebuilt from the
 * validated data.
 */
export function verifyRepairForm(value: unknown): VerifyResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reason: 'not an object' };
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'form,format,id,integrity,validity') return { ok: false, reason: 'unexpected fields' };
  const v = value as Record<string, unknown>;
  if (v['format'] !== RECORD_FORMAT) return { ok: false, reason: 'unsupported format' };
  let rebuilt: RepairFormRecord;
  try {
    rebuilt = createRepairForm(v['form']);
  } catch (error) {
    return { ok: false, reason: error instanceof FixformValidationError ? 'invalid form data' : 'invalid record' };
  }
  let stored: string;
  try {
    stored = canonicalJson({ form: v['form'], validity: v['validity'] });
  } catch {
    return { ok: false, reason: 'invalid record' };
  }
  if (stored !== canonicalJson({ form: rebuilt.form, validity: rebuilt.validity })) return { ok: false, reason: 'data or validity does not match' };
  if (v['integrity'] !== rebuilt.integrity) return { ok: false, reason: 'integrity hash does not match' };
  if (v['id'] !== rebuilt.id) return { ok: false, reason: 'ID does not match' };
  return { ok: true, record: rebuilt };
}

/** Like {@link verifyRepairForm} but throws a `TypeError` with the reason. Used by the renderers. */
export function assertRecord(value: unknown): RepairFormRecord {
  const result = verifyRepairForm(value);
  if (!result.ok) throw new TypeError(`Not a valid repair form record: ${result.reason}`);
  return result.record;
}
