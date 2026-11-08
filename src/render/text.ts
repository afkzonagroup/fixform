/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertRecord } from '../core/record.js';
import type { RepairFormRecord } from '../core/types.js';
import { escapeMarkdown } from './escape.js';
import { buildDocument, type RenderValue } from './model.js';

function textValue(value: RenderValue): string[] {
  return value.lines.map((line) => `  ${value.list ? '- ' : ''}${line}`.trimEnd());
}

/**
 * Renders the form as plain text (UTF-8, LF line endings), for example for
 * the text part of an e-mail. Validation already rejects control characters,
 * so the text cannot contain terminal escape sequences. Throws if `record` is
 * not a valid, unmodified record.
 */
export function renderText(record: RepairFormRecord): string {
  const doc = buildDocument(assertRecord(record));
  const out: string[] = [doc.title, ''];
  for (const part of doc.parts) {
    out.push(`${part.label}: ${part.heading}`, '');
    for (const row of part.rows) out.push(row.label, ...textValue(row.value), '');
  }
  out.push('--', ...doc.footer.map((f) => `${f.label}: ${f.value}`));
  return `${out.join('\n')}\n`;
}

/**
 * Renders the form as Markdown. Every piece of text, including the official
 * headings, is escaped, so data can never become links, images or HTML.
 * Throws if `record` is not a valid, unmodified record.
 */
export function renderMarkdown(record: RepairFormRecord): string {
  const doc = buildDocument(assertRecord(record));
  const out: string[] = [`# ${escapeMarkdown(doc.title)}`, ''];
  for (const part of doc.parts) {
    out.push(`## ${escapeMarkdown(part.label)}: ${escapeMarkdown(part.heading)}`, '');
    for (const row of part.rows) {
      out.push(`**${escapeMarkdown(row.label)}**`, '');
      if (row.value.list) out.push(...row.value.lines.map((line) => `- ${escapeMarkdown(line)}`));
      // Blank lines inside a value would end the paragraph; a backslash at the line end is a hard line break.
      else out.push(row.value.lines.filter((line) => line !== '').map((line) => escapeMarkdown(line)).join('\\\n'));
      out.push('');
    }
  }
  out.push('---', '', ...doc.footer.map((f) => `${escapeMarkdown(f.label)}: \`${f.value}\`  `));
  return `${out.join('\n').trimEnd()}\n`;
}
