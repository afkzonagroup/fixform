/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fixform: the European Repair Information Form of Directive (EU) 2024/1799
 * (Article 4 and Annex I) in all 24 official EU languages.
 *
 * This entry point has no runtime dependencies and works in Node.js and
 * browsers. The web component, React and Vue wrappers, e-mail rendering and
 * the server handler are separate entry points.
 *
 * @packageDocumentation
 */

export { annexChecksumInput, annexText, isLanguage, LANGUAGES, OFFICIAL_ANNEX, PART_ONE_ROWS, PART_TWO_ROWS } from './annex/index.js';
export type { AnnexRow, AnnexRowKey, Language, OfficialAnnexText } from './annex/index.js';
export { canonicalJson } from './core/canonical.js';
export { CURRENCIES, formatMoney, isCurrency, normaliseAmount } from './core/money.js';
export { assertRecord, createRepairForm, FixformValidationError, RECORD_FORMAT, verifyRepairForm, type VerifyResult } from './core/record.js';
export { REPAIR_FORM_SCHEMA } from './core/schema.js';
export { sha256Hex } from './core/sha256.js';
export { addDays, computeValidity, isCivilDate, isValidTimeZone, localDate, parseInstant, startOfDay } from './core/time.js';
export type {
  AncillaryService,
  ComputedValidity,
  Currency,
  DiagnosticService,
  Money,
  NormalisedRepairForm,
  Price,
  RepairFormInput,
  RepairFormRecord,
  Repairer,
  RollForward,
  TemporaryReplacement,
  ValidityInput,
} from './core/types.js';
export { LIMITS, validateRepairForm, type Issue, type IssueCode, type ValidateOptions, type ValidationResult } from './core/validate.js';
export { formatDays, MESSAGES, MESSAGES_SOURCE, type Messages } from './i18n/messages.js';
export { DIRECTIVE_2019_771, DIRECTIVE_2024_1799, MINIMUM_VALIDITY_DAYS, REGULATION_1182_71 } from './law.js';
export { escapeHtml, escapeMarkdown } from './render/escape.js';
export { DOCUMENT_CSS, renderHtml, renderHtmlFragment } from './render/html.js';
export { buildDocument, NOT_APPLICABLE, type RenderDocument, type RenderPart, type RenderRow, type RenderValue } from './render/model.js';
export { renderMarkdown, renderText } from './render/text.js';
