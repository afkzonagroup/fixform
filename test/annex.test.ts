import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { annexChecksumInput, annexText, isLanguage, LANGUAGES, OFFICIAL_ANNEX, PART_ONE_ROWS, PART_TWO_ROWS } from '../src/index.js';
import { DIRECTIVE_2024_1799, MINIMUM_VALIDITY_DAYS } from '../src/law.js';

/**
 * Checksums of the official text as downloaded from EUR-Lex on 8 November 2026.
 * Kept here, apart from the data, so that any change to the official text must
 * change two files and is visible in review. Re-check with `npm run annex:verify`.
 */
const PINNED: Readonly<Record<string, string>> = {
  bg: '7b40f640911d00afd1ee8496b318c94e5a8e7ee3fd7f94a25275724a8b4cce7d',
  es: '3b9dcc5dacf94ad15b22da69a3a421d1e4be650babf41c8045f609019e11210f',
  cs: 'c7a420c65d5a37ab86f880c22bf873e6a1fab15f45fe6e4f817b6046bf24be22',
  da: '909102fb06fca617c293be23d8a82c9354e01096e1298d9db9731d646409f86f',
  de: 'd619bbfb16033317c74e23756f3d99b4a1a47f87d32d0c0deb0f2ae97f4ad792',
  et: '342ae48748f20f2cd6ea89966c7df29b4fa339f2722edc8e915e24cb7cc803fd',
  el: 'a3c89a7bf337c1c4c358d523e3fd2395676325fbde8789e34a3a9f5d5038e980',
  en: 'e072bea11ed1a655ea8630b4a7a9dae8d4051b7f2202f19a7dd15b0e50485279',
  fr: 'cfbe23a305e7daa33141be605f05f707ea27e7bbdf2b8508f712299764548ffd',
  ga: 'e37532f02dfa1fbd2d45bfd5b041c330cb0e453b32ad7698ed5a20b8b92d010d',
  hr: '31ec408bdd8e9f008d2743221016f643b099ed58438be87c780a0ecb2654756b',
  it: 'cb720663e1776b2b24fd6ba5ac79d131037641e6cca53b0be73ebbc247e3e4a5',
  lv: 'c05611a351d717bc7771edd45d93b72daab615ab5e39d192a057875fda1eb4cb',
  lt: '7f2f977b04c7426c63fe1001b5a6067563230f523c58ec679357b53fa40c95a7',
  hu: 'b3caca1839e9a53640d6deccef9d8327424a1953354cd718401738ed259d748d',
  mt: '799e7cde68bfd596602f8b1cfbc1f1aac88a516c961081c090982e9c5780f2de',
  nl: '0b34d7ef2e18935276b4c3d146bacded6cc58ef1d00d201b805e93f2623dcbf5',
  pl: '8edc1d621db09875066cf2b2ffc2b3fe5a6a9a7dc50948b66ba1f53d7b6bb248',
  pt: 'acaa0962e75a485f7b5907251b1dce5269e9389cfa63af66898ee1825df5547d',
  ro: 'fc8adbb94c41fac3fb5d80b68317f0da0d5bf866863e0fea8d4427b05d91b307',
  sk: 'c82fcf928a8ef2d45cdf805b016d93366ab7489d475198a017e804b69e85c59d',
  sl: 'a6172adedb30ca4cc89768bfc91c9308e76015f8158b56479e169a1924081cf8',
  fi: 'aefd95ad36bc54e4d1740023d9d2ecf65e0f98d5f385520dca468ed8cdd2876b',
  sv: 'e9d9a6af953cd6a8b02204ada92cc1d2b54b177c3a34e909bb3d85c661d38bb8',
};

