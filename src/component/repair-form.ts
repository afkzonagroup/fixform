/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `<repair-form>`: shows a European Repair Information Form (`mode="view"`,
 * the default) or lets a repairer fill one in (`mode="fill"`).
 *
 * - Shadow DOM; styles through a constructable stylesheet only.
 * - All DOM is built with `createElement` and `textContent`; no HTML strings.
 * - Works under `Content-Security-Policy: script-src 'self'; style-src 'self'`.
 * - Official headings and explanations from Annex I label every field.
 *
 * The component never sends anything over the network. In fill mode it
 * validates the input and dispatches `repair-form-submit` with the form data
 * (without `validity.providedAt`, which the server sets when it provides the
 * form). Events bubble and cross the shadow boundary.
 *
 * @packageDocumentation
 */

import { annexText, isLanguage } from '../annex/index.js';
import type { AnnexRowKey, Language } from '../annex/types.js';
import { isCurrency } from '../core/money.js';
import { verifyRepairForm } from '../core/record.js';
import { isValidTimeZone } from '../core/time.js';
import type { Currency, RepairFormRecord } from '../core/types.js';
import { validateRepairForm, type Issue } from '../core/validate.js';
import { interpolate, MESSAGES, type Messages } from '../i18n/messages.js';
import { buildDocument } from '../render/model.js';
import { componentSheet } from './styles.js';

/** Detail of `repair-form-submit`: the form data, ready to send as `form` to the server handler. */
export interface RepairFormSubmitDetail {
  readonly form: Record<string, unknown>;
}

/** Detail of `repair-form-invalid`. */
export interface RepairFormInvalidDetail {
  readonly issues: readonly Issue[];
}

interface ServiceDraft {
  description: string;
  cost: string;
}

interface Draft {
  identity: string;
  address: string;
  telephone: string;
  email: string;
  otherMeans: string;
  good: string;
  defect: string;
  repairType: string;
  priceType: 'fixed' | 'maximum';
  priceAmount: string;
  calculationMethod: string;
  maximumAmount: string;
  completionDays: string;
  replacement: '' | 'yes' | 'no';
  replacementCost: string;
  handOverPlace: string;
  services: ServiceDraft[];
  validityDays: string;
  diagnostic: boolean;
  diagnosticCost: string;
  informedOn: string;
  deducted: boolean;
  additionalInformation: string;
}

type TextKey = {
  [K in keyof Draft]: string extends Draft[K] ? (Draft[K] extends string ? K : never) : never;
}[keyof Draft];

const emptyDraft = (): Draft => ({
  identity: '',
  address: '',
  telephone: '',
  email: '',
  otherMeans: '',
  good: '',
  defect: '',
  repairType: '',
  priceType: 'fixed',
  priceAmount: '',
  calculationMethod: '',
  maximumAmount: '',
  completionDays: '',
  replacement: '',
  replacementCost: '',
  handOverPlace: '',
  services: [],
  validityDays: '30',
  diagnostic: false,
  diagnosticCost: '',
  informedOn: '',
  deducted: false,
  additionalInformation: '',
});

const MAX_FIELD_LENGTH = 5000;
const MAX_SERVICES = 20;

// --- small DOM helpers (no HTML parsing anywhere) ---

type Attrs = Readonly<Record<string, string | boolean | undefined>>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: readonly (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(name, '');
    else if (typeof value === 'string') node.setAttribute(name, value);
  }
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

// --- reading the `value` property safely ---

