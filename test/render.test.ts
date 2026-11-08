import { describe, expect, it } from 'vitest';
import {
  annexText,
  buildDocument,
  createRepairForm,
  DOCUMENT_CSS,
  formatDays,
  LANGUAGES,
  MESSAGES,
  NOT_APPLICABLE,
  PART_ONE_ROWS,
  PART_TWO_ROWS,
  renderHtml,
  renderHtmlFragment,
  renderMarkdown,
  renderText,
  escapeHtml,
  escapeMarkdown,
} from '../src/index.js';
import { createHash } from 'node:crypto';
import { mutableInput, validInput } from './fixtures.js';

const unescapeMarkdown = (md: string): string => md.replace(/\\([\\`*_{}[\]()#+\-.!|<>~&:=])/gu, '$1');

function decodeHtml(html: string): string {
  return html.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&amp;/gu, '&');
}

describe('rendering in all 24 languages', () => {
  it.each(LANGUAGES.map((l) => [l]))('%s: title, part labels, headings and every row heading appear verbatim in HTML, text and Markdown', (lang) => {
    const record = createRepairForm(validInput(lang));
    const official = annexText(lang);
    const expected = [
      official.formTitle,
      official.partOne.label,
      official.partOne.heading,
      official.partTwo.label,
      official.partTwo.heading,
      ...[...PART_ONE_ROWS, ...PART_TWO_ROWS].map((k) => official.rows[k].label),
    ];
    const html = decodeHtml(renderHtml(record));
    const text = renderText(record);
    const md = unescapeMarkdown(renderMarkdown(record));
    for (const s of expected) {
      expect(html, `${lang} html: ${s}`).toContain(s);
      expect(text, `${lang} text: ${s}`).toContain(s);
      expect(md, `${lang} md: ${s}`).toContain(s);
    }
    expect(renderHtml(record)).toContain(`<html lang="${lang}">`);
    // The yes word is official; the bracketed explanations are replaced by data, so they do not appear.
    expect(text).toContain(official.words.yes);
    expect(text).not.toContain(official.rows.good.hint ?? '\u{0}');
  });

  it('rows appear in the order of Annex I', () => {
    const doc = buildDocument(createRepairForm(validInput()));
    expect(doc.parts[0].rows.map((r) => r.key)).toEqual(PART_ONE_ROWS);
    expect(doc.parts[1].rows.map((r) => r.key)).toEqual(PART_TWO_ROWS);
  });
});

describe('row values', () => {
  it('No, None and not-applicable rows', () => {
    const input = mutableInput('de');
    input['temporaryReplacement'] = { available: false };
    input['ancillaryServices'] = [];
    Reflect.deleteProperty(input.repairer, 'otherMeans');
    Reflect.deleteProperty(input, 'diagnostic');
    Reflect.deleteProperty(input, 'additionalInformation');
    const doc = buildDocument(createRepairForm(input));
    const value = (key: string): readonly string[] => [...doc.parts[0].rows, ...doc.parts[1].rows].find((r) => r.key === key)?.value.lines ?? [];
    expect(value('replacementAvailable')).toEqual(['Nein']);
    expect(value('replacementCost')).toEqual([NOT_APPLICABLE]);
    expect(value('ancillaryServices')).toEqual(['Keine']);
    expect(value('ancillaryCosts')).toEqual([NOT_APPLICABLE]);
    expect(value('otherMeans')).toEqual([NOT_APPLICABLE]);
    expect(value('additionalInformation')).toEqual([NOT_APPLICABLE]);
  });

  it('price with calculation method and maximum, days, validity and diagnostic lines', () => {
    const input = mutableInput('en');
    input['price'] = { type: 'maximum', calculationMethod: '45 EUR per hour\nplus parts', maximum: { amount: '1250', currency: 'EUR' } };
    input['completionDays'] = 1;
    const doc = buildDocument(createRepairForm(input));
    const value = (key: string): readonly string[] => [...doc.parts[0].rows, ...doc.parts[1].rows].find((r) => r.key === key)?.value.lines ?? [];
    expect(value('price')).toEqual(['45 EUR per hour', 'plus parts', 'Maximum price: 1,250.00\u{a0}EUR']);
    expect(value('completionTime')).toEqual(['1\u{a0}day']);
    expect(value('validity')).toEqual(['30\u{a0}days', 'Provided on 2026-11-09', 'Valid until the end of 2026-12-09 (Europe/Vilnius)']);
    expect(value('additionalInformation')).toEqual(['Cost of the diagnostic service: 25.00\u{a0}EUR', 'This cost is deducted from the price of the repair.', 'Spare parts are new.']);
    expect(value('replacementCost')).toEqual(['0.00\u{a0}EUR']);
  });

  it('day plurals follow CLDR categories', () => {
    expect(formatDays(1, 'lt')).toBe('1\u{a0}diena');
    expect(formatDays(5, 'lt')).toBe('5\u{a0}dienos');
    expect(formatDays(10, 'lt')).toBe('10\u{a0}dienų');
    expect(formatDays(2, 'pl')).toBe('2\u{a0}dni');
    expect(formatDays(21, 'ro')).toBe('21\u{a0}de zile');
    expect(formatDays(3, 'cs')).toBe('3\u{a0}dny');
    expect(formatDays(30, 'hu')).toBe('30\u{a0}nap');
  });

  it('every language has a full set of translated interface strings', () => {
    const keys = Object.keys(MESSAGES.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(MESSAGES[lang]).sort(), lang).toEqual(keys);
      for (const [key, value] of Object.entries(MESSAGES[lang]) as [string, string][]) {
        expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
        const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] ?? '').sort();
        expect(placeholders(value), `${lang}.${key}`).toEqual(placeholders(MESSAGES.en[key as keyof typeof MESSAGES.en]));
      }
    }
  });
});

const NASTY_LINE = `<script>alert(1)</script><img src=x onerror=alert(2)> "quotes" 'apos' & [link](javascript:alert(3)) **bold** # head | pipe \`code\` ![i](http://x/y.png)`;
const NASTY = `===\n---\n1. list\n> quote\n${NASTY_LINE}`;

function nastyRecord(): ReturnType<typeof createRepairForm> {
  const input = mutableInput();
  input.repairer['identity'] = NASTY_LINE;
  input.repairer['address'] = `${NASTY}\n${NASTY}`;
  input.repairer['otherMeans'] = [NASTY_LINE];
  for (const key of ['good', 'defect', 'repairType', 'handOverPlace', 'additionalInformation']) input[key] = NASTY;
  input['ancillaryServices'] = [{ description: NASTY_LINE, cost: { amount: '1', currency: 'EUR' } }];
  input['price'] = { type: 'maximum', calculationMethod: NASTY, maximum: { amount: '5', currency: 'EUR' } };
  return createRepairForm(input);
}

describe('escaping', () => {
  it('HTML: no markup from data survives', () => {
    const html = renderHtml(nastyRecord());
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[^>]*\son\w+=/u);
    expect(html).not.toContain('"quotes"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quotes&quot; &#39;apos&#39; &amp;');
    expect(renderHtmlFragment(nastyRecord())).not.toContain('<script');
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('HTML: no external resources, no scripts, and a CSP that allows only its own style', () => {
    const html = renderHtml(createRepairForm(validInput()));
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|url\(|@import/iu);
    expect(html).not.toMatch(/href=/iu);
    const hash = createHash('sha256').update(DOCUMENT_CSS, 'utf8').digest('base64');
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'">`);
    expect(html).toContain(`<style>${DOCUMENT_CSS}</style>`);
  });

  it('Markdown: data cannot create links, images, HTML, emphasis, headings or tables', () => {
    const md = renderMarkdown(nastyRecord());
    const footer = /^.+: `(?:FX-[0-9A-Z-]+|sha256-[0-9a-f]{64})` {0,2}$/u;
    for (const line of md.split('\n')) {
      if (footer.test(line)) continue;
      expect(line).not.toMatch(/(?<!\\)\[[^\]]*(?<!\\)\]\(/u);
      expect(line).not.toMatch(/(?<!\\)<[a-z]/iu);
      // Only the bold row headings use unescaped asterisks, and only at both ends of the line.
      const inner = line.startsWith('**') && line.endsWith('**') ? line.slice(2, -2) : line;
      expect(inner).not.toMatch(/(?<!\\)[*_`]/u);
      if (line.startsWith('#')) expect(line).toMatch(/^#{1,2} /u);
      expect(line.startsWith('|')).toBe(false);
    }
    expect(md).toContain('\\<script\\>');
    expect(md).toContain('\\[link\\]\\(javascript\\:alert\\(3\\)\\)');
    expect(md).toContain('\\!\\[i\\]');
    expect(md).toContain('\\=\\=\\=');
    expect(md).toContain('\\-\\-\\-');
    expect(md).not.toMatch(/^(?:={3}|-{3}(?!$)|> |1\. )/mu);
    expect(escapeMarkdown('a_b*c')).toBe('a\\_b\\*c');
  });

  it('text: plain, LF line endings, no tabs', () => {
    const text = renderText(nastyRecord());
    expect(text).not.toContain('\r');
    expect(text).not.toContain('\t');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('output is deterministic', () => {
    expect(renderHtml(createRepairForm(validInput('fr')))).toBe(renderHtml(createRepairForm(validInput('fr'))));
    expect(renderMarkdown(createRepairForm(validInput('pl')))).toBe(renderMarkdown(createRepairForm(validInput('pl'))));
  });
});
