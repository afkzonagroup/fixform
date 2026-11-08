/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTML rendering. The output is a complete, self-contained document: no
 * scripts, no external fonts, images or style sheets, so it can be saved,
 * printed and archived as it is. Every piece of data is HTML-escaped.
 *
 * @packageDocumentation
 */

import { assertRecord } from '../core/record.js';
import { sha256Bytes, toBase64, utf8 } from '../core/sha256.js';
import type { RepairFormRecord } from '../core/types.js';
import { escapeHtml } from './escape.js';
import { buildDocument, type RenderDocument, type RenderValue } from './model.js';

/** Print-ready styles of the HTML document. Contrast meets WCAG 2.1 AA. */
export const DOCUMENT_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1a1a1a;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;overflow-wrap:anywhere;hyphens:auto}
.erif{max-width:52rem;margin:0 auto;padding:1.5rem 1rem}
.erif h1{font-size:1.375rem;line-height:1.3;margin:0 0 1.25rem;letter-spacing:.01em}
.erif h2{font-size:1.0625rem;margin:1.75rem 0 .5rem}
.erif h2 .part{display:block;font-size:.875rem;font-weight:600;color:#4a4a4a}
.erif table{width:100%;border-collapse:collapse;table-layout:fixed}
.erif th,.erif td{text-align:left;vertical-align:top;padding:.5rem .625rem;border:1px solid #6b6b6b;overflow-wrap:anywhere}
.erif th{width:45%;font-weight:600;background:#f2f2f2}
.erif ul{margin:0;padding-left:1.25rem}
.erif footer{margin-top:1.5rem;font-size:.8125rem;color:#4a4a4a}
.erif footer dl{display:grid;grid-template-columns:max-content 1fr;gap:.125rem .75rem;margin:0}
.erif footer dt{font-weight:600}
.erif footer dd{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;hyphens:none}
@media (max-width:30rem){.erif th,.erif td{display:block;width:100%}.erif td{border-top:0}.erif th{border-bottom:0}.erif footer dl{grid-template-columns:minmax(0,1fr)}.erif footer dd{margin-bottom:.375rem}}
@media print{body{font-size:11pt}.erif{max-width:none;padding:0}.erif tr{break-inside:avoid}.erif h2{break-after:avoid}}
@page{margin:15mm}
`.trim();

function valueHtml(value: RenderValue): string {
  if (value.list) return `<ul>${value.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
  return value.lines.map((line) => escapeHtml(line)).join('<br>');
}

function bodyHtml(doc: RenderDocument): string {
  const parts = doc.parts
    .map((part, i) => {
      const id = `erif-part-${String(i + 1)}`;
      const rows = part.rows
        .map((row) => `<tr data-row="${escapeHtml(row.key)}"><th scope="row">${escapeHtml(row.label)}</th><td>${valueHtml(row.value)}</td></tr>`)
        .join('\n');
      return `<section aria-labelledby="${id}">\n<h2 id="${id}"><span class="part">${escapeHtml(part.label)}</span> ${escapeHtml(part.heading)}</h2>\n<table>\n<tbody>\n${rows}\n</tbody>\n</table>\n</section>`;
    })
    .join('\n');
  const footer = doc.footer.map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd>`).join('');
  return `<article class="erif" lang="${escapeHtml(doc.language)}">\n<h1>${escapeHtml(doc.title)}</h1>\n${parts}\n<footer><dl>${footer}</dl></footer>\n</article>`;
}

/**
 * Renders the form as an HTML fragment (an `<article>`), for embedding in a
 * page that provides its own styles. Throws if `record` is not a valid,
 * unmodified record.
 */
export function renderHtmlFragment(record: RepairFormRecord): string {
  return bodyHtml(buildDocument(assertRecord(record)));
}

/**
 * Renders the form as a complete HTML document. The document carries a
 * Content-Security-Policy that allows nothing except its own style element.
 * Throws if `record` is not a valid, unmodified record.
 *
 * @example
 * ```ts
 * writeFileSync('form.html', renderHtml(record));
 * ```
 */
export function renderHtml(record: RepairFormRecord): string {
  const doc = buildDocument(assertRecord(record));
  const styleHash = toBase64(sha256Bytes(utf8(DOCUMENT_CSS)));
  return `<!DOCTYPE html>
<html lang="${escapeHtml(doc.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(doc.title)} ${escapeHtml(record.id)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<main>
${bodyHtml(doc)}
</main>
</body>
</html>
`;
}
