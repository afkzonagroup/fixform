// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RepairFormElement} from '../src/component/index.js';
import { defineRepairForm, fieldForPath, type RepairFormInvalidDetail, type RepairFormSubmitDetail } from '../src/component/index.js';
import { annexText, createRepairForm, validateRepairForm } from '../src/index.js';
import { validInput } from './fixtures.js';

beforeAll(() => {
  defineRepairForm();
});

afterEach(() => {
  document.body.replaceChildren();
});

function mount(attrs: Record<string, string> = {}): RepairFormElement {
  const el = document.createElement('repair-form') as RepairFormElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

const root = (el: RepairFormElement): ShadowRoot => {
  if (!el.shadowRoot) throw new Error('no shadow root');
  return el.shadowRoot;
};

function type(el: RepairFormElement, id: string, value: string): void {
  const input = root(el).getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!input) throw new Error(`missing ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function click(el: RepairFormElement, id: string): void {
  const node = root(el).getElementById(id);
  if (!node) throw new Error(`missing ${id}`);
  node.click();
}

function submit(el: RepairFormElement): void {
  const form = root(el).querySelector('form');
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('<repair-form> view mode', () => {
  it('renders the record with official headings in a table, in the record language', () => {
    const el = mount();
    const record = createRepairForm(validInput('fr'));
    el.record = record;
    const r = root(el);
    const official = annexText('fr');
    expect(r.querySelector('h2')?.textContent).toBe(official.formTitle);
    expect(r.querySelector('article')?.getAttribute('lang')).toBe('fr');
    const headings = [...r.querySelectorAll('th[scope="row"]')].map((th) => th.textContent);
    expect(headings).toHaveLength(17);
    expect(headings[0]).toBe(official.rows.repairer.label);
    expect(r.querySelectorAll('section')).toHaveLength(2);
    expect(r.querySelector('footer')?.textContent).toContain(record.id);
    expect(r.adoptedStyleSheets.length).toBe(1);
  });

  it('shows data as text, never as markup', () => {
    const input = validInput();
    const el = mount();
    el.record = createRepairForm({ ...input, good: '<img src=x onerror=alert(1)>' });
    const r = root(el);
    expect(r.querySelector('img')).toBeNull();
    expect(r.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('refuses a tampered record and reports why', () => {
    const el = mount();
    const reasons: string[] = [];
    el.addEventListener('repair-form-error', (e) => reasons.push((e as CustomEvent<{ reason: string }>).detail.reason));
    const record = createRepairForm(validInput());
    el.record = { ...record, id: 'FX-0000-0000-0000-0000' };
    expect(el.record).toBeNull();
    expect(reasons).toEqual(['ID does not match']);
    expect(root(el).querySelector('table')).toBeNull();
    el.record = record;
    expect(root(el).querySelector('table')).not.toBeNull();
    // Changing the record object afterwards (through the getter) does not get unverified data on screen.
    const shown = el.record as { form: { good: string } } | null;
    if (!shown) throw new Error('record not set');
    shown.form.good = 'Changed later';
    el.setAttribute('lang', 'de');
    expect(root(el).querySelector('table')).toBeNull();
    expect(root(el).textContent).not.toContain('Changed later');
    el.record = null;
    expect(root(el).querySelector('table')).toBeNull();
  });
});

describe('<repair-form> fill mode', () => {
  it('labels every field with the official heading and explanation', () => {
    const el = mount({ mode: 'fill', lang: 'lt' });
    const r = root(el);
    const official = annexText('lt');
    const label = (id: string): string | null | undefined => r.querySelector(`label[for="${id}"]`)?.textContent;
    expect(label('f-identity')).toBe(official.rows.repairer.label);
    expect(r.getElementById('f-identity-hint')?.textContent).toBe(official.rows.repairer.hint);
    expect(r.getElementById('f-identity')?.getAttribute('aria-describedby')).toBe('f-identity-hint f-identity-error');
    expect(label('f-good')).toBe(official.rows.good.label);
    expect(r.textContent).toContain(official.rows.price.label);
    expect(r.textContent).toContain(official.words.yes);
    expect(r.textContent).toContain(official.words.no);
    expect(r.querySelector('h2')?.textContent).toBe(official.formTitle);
    for (const input of r.querySelectorAll('input:not([type=radio]):not([type=checkbox]), textarea')) {
      expect(r.querySelector(`label[for="${input.id}"]`), input.id).not.toBeNull();
    }
  });

  it('shows errors on submit, marks fields invalid and focuses the first one', () => {
    const el = mount({ mode: 'fill', 'time-zone': 'Europe/Vilnius' });
    const invalid: RepairFormInvalidDetail[] = [];
    el.addEventListener('repair-form-invalid', (e) => invalid.push((e as CustomEvent<RepairFormInvalidDetail>).detail));
    submit(el);
    const r = root(el);
    expect(invalid).toHaveLength(1);
    expect(r.querySelector('[role="alert"]')?.textContent).toBe('Please correct the marked fields.');
    const identity = r.getElementById('f-identity');
    expect(identity?.getAttribute('aria-invalid')).toBe('true');
    expect(r.getElementById('f-identity-error')?.textContent).toBe('Fill in this field.');
    expect(r.getElementById('f-identity-error')?.hidden).toBe(false);
    expect(r.activeElement?.id).toBe('f-identity');
  });

  it('builds the form data from the inputs and dispatches repair-form-submit', () => {
    const el = mount({ mode: 'fill', lang: 'en', currency: 'EUR', 'time-zone': 'Europe/Vilnius' });
    const submitted: RepairFormSubmitDetail[] = [];
    el.addEventListener('repair-form-submit', (e) => submitted.push((e as CustomEvent<RepairFormSubmitDetail>).detail));
    type(el, 'f-identity', 'Example Repairs Ltd');
    type(el, 'f-address', '1 Example Street');
    type(el, 'f-telephone', '+370 600 00000');
    type(el, 'f-email', 'repairs@example.com');
    type(el, 'f-otherMeans', 'Chat\n\n  WhatsApp  ');
    type(el, 'f-good', 'Phone');
    type(el, 'f-defect', 'Broken screen');
    type(el, 'f-repairType', 'Replace screen');
    type(el, 'f-priceAmount', '1 129,9');
    type(el, 'f-completionDays', '3');
    click(el, 'f-replacement-yes');
    type(el, 'f-replacementCost', '0');
    type(el, 'f-handOverPlace', 'Shop');
    click(el, 'f-service-add');
    type(el, 'f-service-0-description', 'Transport');
    type(el, 'f-service-0-cost', '10');
    click(el, 'f-diagnostic');
    type(el, 'f-diagnosticCost', '15');
    // The date needs "-", which numeric phone keyboards do not offer.
    expect(root(el).getElementById('f-informedOn')?.hasAttribute('inputmode')).toBe(false);
    type(el, 'f-informedOn', '2026-01-01');
    click(el, 'f-deducted');
    type(el, 'f-validityDays', '45');
    submit(el);
    expect(submitted).toHaveLength(1);
    const form = submitted[0]?.form ?? {};
    expect(form).toMatchObject({
      language: 'en',
      repairer: { otherMeans: ['Chat', 'WhatsApp'] },
      price: { type: 'fixed', total: { amount: '1129.9', currency: 'EUR' } },
      completionDays: 3,
      temporaryReplacement: { available: true, cost: { amount: '0', currency: 'EUR' } },
      ancillaryServices: [{ description: 'Transport', cost: { amount: '10', currency: 'EUR' } }],
      validity: { timeZone: 'Europe/Vilnius', days: 45 },
      diagnostic: { consumerInformedOn: '2026-01-01', deductedFromRepairPrice: true },
    });
    expect(form).not.toHaveProperty('validity.providedAt');
    expect(validateRepairForm(form, { providedAt: '2026-11-09T10:00:00Z' }).ok).toBe(true);
    expect(root(el).querySelector('[role="alert"]')).toBeNull();
  });

  it('price with calculation method; removing services; value property round trip', () => {
    const el = mount({ mode: 'fill' });
    el.value = { ...validInput(), price: { type: 'maximum', calculationMethod: 'Hourly', maximum: { amount: '300', currency: 'EUR' } } };
    const r = root(el);
    expect((r.getElementById('f-calculationMethod') as HTMLTextAreaElement).value).toBe('Hourly');
    expect((r.getElementById('f-maximumAmount') as HTMLInputElement).value).toBe('300');
    expect(r.getElementById('f-service-0-description')).not.toBeNull();
    click(el, 'f-service-1-remove');
    expect(r.getElementById('f-service-0-description')).toBeNull();
    expect(r.activeElement?.id).toBe('f-service-add');
    click(el, 'f-price-fixed');
    expect(r.getElementById('f-priceAmount')).not.toBeNull();
    click(el, 'f-replacement-no');
    expect(r.getElementById('f-replacementCost')).toBeNull();
    expect(el.value).toMatchObject({ temporaryReplacement: { available: false }, ancillaryServices: [] });
  });

  it('the value setter reads only known own fields and ignores hostile input', () => {
    const el = mount({ mode: 'fill' });
    const hostile = JSON.parse('{"__proto__":{"polluted":1},"good":{"toString":"x"},"repairer":{"identity":"' + 'x'.repeat(10_000) + '"},"ancillaryServices":"nope"}') as unknown;
    el.value = hostile;
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect((root(el).getElementById('f-identity') as HTMLInputElement).value).toHaveLength(5000);
    expect((root(el).getElementById('f-good') as HTMLTextAreaElement).value).toBe('');
    // Inherited properties are ignored: only own properties are read.
    el.value = Object.create({ good: 'inherited', repairer: { identity: 'inherited' } }) as unknown;
    expect((root(el).getElementById('f-good') as HTMLTextAreaElement).value).toBe('');
    expect((root(el).getElementById('f-identity') as HTMLInputElement).value).toBe('');
    el.value = null;
    expect((root(el).getElementById('f-identity') as HTMLInputElement).value).toBe('');
  });

  it('attribute defaults and fallbacks', () => {
    const el = mount({ lang: 'xx', currency: 'USD', 'time-zone': 'Nowhere/Zone' });
    expect(el.language).toBe('en');
    expect(el.currency).toBe('EUR');
    expect(el.timeZone.length).toBeGreaterThan(0);
    expect(el.mode).toBe('view');
    el.mode = 'fill';
    expect(el.getAttribute('mode')).toBe('fill');
    expect(root(el).querySelector('form')).not.toBeNull();
    el.mode = 'view';
    expect(root(el).querySelector('form')).toBeNull();
  });

  it('maps every issue path to a field', () => {
    expect(fieldForPath('ancillaryServices.3.cost.amount')).toBe('f-service-3-cost');
    expect(fieldForPath('temporaryReplacement.available')).toBe('f-replacement-yes');
    expect(fieldForPath('temporaryReplacement.cost.amount')).toBe('f-replacementCost');
    expect(fieldForPath('diagnostic.consumerInformedOn')).toBe('f-informedOn');
    expect(fieldForPath('language')).toBeNull();
  });

  it('defineRepairForm is idempotent and supports other names', () => {
    defineRepairForm();
    defineRepairForm('my-repair-form');
    expect(customElements.get('my-repair-form')).toBeDefined();
    expect(() => { defineRepairForm('Bad Name'); }).toThrow(TypeError);
  });
});
