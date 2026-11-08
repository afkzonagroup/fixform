// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Extracts Annex I (the European Repair Information Form) of Directive
// (EU) 2024/1799 from the official HTML text on EUR-Lex, in all 24 official
// languages.
//
//   node scripts/annex-eurlex.mjs --verify            compare src/annex/data.ts with EUR-Lex
//   node scripts/annex-eurlex.mjs --write             regenerate src/annex/data.ts and data/annex-i.json
//   node scripts/annex-eurlex.mjs --dir <folder> ...  read <folder>/<lang>.html instead of downloading
//
// Needs network access unless --dir is given, so it is not part of `npm run check`.
// The test suite checks the stored text against the stored SHA-256 checksums.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LANGUAGES = ['bg', 'es', 'cs', 'da', 'de', 'et', 'el', 'en', 'fr', 'ga', 'hr', 'it', 'lv', 'lt', 'hu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'fi', 'sv'];

/** Row keys of Annex I in document order. */
export const ROW_KEYS = [
  'repairer', 'address', 'telephone', 'email', 'otherMeans',
  'good', 'defect', 'repairType', 'price', 'completionTime', 'replacementAvailable', 'replacementCost',
  'handOverPlace', 'ancillaryServices', 'ancillaryCosts', 'validity', 'additionalInformation',
];
const PART_ONE_ROWS = 5;

export const sourceUrl = (lang) => `https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/HTML/?uri=CELEX:32024L1799`;

function decode(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/giu, '\u00a0')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/giu, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gu, '&');
}

/** Collapses the HTML source formatting (ASCII white space) and trims, keeping the official characters. */
function clean(fragment) {
  const text = decode(fragment.replace(/<[^>]*>/gu, ''));
  return text.replace(/[ \t\r\n]+/gu, ' ').replace(/^[ \u00a0]+|[ \u00a0]+$/gu, '');
}

/** Returns the Annex I part of one official HTML text as ordered items. */
export function extractAnnex(html) {
  const start = html.search(/<div id="L_202401799[A-Z]{2}\.001901\.fmx">/u);
  const end = html.search(/<div id="L_202401799[A-Z]{2}\.002001\.fmx">/u);
  if (start < 0 || end < start) throw new Error('Annex I container not found');
  const annex = html.slice(start, end);
  const items = [];
  const token = /<table\b[\s\S]*?<\/table>|<p\b[^>]*\bclass="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gu;
  for (const m of annex.matchAll(token)) {
    if (m[0].startsWith('<table')) {
      for (const tr of m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gu)) {
        const cells = [...tr[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)].map((td) => clean(td[1]));
        items.push({ kind: 'row', cells });
      }
    } else {
      items.push({ kind: m[1], text: clean(m[2]) });
    }
  }
  return items;
}

