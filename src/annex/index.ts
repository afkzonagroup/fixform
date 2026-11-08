/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Annex I of Directive (EU) 2024/1799, the European Repair Information Form,
 * verbatim in all 24 official languages.
 *
 * @packageDocumentation
 */

import { OFFICIAL_ANNEX } from './data.js';
import type { AnnexRowKey, Language, OfficialAnnexText } from './types.js';

export type { AnnexRow, AnnexRowKey, Language, OfficialAnnexText } from './types.js';
export { OFFICIAL_ANNEX } from './data.js';

/** The 24 official EU languages in the protocol order used by the Official Journal. */
export const LANGUAGES: readonly Language[] = [
  'bg', 'es', 'cs', 'da', 'de', 'et', 'el', 'en', 'fr', 'ga', 'hr', 'it',
  'lv', 'lt', 'hu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'fi', 'sv',
];

/** Rows of Part I ("Identity and contact details of the repairer providing the repair service"). */
export const PART_ONE_ROWS: readonly AnnexRowKey[] = ['repairer', 'address', 'telephone', 'email', 'otherMeans'];

/** Rows of Part II ("Information on the repair service"). */
export const PART_TWO_ROWS: readonly AnnexRowKey[] = [
  'good',
  'defect',
  'repairType',
  'price',
  'completionTime',
  'replacementAvailable',
  'replacementCost',
  'handOverPlace',
  'ancillaryServices',
  'ancillaryCosts',
  'validity',
  'additionalInformation',
];

const LANGUAGE_SET: ReadonlySet<string> = new Set(LANGUAGES);

/** True for one of the 24 supported language codes. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGE_SET.has(value);
}

const BY_LANGUAGE: ReadonlyMap<Language, OfficialAnnexText> = new Map(OFFICIAL_ANNEX.map((text) => [text.language, text]));

/**
 * The official Annex I text in one language.
 *
 * @example
 * ```ts
 * annexText('de').rows.repairer.label; // 'Reparaturbetrieb'
 * ```
 */
export function annexText(language: Language): OfficialAnnexText {
  const text = BY_LANGUAGE.get(language);
  if (!text) throw new RangeError(`Unsupported language: ${language}`);
  return text;
}

/** The strings whose JSON array is hashed into {@link OfficialAnnexText.sha256}, in document order. */
export function annexChecksumInput(text: OfficialAnnexText): (string | null)[] {
  const row = (key: AnnexRowKey): (string | null)[] => [text.rows[key].label, text.rows[key].hint];
  return [
    text.annexTitle,
    text.formTitle,
    text.partOne.label,
    text.partOne.heading,
    ...PART_ONE_ROWS.flatMap(row),
    text.partTwo.label,
    text.partTwo.heading,
    ...PART_TWO_ROWS.flatMap(row),
    text.note,
  ];
}
