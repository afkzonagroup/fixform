/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thin React wrapper around `<repair-form>`. Works with React 18 and 19 and
 * needs no JSX transform. Objects (`record`, `value`) are set as element
 * properties, never serialised into attributes.
 *
 * @packageDocumentation
 */

import { createElement, useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import { defineRepairForm, type RepairFormElement, type RepairFormInvalidDetail, type RepairFormSubmitDetail } from '../component/index.js';
import type { Language } from '../annex/types.js';
import type { Currency, RepairFormInput, RepairFormRecord } from '../core/types.js';

defineRepairForm();

// useLayoutEffect sets properties before paint; on the server it is replaced by useEffect (a no-op there).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export interface RepairFormProps {
  readonly mode?: 'view' | 'fill';
  readonly lang?: Language;
  /** View mode: the record to show. */
  readonly record?: RepairFormRecord | null;
  /** Fill mode: initial values. */
  readonly value?: Partial<RepairFormInput> | Record<string, unknown>;
  readonly currency?: Currency;
  readonly timeZone?: string;
  readonly className?: string;
  readonly onSubmit?: (detail: RepairFormSubmitDetail) => void;
  readonly onInvalid?: (detail: RepairFormInvalidDetail) => void;
}

/** React component for `<repair-form>`. */
export function RepairForm(props: RepairFormProps): ReactElement {
  const ref = useRef<RepairFormElement | null>(null);
  const handlers = useRef({ onSubmit: props.onSubmit, onInvalid: props.onInvalid });

  useIsomorphicLayoutEffect(() => {
    handlers.current = { onSubmit: props.onSubmit, onInvalid: props.onInvalid };
  });

  useIsomorphicLayoutEffect(() => {
    if (ref.current && props.record !== undefined) ref.current.record = props.record;
  }, [props.record]);

  useIsomorphicLayoutEffect(() => {
    if (ref.current && props.value !== undefined) ref.current.value = props.value;
  }, [props.value]);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const onSubmit = (event: Event): void => {
      handlers.current.onSubmit?.((event as CustomEvent<RepairFormSubmitDetail>).detail);
    };
    const onInvalid = (event: Event): void => {
      handlers.current.onInvalid?.((event as CustomEvent<RepairFormInvalidDetail>).detail);
    };
    node.addEventListener('repair-form-submit', onSubmit);
    node.addEventListener('repair-form-invalid', onInvalid);
    return () => {
      node.removeEventListener('repair-form-submit', onSubmit);
      node.removeEventListener('repair-form-invalid', onInvalid);
    };
  }, []);

  const attributes: Record<string, string> = {};
  if (props.mode !== undefined) attributes['mode'] = props.mode;
  if (props.lang !== undefined) attributes['lang'] = props.lang;
  if (props.currency !== undefined) attributes['currency'] = props.currency;
  if (props.timeZone !== undefined) attributes['time-zone'] = props.timeZone;
  if (props.className !== undefined) attributes['class'] = props.className;
  return createElement('repair-form', { ...attributes, ref });
}