// Opening and closing quotation marks used across the 24 language versions.
const QUOTED = /[‘“„«”»‚"]([^‘’“”„«»‚"]{1,60})[’”“»«‘"]/gu;

function quotedWords(text) {
  return [...text.matchAll(QUOTED)].map((m) => m[1]);
}

/** Builds the structured record for one language and checks the expected shape. */
export function toRecord(lang, items) {
  const shape = items.map((i) => (i.kind === 'row' ? `row${String(i.cells.length)}` : i.kind)).join(',');
  const expected = ['oj-doc-ti', 'oj-doc-ti', 'oj-ti-grseq-1', 'oj-ti-grseq-1', ...Array(5).fill('row2'), 'oj-ti-grseq-1', 'oj-ti-grseq-1', ...Array(12).fill('row2'), 'oj-normal'].join(',');
  if (shape !== expected) throw new Error(`${lang}: unexpected Annex I structure: ${shape}`);
  const rows = items.filter((i) => i.kind === 'row');
  const rowRecord = {};
  ROW_KEYS.forEach((key, index) => {
    const [label, hint] = rows[index].cells;
    if (!label) throw new Error(`${lang}: empty heading for ${key}`);
    rowRecord[key] = { label, hint: hint === '' ? null : hint };
  });
  const yesNo = quotedWords(rowRecord.replacementAvailable.hint ?? '');
  const none = quotedWords(rowRecord.ancillaryServices.hint ?? '');
  // The hint ends with the two words to choose from ('Yes' or 'No') and the word for no service ('None').
  // Some versions quote other terms earlier in the same sentence, so the last quoted words are used.
  if (yesNo.length < 2 || none.length < 1) throw new Error(`${lang}: could not find the quoted Yes/No/None words`);
  const record = {
    language: lang,
    source: 'official',
    url: sourceUrl(lang),
    annexTitle: items[0].text,
    formTitle: items[1].text,
    partOne: { label: items[2].text, heading: items[3].text },
    partTwo: { label: items[4 + PART_ONE_ROWS].text, heading: items[5 + PART_ONE_ROWS].text },
    rows: rowRecord,
    note: items.at(-1).text,
    words: { yes: yesNo.at(-2), no: yesNo.at(-1), none: none.at(-1) },
  };
  return { ...record, sha256: checksum(record) };
}

/** The strings of the form in document order: the input of the checksum. */
export function orderedStrings(record) {
  return [
    record.annexTitle,
    record.formTitle,
    record.partOne.label,
    record.partOne.heading,
    ...ROW_KEYS.slice(0, PART_ONE_ROWS).flatMap((k) => [record.rows[k].label, record.rows[k].hint]),
    record.partTwo.label,
    record.partTwo.heading,
    ...ROW_KEYS.slice(PART_ONE_ROWS).flatMap((k) => [record.rows[k].label, record.rows[k].hint]),
    record.note,
  ];
}

export function checksum(record) {
  return createHash('sha256').update(JSON.stringify(orderedStrings(record)), 'utf8').digest('hex');
}

async function load(lang, dir) {
  if (dir) return await readFile(join(dir, `${lang}.html`), 'utf8');
  const response = await fetch(sourceUrl(lang), { headers: { 'User-Agent': 'fixform-annex-check' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${lang}: HTTP ${String(response.status)}`);
  return await response.text();
}

/** JSON text with no-break spaces written as \u00a0 escapes, so they stay visible in review. */
function json(value) {
  return JSON.stringify(value, null, 2).replace(/\u00a0/gu, '\\u00a0');
}

function tsModule(records) {
  return `/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 *
 * GENERATED by scripts/annex-eurlex.mjs from the official text of
 * Directive (EU) 2024/1799, Annex I, on EUR-Lex. Do not edit by hand.
 * (c) European Union, https://eur-lex.europa.eu/. Reuse is authorised under
 * Commission Decision 2011/833/EU.
 */

import type { OfficialAnnexText } from './types.js';

/** Annex I of Directive (EU) 2024/1799, verbatim, in all 24 official languages. */
export const OFFICIAL_ANNEX: readonly OfficialAnnexText[] = ${json(records)};
`;
}

async function main() {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const dir = dirIndex >= 0 ? args[dirIndex + 1] : undefined;
  const records = [];
  for (const lang of LANGUAGES) {
    records.push(toRecord(lang, extractAnnex(await load(lang, dir))));
    if (!dir) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (args.includes('--write')) {
    await writeFile(new URL('../src/annex/data.ts', import.meta.url), tsModule(records));
    await writeFile(new URL('../data/annex-i.json', import.meta.url), `${json(records)}\n`);
    console.log(`wrote ${String(records.length)} languages`);
    return;
  }
  const { OFFICIAL_ANNEX } = await import('../dist/annex/data.js');
  let failures = 0;
  for (const record of records) {
    const stored = OFFICIAL_ANNEX.find((r) => r.language === record.language);
    const ok = stored !== undefined && JSON.stringify(stored) === JSON.stringify(record);
    console.log(`${record.language}: ${ok ? 'ok' : 'MISMATCH'}`);
    if (!ok) failures += 1;
  }
  if (failures > 0) {
    console.error(`${String(failures)} language(s) differ from EUR-Lex`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
