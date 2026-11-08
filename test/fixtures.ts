/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Language, RepairFormInput } from '../src/index.js';

/** A complete, valid form. Every call returns a fresh object. */
export function validInput(language: Language = 'en'): RepairFormInput {
  return {
    language,
    repairer: {
      identity: 'Example Repairs Ltd',
      address: '1 Example Street\n01100 Vilnius',
      telephone: '+370 600 00000',
      email: 'repairs@example.com',
      otherMeans: ['Chat: https://example.com/chat'],
    },
    good: 'Washing machine, model Y, serial 12345',
    defect: 'The drum does not turn.',
    repairType: 'Replace the drive belt.',
    price: { type: 'fixed', total: { amount: '89.00', currency: 'EUR' } },
    completionDays: 5,
    temporaryReplacement: { available: true, cost: { amount: '0', currency: 'EUR' } },
    handOverPlace: 'At the shop',
    ancillaryServices: [{ description: 'Collection and return', cost: { amount: '20', currency: 'EUR' } }],
    validity: { providedAt: '2026-11-09T10:15:00+02:00', timeZone: 'Europe/Vilnius' },
    diagnostic: { cost: { amount: '25', currency: 'EUR' }, consumerInformedOn: '2026-11-06', deductedFromRepairPrice: true },
    additionalInformation: 'Spare parts are new.',
  };
}

/** A deep, mutable copy of the valid form as plain JSON data, for tests that break it. */
export function mutableInput(language: Language = 'en'): Record<string, unknown> & { repairer: Record<string, unknown>; validity: Record<string, unknown> } {
  return JSON.parse(JSON.stringify(validInput(language))) as Record<string, unknown> & { repairer: Record<string, unknown>; validity: Record<string, unknown> };
}
