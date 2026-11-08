/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/** The 24 official languages of the European Union, as ISO 639-1 codes. */
export type Language =
  | 'bg' | 'es' | 'cs' | 'da' | 'de' | 'et' | 'el' | 'en' | 'fr' | 'ga' | 'hr' | 'it'
  | 'lv' | 'lt' | 'hu' | 'mt' | 'nl' | 'pl' | 'pt' | 'ro' | 'sk' | 'sl' | 'fi' | 'sv';

/** Keys of the rows of Annex I, in the order of the official form. */
export type AnnexRowKey =
  | 'repairer'
  | 'address'
  | 'telephone'
  | 'email'
  | 'otherMeans'
  | 'good'
  | 'defect'
  | 'repairType'
  | 'price'
  | 'completionTime'
  | 'replacementAvailable'
  | 'replacementCost'
  | 'handOverPlace'
  | 'ancillaryServices'
  | 'ancillaryCosts'
  | 'validity'
  | 'additionalInformation';

/** One row of the official form: the heading (left column) and, where the form has one, the explanation in square brackets. */
export interface AnnexRow {
  readonly label: string;
  /** The indication in square brackets. Annex I: "Indications between square brackets provide explanations for the repairer and must be replaced with the corresponding information." */
  readonly hint: string | null;
}

/** Annex I of Directive (EU) 2024/1799 in one language, verbatim from the Official Journal. */
export interface OfficialAnnexText {
  readonly language: Language;
  readonly source: 'official';
  /** The EUR-Lex page the text was taken from. */
  readonly url: string;
  readonly annexTitle: string;
  readonly formTitle: string;
  readonly partOne: { readonly label: string; readonly heading: string };
  readonly partTwo: { readonly label: string; readonly heading: string };
  readonly rows: { readonly [K in AnnexRowKey]: AnnexRow };
  /** The closing sentence about the indications in square brackets. */
  readonly note: string;
  /** The words the form tells the repairer to use, quoted in the official explanations: 'Yes', 'No' and 'None'. */
  readonly words: { readonly yes: string; readonly no: string; readonly none: string };
  /** SHA-256 (hex) of the JSON array of all strings above in document order. See `annexChecksumInput`. */
  readonly sha256: string;
}