function own(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null || !Object.hasOwn(source, key)) return undefined;
  return (source as Record<string, unknown>)[key];
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, MAX_FIELD_LENGTH);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function draftFrom(value: unknown): Draft {
  const d = emptyDraft();
  const repairer = own(value, 'repairer');
  d.identity = str(own(repairer, 'identity'));
  d.address = str(own(repairer, 'address'));
  d.telephone = str(own(repairer, 'telephone'));
  d.email = str(own(repairer, 'email'));
  const other = own(repairer, 'otherMeans');
  d.otherMeans = Array.isArray(other) ? other.slice(0, 10).map(str).join('\n') : '';
  d.good = str(own(value, 'good'));
  d.defect = str(own(value, 'defect'));
  d.repairType = str(own(value, 'repairType'));
  const price = own(value, 'price');
  if (own(price, 'type') === 'maximum') {
    d.priceType = 'maximum';
    d.calculationMethod = str(own(price, 'calculationMethod'));
    d.maximumAmount = str(own(own(price, 'maximum'), 'amount'));
  } else {
    d.priceAmount = str(own(own(price, 'total'), 'amount'));
  }
  d.completionDays = str(own(value, 'completionDays'));
  const replacement = own(value, 'temporaryReplacement');
  const available = own(replacement, 'available');
  d.replacement = available === true ? 'yes' : available === false ? 'no' : '';
  d.replacementCost = str(own(own(replacement, 'cost'), 'amount'));
  d.handOverPlace = str(own(value, 'handOverPlace'));
  const services = own(value, 'ancillaryServices');
  d.services = Array.isArray(services)
    ? services.slice(0, MAX_SERVICES).map((s) => ({ description: str(own(s, 'description')), cost: str(own(own(s, 'cost'), 'amount')) }))
    : [];
  const days = own(own(value, 'validity'), 'days');
  if (days !== undefined) d.validityDays = str(days);
  const diagnostic = own(value, 'diagnostic');
  if (diagnostic !== undefined) {
    d.diagnostic = true;
    d.diagnosticCost = str(own(own(diagnostic, 'cost'), 'amount'));
    d.informedOn = str(own(diagnostic, 'consumerInformedOn'));
    d.deducted = own(diagnostic, 'deductedFromRepairPrice') === true;
  }
  d.additionalInformation = str(own(value, 'additionalInformation'));
  return d;
}

/** Accepts "129,90", "129.90" and "1 299,90" as typed by people. */
function amountFromUser(text: string): string | undefined {
  const compact = text.replace(/[\s\u00a0\u202f]/gu, '');
  if (compact === '') return undefined;
  if (/^\d+,\d{1,2}$/u.test(compact)) return compact.replace(',', '.');
  return compact;
}

function integerFromUser(text: string): number | string | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  return /^\d{1,6}$/u.test(t) ? Number(t) : t;
}

function money(amount: string, currency: Currency): Record<string, unknown> {
  const a = amountFromUser(amount);
  return a === undefined ? { currency } : { amount: a, currency };
}

function inputFromDraft(d: Draft, language: Language, currency: Currency, timeZone: string): Record<string, unknown> {
  const otherMeans = d.otherMeans
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const form: Record<string, unknown> = {
    language,
    repairer: {
      identity: d.identity,
      address: d.address,
      telephone: d.telephone,
      email: d.email,
      ...(otherMeans.length > 0 ? { otherMeans } : {}),
    },
    good: d.good,
    defect: d.defect,
    repairType: d.repairType,
    price:
      d.priceType === 'fixed'
        ? { type: 'fixed', total: money(d.priceAmount, currency) }
        : { type: 'maximum', calculationMethod: d.calculationMethod, maximum: money(d.maximumAmount, currency) },
    completionDays: integerFromUser(d.completionDays),
    temporaryReplacement: d.replacement === 'yes' ? { available: true, cost: money(d.replacementCost, currency) } : d.replacement === 'no' ? { available: false } : {},
    handOverPlace: d.handOverPlace,
    ancillaryServices: d.services.map((s) => ({ description: s.description, cost: money(s.cost, currency) })),
    validity: { timeZone, days: integerFromUser(d.validityDays) },
  };
  if (d.diagnostic) {
    form['diagnostic'] = { cost: money(d.diagnosticCost, currency), consumerInformedOn: d.informedOn.trim(), deductedFromRepairPrice: d.deducted };
  }
  if (d.additionalInformation.trim() !== '') form['additionalInformation'] = d.additionalInformation;
  return form;
}

