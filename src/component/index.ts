/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `<repair-form>` web component. Import `@afkzona/fixform/component/define`
 * to register it under its default name, or call {@link defineRepairForm}.
 *
 * @packageDocumentation
 */

import { RepairFormElement } from './repair-form.js';

export { RepairFormElement, fieldForPath, type RepairFormInvalidDetail, type RepairFormSubmitDetail } from './repair-form.js';
export { COMPONENT_CSS } from './styles.js';

/** Default tag name. */
export const REPAIR_FORM_TAG = 'repair-form';

/**
 * Registers the element. Safe to call more than once and on the server
 * (where it does nothing).
 */
export function defineRepairForm(tagName: string = REPAIR_FORM_TAG): void {
  if (typeof customElements === 'undefined') return;
  if (!/^[a-z][a-z0-9]*-[a-z0-9-]*$/u.test(tagName)) throw new TypeError('Invalid custom element name');
  if (customElements.get(tagName)) return;
  // Each name needs its own class, because one constructor can only be registered once.
  customElements.define(tagName, tagName === REPAIR_FORM_TAG ? RepairFormElement : class extends RepairFormElement {});
}