describe('Annex I official text', () => {
  it('matches the checksums pinned when the text was taken from EUR-Lex', () => {
    expect(Object.fromEntries(OFFICIAL_ANNEX.map((t) => [t.language, t.sha256]))).toEqual(PINNED);
  });

  it('has all 24 official languages exactly once, in protocol order', () => {
    expect(LANGUAGES).toHaveLength(24);
    expect(OFFICIAL_ANNEX.map((t) => t.language)).toEqual(LANGUAGES);
  });

  it('every language is marked official, links its EUR-Lex text and has every heading', () => {
    for (const text of OFFICIAL_ANNEX) {
      expect(text.source).toBe('official');
      expect(text.url).toBe(`https://eur-lex.europa.eu/legal-content/${text.language.toUpperCase()}/TXT/HTML/?uri=CELEX:32024L1799`);
      for (const key of [...PART_ONE_ROWS, ...PART_TWO_ROWS]) expect(text.rows[key].label.trim().length).toBeGreaterThan(2);
      expect(Object.keys(text.rows)).toHaveLength(17);
      expect(text.formTitle.length).toBeGreaterThan(10);
      expect(text.partOne.heading.length).toBeGreaterThan(10);
      expect(text.partTwo.heading.length).toBeGreaterThan(10);
      expect(text.note.length).toBeGreaterThan(20);
      expect(text.words.yes.length).toBeGreaterThan(0);
      expect(text.words.no.length).toBeGreaterThan(0);
      expect(text.words.none.length).toBeGreaterThan(0);
    }
  });

  it('the stored text matches its SHA-256 checksum in every language (detects any edit)', () => {
    for (const text of OFFICIAL_ANNEX) {
      const digest = createHash('sha256').update(JSON.stringify(annexChecksumInput(text)), 'utf8').digest('hex');
      expect(digest, text.language).toBe(text.sha256);
    }
  });

  it('a one-character change breaks the checksum', () => {
    const en = annexText('en');
    const changed = { ...en, rows: { ...en.rows, repairer: { label: 'Repairer.', hint: en.rows.repairer.hint } } };
    expect(createHash('sha256').update(JSON.stringify(annexChecksumInput(changed)), 'utf8').digest('hex')).not.toBe(en.sha256);
  });

  it('rows without a bracketed indication are the ones the Official Journal leaves empty', () => {
    for (const text of OFFICIAL_ANNEX) {
      const empty = Object.entries(text.rows).filter(([, row]) => row.hint === null).map(([key]) => key);
      expect(empty, text.language).toEqual(['telephone', 'email', 'otherMeans', 'additionalInformation']);
      for (const [, row] of Object.entries(text.rows)) if (row.hint !== null) expect(row.hint).toMatch(/^\[[\s\S]+\]\.?$/u);
    }
  });

  it('English text is verbatim from the Official Journal', () => {
    const en = annexText('en');
    expect(en.annexTitle).toBe('ANNEX\u{a0}I');
    expect(en.formTitle).toBe('EUROPEAN REPAIR INFORMATION FORM');
    expect(en.partOne).toEqual({ label: 'Part\u{a0}I', heading: 'Identity and contact details of the repairer providing the repair service' });
    expect(en.partTwo).toEqual({ label: 'Part\u{a0}II', heading: 'Information on the repair service' });
    expect(en.rows.repairer).toEqual({ label: 'Repairer', hint: '[Identity]' });
    expect(en.rows.address).toEqual({ label: 'Address', hint: '[Geographical address to be used by the consumer]' });
    expect(en.rows.otherMeans.label).toBe(
      'If provided by the repairer, other means of online communication, which enable the consumer to contact, and communicate with, the repairer quickly and efficiently',
    );
    expect(en.rows.price.label).toBe('Price for repair or, if it cannot be calculated, the applicable calculation method and maximum price of repair');
    expect(en.rows.price.hint).toBe('[This means the total amount or, if not possible, the calculation method and the ceiling for the repair service, in EUR/national currency]');
    expect(en.rows.completionTime).toEqual({ label: 'Time to complete repair', hint: '[Time by which the repairer undertakes to perform the service in days]' });
    expect(en.rows.replacementCost.label).toBe('If yes, indicate the corresponding costs, if any:');
    expect(en.rows.validity).toEqual({ label: 'The period of validity of the European Repair Information Form', hint: '[Period of validity of at least 30 days]' });
    expect(en.rows.additionalInformation).toEqual({ label: 'If applicable, additional information', hint: null });
    expect(en.note).toBe('Indications between square brackets provide explanations for the repairer and must be replaced with the corresponding information.');
    expect(en.words).toEqual({ yes: 'Yes', no: 'No', none: 'None' });
  });

  it('spot checks in other languages', () => {
    expect(annexText('de').formTitle).toBe('EUROPÄISCHES FORMULAR FÜR REPARATURINFORMATIONEN');
    expect(annexText('de').rows.repairer).toEqual({ label: 'Reparaturbetrieb', hint: '[Name]' });
    expect(annexText('fr').rows.defect.label).toBe('Nature du défaut');
    expect(annexText('lt').formTitle).toBe('EUROPOS TAISYMO INFORMACIJOS FORMA');
    expect(annexText('lt').words).toEqual({ yes: 'Taip', no: 'Ne', none: 'nėra' });
    expect(annexText('it').words).toEqual({ yes: 'Sì', no: 'No', none: 'Nessuno' });
    expect(annexText('nl').words.no).toBe('Neen');
    expect(annexText('ga').words.none).toBe('Níl aon seirbhís choimhdeach ann');
    expect(annexText('el').formTitle).toBe('ΕΥΡΩΠΑΪΚΟ ΕΝΤΥΠΟ ΠΛΗΡΟΦΟΡΙΩΝ ΕΠΙΣΚΕΥΗΣ');
    expect(annexText('bg').formTitle).toBe('ЕВРОПЕЙСКИ ФОРМУЛЯР ЗА ИНФОРМАЦИЯ ОТНОСНО РЕМОНТА');
  });

  it('keeps known peculiarities of the official versions verbatim instead of "correcting" them', () => {
    // Finnish: the cost row after "temporary replacement goods" repeats the ancillary-services wording.
    expect(annexText('fi').rows.replacementCost.label).toBe('Jos lisäpalveluja on saatavilla, niiden kustannukset');
    expect(annexText('fi').rows.replacementCost.label).toBe(annexText('fi').rows.ancillaryCosts.label);
    // Croatian uses the same word for "No" and "None".
    expect(annexText('hr').words.no).toBe(annexText('hr').words.none);
  });

  it('every validity indication states the 30-day minimum of Article 4(5)', () => {
    expect(MINIMUM_VALIDITY_DAYS).toBe(30);
    // Spanish and Dutch write the number as a word.
    for (const text of OFFICIAL_ANNEX) expect(text.rows.validity.hint ?? '', text.language).toMatch(/30|treinta|dertig/u);
  });

  it('data/annex-i.json is identical to the module data', () => {
    const json = JSON.parse(readFileSync(new URL('../data/annex-i.json', import.meta.url), 'utf8')) as unknown;
    expect(json).toEqual(OFFICIAL_ANNEX);
  });

  it('language helpers', () => {
    expect(isLanguage('lt')).toBe(true);
    expect(isLanguage('LT')).toBe(false);
    expect(isLanguage('no')).toBe(false);
    expect(isLanguage(7)).toBe(false);
    expect(() => annexText('xx' as never)).toThrow(RangeError);
  });

  it('law references', () => {
    expect(DIRECTIVE_2024_1799.applicationDate).toBe('2026-07-31');
    expect(DIRECTIVE_2024_1799.celex).toBe('32024L1799');
  });
});
