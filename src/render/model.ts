/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The format-independent content of a filled-in form. Every renderer (HTML,
 * text, Markdown, the web component) is built from this model, so all
 * outputs show the same rows in the order of Annex I.
 *
 * Headings, part titles and the Yes/No/None words come from the official
 * text. The bracketed indications are replaced by the repairer's data, as
 * Annex I requires. Units and footer lines are working translations.
 *
 * @packageDocumentation
 */

import { annexText, PART_ONE_ROWS, PART_TWO_ROWS } from '../annex/index.js';
import type { AnnexRowKey, Language } from '../annex/types.js';
import { formatMoney } from '../core/money.js';
import type { NormalisedRepairForm, RepairFormRecord } from '../core/types.js';
import { formatDays, interpolate, MESSAGES } from '../i18n/messages.js';

/** Shown where a row does not apply (for example the cost row when there is no replacement good). */
export const NOT_APPLICABLE = '—';

/** The value of one row: plain-text lines, or a list of items. */
export interface RenderValue {
  readonly lines: readonly string[];
  readonly list: boolean;
}

export interface RenderRow {
  readonly key: AnnexRowKey;
  /** Official heading of the row. */
  readonly label: string;
  readonly value: RenderValue;
}

export interface RenderPart {
  /** "Part I" / "Part II" in the official wording. */
  readonly label: string;
  readonly heading: string;
  readonly rows: readonly RenderRow[];
}

export interface RenderDocument {
  readonly language: Language;
  /** Official title, for example "EUROPEAN REPAIR INFORMATION FORM". */
  readonly title: string;
  readonly parts: readonly [RenderPart, RenderPart];
  /** Form ID and integrity hash (translated labels). */
  readonly footer: readonly { readonly label: string; readonly value: string }[];
}

const text = (value: string): RenderValue => ({ lines: value.split('\n'), list: false });
const lines = (values: readonly string[]): RenderValue => ({ lines: values, list: false });
const list = (values: readonly string[]): RenderValue => ({ lines: values, list: true });
const none: RenderValue = { lines: [NOT_APPLICABLE], list: false };

function rowValue(key: AnnexRowKey, record: RepairFormRecord): RenderValue {
  const form: NormalisedRepairForm = record.form;
  const lang = form.language;
  const official = annexText(lang);
  const m = MESSAGES[lang];
  switch (key) {
    case 'repairer':
      return text(form.repairer.identity);
    case 'address':
      return text(form.repairer.address);
    case 'telephone':
      return text(form.repairer.telephone);
    case 'email':
      return text(form.repairer.email);
    case 'otherMeans':
      return form.repairer.otherMeans ? list(form.repairer.otherMeans) : none;
    case 'good':
      return text(form.good);
    case 'defect':
      return text(form.defect);
    case 'repairType':
      return text(form.repairType);
    case 'price':
      return form.price.type === 'fixed'
        ? lines([formatMoney(form.price.total, lang)])
        : lines([...form.price.calculationMethod.split('\n'), interpolate(m.maximumPrice, { amount: formatMoney(form.price.maximum, lang) })]);
    case 'completionTime':
      return lines([formatDays(form.completionDays, lang)]);
    case 'replacementAvailable':
      return lines([form.temporaryReplacement.available ? official.words.yes : official.words.no]);
    case 'replacementCost':
      return form.temporaryReplacement.available ? lines([formatMoney(form.temporaryReplacement.cost, lang)]) : none;
    case 'handOverPlace':
      return text(form.handOverPlace);
    case 'ancillaryServices':
      return form.ancillaryServices.length === 0 ? lines([official.words.none]) : list(form.ancillaryServices.map((s) => s.description));
    case 'ancillaryCosts':
      return form.ancillaryServices.length === 0 ? none : list(form.ancillaryServices.map((s) => `${s.description}: ${formatMoney(s.cost, lang)}`));
    case 'validity':
      return lines([
        formatDays(record.validity.days, lang),
        interpolate(m.providedOn, { date: record.validity.providedOn }),
        interpolate(m.validUntil, { date: record.validity.lastDay, timeZone: record.validity.timeZone }),
      ]);
    case 'additionalInformation': {
      const out: string[] = [];
      if (form.diagnostic) {
        out.push(interpolate(m.diagnosticCost, { amount: formatMoney(form.diagnostic.cost, lang) }));
        out.push(form.diagnostic.deductedFromRepairPrice ? m.diagnosticDeducted : m.diagnosticNotDeducted);
      }
      if (form.additionalInformation !== undefined) out.push(...form.additionalInformation.split('\n'));
      return out.length > 0 ? lines(out) : none;
    }
  }
}

/** Builds the render model of a record. The record must already be verified (renderers call `assertRecord`). */
export function buildDocument(record: RepairFormRecord): RenderDocument {
  const lang = record.form.language;
  const official = annexText(lang);
  const m = MESSAGES[lang];
  const rows = (keys: readonly AnnexRowKey[]): RenderRow[] => keys.map((key) => ({ key, label: official.rows[key].label, value: rowValue(key, record) }));
  return {
    language: lang,
    title: official.formTitle,
    parts: [
      { label: official.partOne.label, heading: official.partOne.heading, rows: rows(PART_ONE_ROWS) },
      { label: official.partTwo.label, heading: official.partTwo.heading, rows: rows(PART_TWO_ROWS) },
    ],
    footer: [
      { label: m.formId, value: record.id },
      { label: m.integrity, value: record.integrity },
    ],
  };
}
