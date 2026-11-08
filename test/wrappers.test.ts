// @vitest-environment happy-dom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepairFormElement } from '../src/component/index.js';
import { createRepairForm } from '../src/index.js';
import { RepairForm as ReactRepairForm } from '../src/react/index.js';
import { RepairForm as VueRepairForm } from '../src/vue/index.js';
import { validInput } from './fixtures.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe('React wrapper', () => {
  it('server-renders attributes only, never record data', () => {
    const html = renderToString(createElement(ReactRepairForm, { mode: 'view', lang: 'de', record: createRepairForm(validInput('de')), className: 'x' }));
    expect(html).toBe('<repair-form mode="view" lang="de" class="x"></repair-form>');
  });

  it('sets record and value as properties and forwards events', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const record = createRepairForm(validInput());
    const invalid: unknown[] = [];
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(ReactRepairForm, { record }));
      await Promise.resolve();
    });
    const el = container.querySelector('repair-form') as RepairFormElement;
    expect(el.record?.id).toBe(record.id);
    await act(async () => {
      root.render(createElement(ReactRepairForm, { mode: 'fill', value: { good: 'Kettle' }, timeZone: 'Europe/Riga', currency: 'EUR', onInvalid: (d) => invalid.push(d) }));
      await Promise.resolve();
    });
    expect(el.getAttribute('time-zone')).toBe('Europe/Riga');
    expect((el.shadowRoot?.getElementById('f-good') as HTMLTextAreaElement).value).toBe('Kettle');
    el.shadowRoot?.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(invalid).toHaveLength(1);
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});

describe('Vue wrapper', () => {
  it('passes record as a DOM property and emits events', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const record = createRepairForm(validInput('lv'));
    const invalid: unknown[] = [];
    const app = createApp({ render: () => h(VueRepairForm, { record, lang: 'lv', onInvalid: (d: unknown) => invalid.push(d) }) });
    app.mount(container);
    await nextTick();
    const el = container.querySelector('repair-form') as RepairFormElement;
    expect(el.getAttribute('lang')).toBe('lv');
    expect(el.getAttribute('record')).toBeNull();
    expect(el.record?.id).toBe(record.id);
    el.mode = 'fill';
    el.shadowRoot?.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(invalid).toHaveLength(1);
    app.unmount();
  });

  it('fill mode with value, currency and time zone', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const submitted: unknown[] = [];
    const app = createApp({
      render: () => h(VueRepairForm, { mode: 'fill', value: validInput(), currency: 'EUR', timeZone: 'Europe/Vilnius', onSubmit: (d: unknown) => submitted.push(d) }),
    });
    app.mount(container);
    await nextTick();
    const el = container.querySelector('repair-form') as RepairFormElement;
    expect(el.getAttribute('time-zone')).toBe('Europe/Vilnius');
    el.shadowRoot?.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(submitted).toHaveLength(1);
    app.unmount();
  });
});
