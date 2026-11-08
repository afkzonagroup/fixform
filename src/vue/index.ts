/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thin Vue 3 wrapper around `<repair-form>`. Render function only, so no
 * template compiler or `isCustomElement` configuration is needed. Objects
 * (`record`, `value`) are passed as DOM properties.
 *
 * @packageDocumentation
 */

import { defineComponent, h, type PropType } from 'vue';
import { defineRepairForm, type RepairFormInvalidDetail, type RepairFormSubmitDetail } from '../component/index.js';
import type { Language } from '../annex/types.js';
import type { Currency, RepairFormInput, RepairFormRecord } from '../core/types.js';

defineRepairForm();

/** Vue component for `<repair-form>`. Emits `submit` and `invalid`. */
export const RepairForm = defineComponent({
  name: 'RepairForm',
  props: {
    mode: { type: String as PropType<'view' | 'fill'>, default: undefined },
    lang: { type: String as PropType<Language>, default: undefined },
    record: { type: Object as PropType<RepairFormRecord | null>, default: undefined },
    value: { type: Object as PropType<Partial<RepairFormInput> | Record<string, unknown>>, default: undefined },
    currency: { type: String as PropType<Currency>, default: undefined },
    timeZone: { type: String, default: undefined },
  },
  emits: {
    submit: (_detail: RepairFormSubmitDetail) => true,
    invalid: (_detail: RepairFormInvalidDetail) => true,
  },
  setup(props, { emit }) {
    return () => {
      const attrs: Record<string, unknown> = {
        onRepairFormSubmit: (event: Event) => {
          emit('submit', (event as CustomEvent<RepairFormSubmitDetail>).detail);
        },
        onRepairFormInvalid: (event: Event) => {
          emit('invalid', (event as CustomEvent<RepairFormInvalidDetail>).detail);
        },
      };
      if (props.mode !== undefined) attrs['mode'] = props.mode;
      if (props.lang !== undefined) attrs['lang'] = props.lang;
      if (props.currency !== undefined) attrs['currency'] = props.currency;
      if (props.timeZone !== undefined) attrs['time-zone'] = props.timeZone;
      // The "." prefix makes Vue set a DOM property instead of an attribute.
      if (props.record !== undefined) attrs['.record'] = props.record;
      if (props.value !== undefined) attrs['.value'] = props.value;
      return h('repair-form', attrs);
    };
  },
});