/** Field id in the shadow root for an issue path. */
export function fieldForPath(path: string): string | null {
  const service = /^ancillaryServices\.(\d+)\.(description|cost)/u.exec(path);
  if (service) return `f-service-${service[1] ?? '0'}-${service[2] ?? 'description'}`;
  const table: readonly (readonly [RegExp, string])[] = [
    [/^repairer\.identity/u, 'f-identity'],
    [/^repairer\.address/u, 'f-address'],
    [/^repairer\.telephone/u, 'f-telephone'],
    [/^repairer\.email/u, 'f-email'],
    [/^repairer\.otherMeans/u, 'f-otherMeans'],
    [/^good/u, 'f-good'],
    [/^defect/u, 'f-defect'],
    [/^repairType/u, 'f-repairType'],
    [/^price\.total/u, 'f-priceAmount'],
    [/^price\.calculationMethod/u, 'f-calculationMethod'],
    [/^price\.maximum/u, 'f-maximumAmount'],
    [/^completionDays/u, 'f-completionDays'],
    [/^temporaryReplacement\.cost/u, 'f-replacementCost'],
    [/^temporaryReplacement/u, 'f-replacement-yes'],
    [/^handOverPlace/u, 'f-handOverPlace'],
    [/^validity\.days/u, 'f-validityDays'],
    [/^diagnostic\.cost/u, 'f-diagnosticCost'],
    [/^diagnostic\.consumerInformedOn/u, 'f-informedOn'],
    [/^additionalInformation/u, 'f-additionalInformation'],
  ];
  for (const [pattern, id] of table) if (pattern.test(path)) return id;
  return null;
}

function messageFor(issue: Issue, m: Messages): string {
  switch (issue.code) {
    case 'required':
    case 'empty':
      return /amount$/u.test(issue.path) ? m.errAmount : m.errRequired;
    case 'too_long':
      return m.errTooLong;
    case 'email':
      return m.errEmail;
    case 'telephone':
      return m.errTelephone;
    case 'amount':
      return m.errAmount;
    case 'integer':
    case 'range':
      return m.errInteger;
    case 'validity_too_short':
      return m.errValidityShort;
    case 'date':
      return m.errDate;
    case 'diagnostic_informed_late':
      return m.errInformedLate;
    default:
      return /amount$/u.test(issue.path) ? m.errAmount : m.errInvalid;
  }
}

// Under server-side rendering there is no HTMLElement; the class is then never defined as an element.
function ServerSideElement(): void {
  // Never constructed: custom elements are only defined in browsers.
}
const Base = (typeof HTMLElement === 'undefined' ? ServerSideElement : HTMLElement) as unknown as typeof HTMLElement;

/** The `<repair-form>` element class. Register it with `defineRepairForm()`. */
export class RepairFormElement extends Base {
  static readonly observedAttributes = ['mode', 'lang', 'currency', 'time-zone'];

