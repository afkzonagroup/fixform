/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JSON Schema (draft 2020-12) of the form input. It describes the structure
 * and the limits that a schema can express. Rules that need computation (time
 * zones, calendar dates, the diagnostic-cost date) are checked only by
 * `validateRepairForm`, which is the authority. The file
 * `data/repair-form.schema.json` is generated from this object.
 *
 * @packageDocumentation
 */

import { LANGUAGES } from '../annex/index.js';
import { CURRENCIES } from './money.js';
import { LIMITS } from './validate.js';

const singleLine = (maxLength: number): Record<string, unknown> => ({ type: 'string', minLength: 1, maxLength, pattern: '^[^\\n]*\\S[^\\n]*$' });
const multiLine = (maxLength: number): Record<string, unknown> => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });

const money = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'currency'],
  properties: {
    amount: {
      description: 'Decimal string such as "129.90" (a JSON number is also accepted). At most 9 digits before the decimal point; at most 2 decimals (none for ISK).',
      oneOf: [
        { type: 'string', pattern: '^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?$' },
        { type: 'number', minimum: 0, maximum: 999999999.99 },
      ],
    },
    currency: { enum: Object.keys(CURRENCIES) },
  },
};

/** The schema object. */
export const REPAIR_FORM_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/afkzonagroup/fixform/blob/main/data/repair-form.schema.json',
  title: 'European Repair Information Form (Directive (EU) 2024/1799, Annex I)',
  type: 'object',
  additionalProperties: false,
  required: ['language', 'repairer', 'good', 'defect', 'repairType', 'price', 'completionDays', 'temporaryReplacement', 'handOverPlace', 'ancillaryServices', 'validity'],
  $defs: { money },
  properties: {
    language: { enum: [...LANGUAGES] },
    repairer: {
      type: 'object',
      additionalProperties: false,
      required: ['identity', 'address', 'telephone', 'email'],
      properties: {
        identity: singleLine(LIMITS.identity),
        address: multiLine(LIMITS.address),
        telephone: { type: 'string', maxLength: LIMITS.telephone, pattern: '^\\s*\\+?\\(?[0-9][0-9 ()./-]{2,38}\\s*$' },
        email: { type: 'string', maxLength: LIMITS.email, pattern: '^\\s*[^@\\s]+@[^@\\s]+\\.[^@\\s]+\\s*$' },
        otherMeans: { type: 'array', maxItems: LIMITS.otherMeansCount, items: singleLine(LIMITS.otherMeans) },
      },
    },
    good: multiLine(LIMITS.good),
    defect: multiLine(LIMITS.defect),
    repairType: multiLine(LIMITS.repairType),
    price: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'total'],
          properties: { type: { const: 'fixed' }, total: { $ref: '#/$defs/money' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'calculationMethod', 'maximum'],
          properties: { type: { const: 'maximum' }, calculationMethod: multiLine(LIMITS.calculationMethod), maximum: { $ref: '#/$defs/money' } },
        },
      ],
    },
    completionDays: { type: 'integer', minimum: 1, maximum: LIMITS.completionDays },
    temporaryReplacement: {
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['available'], properties: { available: { const: false } } },
        {
          type: 'object',
          additionalProperties: false,
          required: ['available', 'cost'],
          properties: { available: { const: true }, cost: { $ref: '#/$defs/money' } },
        },
      ],
    },
    handOverPlace: multiLine(LIMITS.handOverPlace),
    ancillaryServices: {
      type: 'array',
      maxItems: LIMITS.servicesCount,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'cost'],
        properties: { description: singleLine(LIMITS.serviceDescription), cost: { $ref: '#/$defs/money' } },
      },
    },
    validity: {
      type: 'object',
      additionalProperties: false,
      required: ['providedAt', 'timeZone'],
      properties: {
        providedAt: {
          type: 'string',
          maxLength: 40,
          pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]{1,9})?)?(Z|[+-][0-9]{2}:[0-9]{2})$',
        },
        timeZone: { type: 'string', maxLength: LIMITS.timeZone, pattern: '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$' },
        days: { type: 'integer', minimum: 30, maximum: LIMITS.validityDays },
        rollForward: {
          oneOf: [
            { const: false },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                weekends: { type: 'boolean' },
                publicHolidays: { type: 'array', maxItems: LIMITS.publicHolidays, items: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
              },
            },
          ],
        },
      },
    },
    diagnostic: {
      type: 'object',
      additionalProperties: false,
      required: ['cost', 'consumerInformedOn', 'deductedFromRepairPrice'],
      properties: {
        cost: { $ref: '#/$defs/money' },
        consumerInformedOn: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
        deductedFromRepairPrice: { type: 'boolean' },
      },
    },
    additionalInformation: multiLine(LIMITS.additionalInformation),
  },
} as const;
