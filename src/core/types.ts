/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Language } from '../annex/types.js';

/**
 * Currencies accepted for amounts. Annex I asks for amounts "in EUR/national
 * currency": the euro and the national currencies of the EU and EEA states
 * that do not use the euro (Czechia, Denmark, Hungary, Poland, Romania,
 * Sweden; Iceland, Liechtenstein, Norway). Bulgaria uses the euro since
 * 1 January 2026 (Council Decision (EU) 2025/1407).
 */
export type Currency = 'EUR' | 'CZK' | 'DKK' | 'HUF' | 'PLN' | 'RON' | 'SEK' | 'ISK' | 'CHF' | 'NOK';

/** An amount of money. `amount` is a decimal string such as "129.90", never a float. */
export interface Money {
  readonly amount: string;
  readonly currency: Currency;
}

/**
 * The price of the repair. Article 4(4)(e): "the price or, if the price cannot
 * reasonably be calculated in advance, the manner in which the price is to be
 * calculated and the maximum price for the repair".
 */
export type Price =
  | { readonly type: 'fixed'; readonly total: Money }
  | { readonly type: 'maximum'; readonly calculationMethod: string; readonly maximum: Money };

/** Part I of Annex I. Article 4(4)(a) and (b). */
export interface Repairer {
  /** "[Identity]": the name of the repairer. */
  readonly identity: string;
  /** "[Geographical address to be used by the consumer]". May contain line breaks. */
  readonly address: string;
  readonly telephone: string;
  readonly email: string;
  /** Other means of online communication, if the repairer provides them (for example a chat or a web address). */
  readonly otherMeans?: readonly string[];
}

/** Article 4(4)(g): availability of temporary replacement goods and their cost, if any. */
export type TemporaryReplacement = { readonly available: false } | { readonly available: true; readonly cost: Money };

/** Article 4(4)(i): an ancillary service (such as removal, installation or transportation) and its cost. */
export interface AncillaryService {
  readonly description: string;
  readonly cost: Money;
}

/**
 * Article 4(3): a paid diagnostic service. The repairer may ask the consumer
 * to pay the necessary costs of a diagnostic service and must inform the
 * consumer about those costs. Recital 12 says this should happen before the
 * consumer requests the diagnostic service and before the form is provided,
 * and that a deduction of these costs from the repair price "could be
 * communicated through the European Repair Information Form".
 */
export interface DiagnosticService {
  readonly cost: Money;
  /** The day (YYYY-MM-DD, in the repairer's time zone) the consumer was informed about the cost. */
  readonly consumerInformedOn: string;
  /** Whether the cost is deducted from the repair price if the consumer has the good repaired. */
  readonly deductedFromRepairPrice: boolean;
}

/** How the end of the period of validity is counted. See `computeValidity`. */
export interface RollForward {
  /** Move the last day past Saturdays and Sundays. Default `true`. */
  readonly weekends?: boolean;
  /** Public holidays (YYYY-MM-DD) in the repairer's Member State. Default none. */
  readonly publicHolidays?: readonly string[];
}

/** Article 4(5): the period of validity. */
export interface ValidityInput {
  /** When the form is provided to the consumer: ISO 8601 date and time with an offset, for example "2026-11-09T10:15:00+02:00". */
  readonly providedAt: string;
  /** The repairer's IANA time zone, for example "Europe/Vilnius". Days are counted in this zone. */
  readonly timeZone: string;
  /** Period of validity in calendar days. At least 30 (Article 4(5)); a longer period may be agreed. Default 30. */
  readonly days?: number;
  /** Default: roll the last day forward past weekends. `false` counts exactly `days` days. */
  readonly rollForward?: RollForward | false;
}

/** The data of a European Repair Information Form (Annex I) as the repairer fills it in. */
export interface RepairFormInput {
  /** The language the form is given in. */
  readonly language: Language;
  readonly repairer: Repairer;
  /** "[Identification of the good]". Article 4(4)(c). */
  readonly good: string;
  /** "[Description of the defect]". Article 4(4)(d). */
  readonly defect: string;
  /** "[What kind of measures will be taken to repair the defect]". Article 4(4)(d). */
  readonly repairType: string;
  readonly price: Price;
  /** "[Time by which the repairer undertakes to perform the service in days]". Article 4(4)(f). */
  readonly completionDays: number;
  readonly temporaryReplacement: TemporaryReplacement;
  /** "[The place where the consumer hands over the goods for repair]". Article 4(4)(h). */
  readonly handOverPlace: string;
  /** Ancillary services offered. An empty list is shown as the official word for "None". Article 4(4)(i). */
  readonly ancillaryServices: readonly AncillaryService[];
  readonly validity: ValidityInput;
  readonly diagnostic?: DiagnosticService;
  /** "If applicable, additional information". Article 4(4)(k). */
  readonly additionalInformation?: string;
}

/** The validated, normalised form data: defaults applied, text trimmed and in Unicode NFC. */
export interface NormalisedRepairForm extends Omit<RepairFormInput, 'validity'> {
  readonly validity: {
    readonly providedAt: string;
    readonly timeZone: string;
    readonly days: number;
    readonly rollForward: { readonly weekends: boolean; readonly publicHolidays: readonly string[] } | false;
  };
}

/** The computed period of validity. */
export interface ComputedValidity {
  /** The day the form was provided, in the repairer's time zone (YYYY-MM-DD). This day is not counted. */
  readonly providedOn: string;
  /** The last day the form is binding (YYYY-MM-DD), in the repairer's time zone. */
  readonly lastDay: string;
  /** The first instant after the period, as an ISO 8601 UTC timestamp (end of `lastDay` in the time zone). */
  readonly endsAt: string;
  readonly timeZone: string;
  readonly days: number;
}

/** A form as provided: the data, the computed validity, a short ID and an integrity hash over all of it. */
export interface RepairFormRecord {
  /** Record format version. */
  readonly format: 'fixform/1';
  /** Short ID derived from the integrity hash, for example "FX-3K7Q-9D2M-A1BC-XYZ0". */
  readonly id: string;
  /** "sha256-" followed by the hex SHA-256 of the canonical JSON of `{ format, form, validity }`. */
  readonly integrity: string;
  readonly form: NormalisedRepairForm;
  readonly validity: ComputedValidity;
}