  readonly #root: ShadowRoot;
  #record: RepairFormRecord | null = null;
  #draft: Draft = emptyDraft();
  #issues: readonly Issue[] = [];
  #submitted = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.adoptedStyleSheets = [componentSheet()];
  }

  connectedCallback(): void {
    this.#render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#render();
  }

  /** `view` (default) or `fill`. */
  get mode(): 'view' | 'fill' {
    return this.getAttribute('mode') === 'fill' ? 'fill' : 'view';
  }

  set mode(value: 'view' | 'fill') {
    this.setAttribute('mode', value === 'fill' ? 'fill' : 'view');
  }

  /** Language of the fill-in interface. In view mode the record's own language is used. */
  get language(): Language {
    const lang = this.getAttribute('lang');
    return isLanguage(lang) ? lang : 'en';
  }

  /** Currency of amounts entered in fill mode. Default EUR. */
  get currency(): Currency {
    const c = this.getAttribute('currency');
    return isCurrency(c) ? c : 'EUR';
  }

  set currency(value: Currency) {
    this.setAttribute('currency', value);
  }

  /** IANA time zone of the repairer, used in fill mode. Default: the browser's time zone. */
  get timeZone(): string {
    const tz = this.getAttribute('time-zone');
    if (tz !== null && isValidTimeZone(tz)) return tz;
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(local) ? local : 'UTC';
  }

  set timeZone(value: string) {
    this.setAttribute('time-zone', value);
  }

  /** The record shown in view mode. Records that fail verification are not shown. */
  get record(): RepairFormRecord | null {
    return this.#record;
  }

  set record(value: unknown) {
    const result = value === null || value === undefined ? null : verifyRepairForm(value);
    this.#record = result?.ok === true ? result.record : null;
    if (result && !result.ok) this.#dispatch('repair-form-error', { reason: result.reason });
    if (this.isConnected) this.#render();
  }

  /** Initial values for fill mode (same shape as the form input; unknown fields are ignored). */
  get value(): Record<string, unknown> {
    return inputFromDraft(this.#draft, this.language, this.currency, this.timeZone);
  }

  set value(value: unknown) {
    this.#draft = draftFrom(value);
    this.#issues = [];
    this.#submitted = false;
    if (this.isConnected) this.#render();
  }

  #dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #render(): void {
    const content = this.mode === 'fill' ? this.#renderFill() : this.#renderView();
    this.#root.replaceChildren(content);
  }

  // --- view mode ---

  #renderView(): HTMLElement {
    // Verify again at every render: the record object is shared with the caller, who could change it.
    const verified = this.#record ? verifyRepairForm(this.#record) : null;
    if (!verified?.ok) return el('div', { class: 'doc', part: 'document' });
    const doc = buildDocument(verified.record);
    const article = el('article', { class: 'doc', part: 'document', lang: doc.language });
    const titleId = 'erif-title';
    article.setAttribute('aria-labelledby', titleId);
    article.append(el('h2', { id: titleId, part: 'title' }, [doc.title]));
    doc.parts.forEach((part, i) => {
      const headingId = `erif-part-${String(i + 1)}`;
      const rows = part.rows.map((row) => {
        const td = el('td');
        if (row.value.list) td.append(el('ul', {}, row.value.lines.map((line) => el('li', {}, [line]))));
        else
          row.value.lines.forEach((line, j) => {
            if (j > 0) td.append(el('br'));
            td.append(line);
          });
        return el('tr', { 'data-row': row.key }, [el('th', { scope: 'row' }, [row.label]), td]);
      });
      article.append(
        el('section', { 'aria-labelledby': headingId }, [
          el('h3', { id: headingId }, [el('span', { class: 'part' }, [part.label]), ' ', part.heading]),
          el('table', { part: 'table' }, [el('tbody', {}, rows)]),
        ]),
      );
    });
    article.append(el('footer', { part: 'footer' }, [el('dl', {}, doc.footer.flatMap((f) => [el('dt', {}, [f.label]), el('dd', {}, [f.value])]))]));
    return article;
  }

  // --- fill mode ---

  #issueFor(id: string): Issue | undefined {
    return this.#submitted ? this.#issues.find((issue) => fieldForPath(issue.path) === id) : undefined;
  }

  #errorNode(id: string, m: Messages): HTMLElement {
    const issue = this.#issueFor(id);
    const node = el('p', { id: `${id}-error`, class: 'error', part: 'error' }, issue ? [messageFor(issue, m)] : []);
    if (!issue) node.hidden = true;
    return node;
  }

  #textField(key: TextKey, id: string, label: string, options: { hint?: string | null; multiline?: boolean; type?: string; autocomplete?: string; inputmode?: string } = {}): HTMLElement {
    const m = MESSAGES[this.language];
    const hintId = `${id}-hint`;
    const issue = this.#issueFor(id);
    const describedBy = [options.hint ? hintId : '', `${id}-error`].filter((s) => s !== '').join(' ');
    const common: Attrs = {
      id,
      name: key,
      part: 'input',
      'aria-describedby': describedBy,
      'aria-invalid': issue ? 'true' : undefined,
      autocomplete: options.autocomplete,
      inputmode: options.inputmode,
      maxlength: String(MAX_FIELD_LENGTH),
    };
    const control = options.multiline ? el('textarea', { ...common, rows: '3' }) : el('input', { ...common, type: options.type ?? 'text' });
    control.value = this.#draft[key];
    control.addEventListener('input', () => {
      this.#draft[key] = control.value;
    });
    return el('div', { class: 'field', part: 'field' }, [
      el('label', { for: id, part: 'label' }, [label]),
      ...(options.hint ? [el('p', { id: hintId, class: 'hint', part: 'hint' }, [options.hint])] : []),
      control,
      this.#errorNode(id, m),
    ]);
  }

  #choice(name: string, id: string, label: string, checked: boolean, onChange: () => void, type: 'radio' | 'checkbox' = 'radio', describedBy?: string): HTMLElement {
    const input = el('input', { type, id, name, 'aria-describedby': describedBy });
    input.checked = checked;
    input.addEventListener('change', onChange);
    return el('label', { class: 'choice', for: id }, [input, el('span', {}, [label])]);
  }

  #renderFill(): HTMLElement {
    const lang = this.language;
    const m = MESSAGES[lang];
    const official = annexText(lang);
    const row = (key: AnnexRowKey): { label: string; hint: string | null } => official.rows[key];
    const cur = { currency: this.currency };
    const d = this.#draft;

    const form = el('form', { class: 'form', part: 'form', novalidate: true, lang, 'aria-labelledby': 'erif-fill-title' });
    form.append(el('h2', { id: 'erif-fill-title', part: 'title' }, [official.formTitle]));

    if (this.#submitted && this.#issues.length > 0) {
      form.append(el('div', { class: 'summary', role: 'alert', tabindex: '-1', id: 'erif-summary' }, [m.errorSummary]));
    }

    // Part I
    form.append(
      el('h3', {}, [el('span', { class: 'part' }, [official.partOne.label]), ' ', official.partOne.heading]),
      this.#textField('identity', 'f-identity', row('repairer').label, { hint: row('repairer').hint, autocomplete: 'organization' }),
      this.#textField('address', 'f-address', row('address').label, { hint: row('address').hint, multiline: true, autocomplete: 'street-address' }),
      this.#textField('telephone', 'f-telephone', row('telephone').label, { type: 'tel', autocomplete: 'tel' }),
      this.#textField('email', 'f-email', row('email').label, { type: 'email', autocomplete: 'email' }),
      this.#textField('otherMeans', 'f-otherMeans', row('otherMeans').label, { hint: m.onePerLine, multiline: true }),
    );

    // Part II
    form.append(
      el('h3', {}, [el('span', { class: 'part' }, [official.partTwo.label]), ' ', official.partTwo.heading]),
      this.#textField('good', 'f-good', row('good').label, { hint: row('good').hint, multiline: true }),
      this.#textField('defect', 'f-defect', row('defect').label, { hint: row('defect').hint, multiline: true }),
      this.#textField('repairType', 'f-repairType', row('repairType').label, { hint: row('repairType').hint, multiline: true }),
    );

    // Price (Article 4(4)(e))
    const priceHint = 'f-price-hint';
    const price = el('fieldset', { 'aria-describedby': priceHint }, [
      el('legend', {}, [row('price').label]),
      el('p', { id: priceHint, class: 'hint', part: 'hint' }, [row('price').hint ?? '']),
      this.#choice('priceType', 'f-price-fixed', m.priceFixed, d.priceType === 'fixed', () => {
        d.priceType = 'fixed';
        this.#render();
        this.#focus('f-price-fixed');
      }),
      this.#choice('priceType', 'f-price-maximum', m.priceMaximum, d.priceType === 'maximum', () => {
        d.priceType = 'maximum';
        this.#render();
        this.#focus('f-price-maximum');
      }),
    ]);
    if (d.priceType === 'fixed') {
      price.append(this.#textField('priceAmount', 'f-priceAmount', interpolate(m.amount, cur), { inputmode: 'decimal' }));
    } else {
      price.append(
        this.#textField('calculationMethod', 'f-calculationMethod', m.calculationMethod, { multiline: true }),
        this.#textField('maximumAmount', 'f-maximumAmount', `${m.maximumPriceField}: ${interpolate(m.amount, cur)}`, { inputmode: 'decimal' }),
      );
    }
    form.append(price);

    form.append(this.#textField('completionDays', 'f-completionDays', row('completionTime').label, { hint: row('completionTime').hint, inputmode: 'numeric' }));

    // Temporary replacement (Article 4(4)(g))
    const replacementHint = 'f-replacement-hint';
    const replacementIssue = this.#issueFor('f-replacement-yes');
    const replacement = el('fieldset', { 'aria-describedby': `${replacementHint} f-replacement-yes-error` }, [
      el('legend', {}, [row('replacementAvailable').label]),
      el('p', { id: replacementHint, class: 'hint', part: 'hint' }, [row('replacementAvailable').hint ?? '']),
      this.#choice('replacement', 'f-replacement-yes', official.words.yes, d.replacement === 'yes', () => {
        d.replacement = 'yes';
        this.#render();
        this.#focus('f-replacement-yes');
      }),
      this.#choice('replacement', 'f-replacement-no', official.words.no, d.replacement === 'no', () => {
        d.replacement = 'no';
        this.#render();
        this.#focus('f-replacement-no');
      }),
      this.#errorNode('f-replacement-yes', m),
    ]);
    if (replacementIssue) replacement.setAttribute('aria-invalid', 'true');
    if (d.replacement === 'yes') {
      replacement.append(
        this.#textField('replacementCost', 'f-replacementCost', `${row('replacementCost').label} ${interpolate(m.amount, cur)}`, { inputmode: 'decimal' }),
      );
    }
    form.append(replacement);

    form.append(this.#textField('handOverPlace', 'f-handOverPlace', row('handOverPlace').label, { hint: row('handOverPlace').hint, multiline: true }));

    // Ancillary services (Article 4(4)(i))
    const servicesHint = 'f-services-hint';
    const services = el('fieldset', { 'aria-describedby': servicesHint }, [
      el('legend', {}, [row('ancillaryServices').label]),
      el('p', { id: servicesHint, class: 'hint', part: 'hint' }, [row('ancillaryServices').hint ?? '']),
    ]);
    d.services.forEach((_service, i) => {
      const n = String(i + 1);
      services.append(
        el('div', { class: 'service' }, [
          el('div', { class: 'row' }, [this.#serviceField(i, 'description', `${m.service} ${n}`), this.#serviceField(i, 'cost', interpolate(m.cost, cur))]),
          this.#button(interpolate(m.removeService, { n }), 'secondary', `f-service-${n}-remove`, () => {
            d.services.splice(i, 1);
            this.#render();
            this.#focus('f-service-add');
          }),
        ]),
      );
    });
    if (d.services.length < MAX_SERVICES) {
      services.append(
        el('div', { class: 'actions' }, [
          this.#button(m.addService, 'secondary', 'f-service-add', () => {
            d.services.push({ description: '', cost: '' });
            this.#render();
            this.#focus(`f-service-${String(d.services.length - 1)}-description`);
          }),
        ]),
      );
    }
    form.append(services);

    // Validity (Article 4(5))
    const validityHint = 'f-validity-hint';
    form.append(
      el('fieldset', { 'aria-describedby': validityHint }, [
        el('legend', {}, [row('validity').label]),
        el('p', { id: validityHint, class: 'hint', part: 'hint' }, [row('validity').hint ?? '']),
        this.#textField('validityDays', 'f-validityDays', m.numberOfDays, { inputmode: 'numeric' }),
      ]),
    );

    // Diagnostic cost (Article 4(3), recital 12): printed in the "additional information" row.
    const diagnostic = el('div', { class: 'field' }, [
      this.#choice(
        'diagnostic',
        'f-diagnostic',
        m.diagnosticCharged,
        d.diagnostic,
        () => {
          d.diagnostic = !d.diagnostic;
          this.#render();
          this.#focus('f-diagnostic');
        },
        'checkbox',
      ),
    ]);
    form.append(diagnostic);
    if (d.diagnostic) {
      const deducted = this.#choice(
        'deducted',
        'f-deducted',
        m.deducted,
        d.deducted,
        () => {
          d.deducted = !d.deducted;
        },
        'checkbox',
      );
      form.append(
        el('div', { class: 'sub' }, [
          this.#textField('diagnosticCost', 'f-diagnosticCost', interpolate(m.cost, cur), { inputmode: 'decimal' }),
          // No numeric keyboard: phone number pads have no "-" for YYYY-MM-DD.
          this.#textField('informedOn', 'f-informedOn', m.informedOn, { autocomplete: 'off' }),
          el('div', { class: 'field' }, [deducted]),
        ]),
      );
    }

    // Additional information (Article 4(4)(k))
    form.append(this.#textField('additionalInformation', 'f-additionalInformation', row('additionalInformation').label, { multiline: true }));

    const submit = el('button', { type: 'submit', class: 'primary', part: 'button' }, [m.create]);
    form.append(el('div', { class: 'actions' }, [submit]));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit();
    });
    return form;
  }

  #serviceField(index: number, field: 'description' | 'cost', label: string): HTMLElement {
    const m = MESSAGES[this.language];
    const id = `f-service-${String(index)}-${field}`;
    const issue = this.#issueFor(id);
    const input = el('input', {
      type: 'text',
      id,
      part: 'input',
      'aria-describedby': `${id}-error`,
      'aria-invalid': issue ? 'true' : undefined,
      inputmode: field === 'cost' ? 'decimal' : undefined,
      maxlength: String(MAX_FIELD_LENGTH),
    });
    const service = this.#draft.services[index];
    input.value = service ? service[field] : '';
    input.addEventListener('input', () => {
      const s = this.#draft.services[index];
      if (s) s[field] = input.value;
    });
    return el('div', { class: 'field', part: 'field' }, [el('label', { for: id, part: 'label' }, [label]), input, this.#errorNode(id, m)]);
  }

  #button(label: string, kind: 'primary' | 'secondary', id: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', { type: 'button', class: kind, part: 'button', id }, [label]);
    button.addEventListener('click', onClick);
    return button;
  }

  #focus(id: string): void {
    const target = this.#root.getElementById(id);
    if (target instanceof HTMLElement) target.focus();
  }

  #submit(): void {
    const form = inputFromDraft(this.#draft, this.language, this.currency, this.timeZone);
    const result = validateRepairForm(form, { providedAt: new Date().toISOString() });
    this.#submitted = true;
    if (!result.ok) {
      this.#issues = result.errors;
      this.#render();
      const first = result.errors.map((issue) => fieldForPath(issue.path)).find((id): id is string => id !== null);
      this.#focus(first ?? 'erif-summary');
      this.#dispatch('repair-form-invalid', { issues: result.errors } satisfies RepairFormInvalidDetail);
      return;
    }
    this.#issues = [];
    this.#render();
    this.#dispatch('repair-form-submit', { form } satisfies RepairFormSubmitDetail);
  }
}
