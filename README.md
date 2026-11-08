# Fixform

Fixform fills in, checks and renders the European Repair Information Form of the Right to Repair Directive, in all 24 official EU languages.

## Why it exists

[Directive (EU) 2024/1799](https://eur-lex.europa.eu/eli/dir/2024/1799/oj) on common rules promoting the repair of goods sets out a standard form, the European Repair Information Form, in its Annex I. Member States apply the national rules that transpose the directive from 31 July 2026 (Article 22(1)).

The form is optional. Article 4(1) says repairers **may** provide it. When a repairer does provide it, the directive sets these rules:

- It is provided on a durable medium, within a reasonable time after the request and before the consumer is bound by a repair contract (Article 4(1)).
- It is free of charge (Article 4(2)). If a diagnostic service is needed to find the defect, choose the repair and estimate the price, the repairer may ask the consumer to pay the necessary costs of that service and must inform the consumer about those costs (Article 4(3)).
- It states the conditions of repair listed in Article 4(4), in a clear and comprehensible manner.
- The repairer may not change those conditions for 30 calendar days from the day the form was provided. A longer period may be agreed. If the consumer accepts within that period, the repairer must do the repair on those conditions (Article 4(5)).
- A complete and accurate form counts as meeting certain pre-contractual information duties of Directives 2011/83/EU, 2006/123/EC and 2000/31/EC (Article 4(6)).

Fixform takes the form's structure and every heading from the Official Journal in each language, so the form you give consumers matches the official text.

## Quick start

Requires Node.js 22 or newer.

```sh
npm install @afkzona/fixform
```

Save this as `form.json`:

```json
{
  "language": "en",
  "repairer": {
    "identity": "Example Repairs Ltd",
    "address": "1 Example Street\n01100 Vilnius\nLithuania",
    "telephone": "+370 600 00000",
    "email": "repairs@example.com"
  },
  "good": "Washing machine, model Y, serial number 12345",
  "defect": "The drum does not turn. The drive belt is torn.",
  "repairType": "Replace the drive belt and test a full wash cycle.",
  "price": { "type": "fixed", "total": { "amount": "89.00", "currency": "EUR" } },
  "completionDays": 5,
  "temporaryReplacement": { "available": false },
  "handOverPlace": "At our workshop",
  "ancillaryServices": [
    { "description": "Collection and return", "cost": { "amount": "20.00", "currency": "EUR" } }
  ],
  "validity": { "timeZone": "Europe/Vilnius" }
}
```

Then:

```sh
npx fixform validate form.json --provided-at now
npx fixform render form.json --provided-at now --format text
npx fixform render form.json --provided-at now --out form.html
```

`form.html` is a complete, self-contained document you can e-mail, print or archive.

## Library

The main entry point has no runtime dependencies and works in Node.js and browsers.

<!-- doctest -->
```ts
import { createRepairForm, renderHtml, renderText, verifyRepairForm } from '@afkzona/fixform';

const record = createRepairForm({
  language: 'de',
  repairer: {
    identity: 'Beispiel Reparatur GmbH',
    address: 'Musterstraße 1\n10115 Berlin',
    telephone: '+49 30 1234567',
    email: 'reparatur@example.com',
  },
  good: 'Kaffeemaschine, Modell X',
  defect: 'Undicht',
  repairType: 'Dichtung ersetzen',
  price: { type: 'maximum', calculationMethod: '60 EUR pro Stunde zuzüglich Teile', maximum: { amount: '180', currency: 'EUR' } },
  completionDays: 7,
  temporaryReplacement: { available: true, cost: { amount: '0', currency: 'EUR' } },
  handOverPlace: 'In unserer Werkstatt',
  ancillaryServices: [],
  validity: { providedAt: '2026-11-09T10:00:00+01:00', timeZone: 'Europe/Berlin' },
});

if (record.validity.lastDay !== '2026-12-09') throw new Error('unexpected period of validity');
if (!renderText(record).includes('EUROPÄISCHES FORMULAR FÜR REPARATURINFORMATIONEN')) throw new Error('missing title');
if (!renderHtml(record).startsWith('<!DOCTYPE html>')) throw new Error('not a document');

// Later: prove what was given. The record is plain JSON; store it as it is.
const stored = JSON.parse(JSON.stringify(record)) as unknown;
if (!verifyRepairForm(stored).ok) throw new Error('record changed');
```

Main functions:

| Function | What it does |
|---|---|
| `validateRepairForm(input, options?)` | Checks untrusted data. Returns `{ ok: true, value, warnings }` or `{ ok: false, errors, warnings }`. Each issue has a `path`, a `code` and an English `message`. |
| `createRepairForm(input, options?)` | Validates, computes the period of validity and returns a record with `id` and `integrity`. Throws `FixformValidationError` with all issues. |
| `verifyRepairForm(value)` | Checks a stored record: valid data, correct period of validity, matching ID and hash. |
| `renderHtml(record)` | Complete HTML document. No scripts, no external resources, its own CSP. |
| `renderHtmlFragment(record)` | The `<article>` only, for embedding. |
| `renderText(record)`, `renderMarkdown(record)` | Plain text and Markdown. |
| `annexText(language)` | The official Annex I text of one language. |
| `computeValidity(validity)` | The period of validity (see below). |

`options.providedAt` lets a server set the time the form is provided from its own clock. The input must then not contain `validity.providedAt`.

The renderers accept only records that verify, so a changed record cannot be rendered by mistake.

### Form ID and integrity hash

`record.integrity` is `sha256-` followed by the SHA-256 of the canonical JSON (keys sorted, no white space) of `{ format, form, validity }`. `record.id` is the first 80 bits of the same hash in Crockford base32, for example `FX-E0GV-7J45-SW3R-B4YW`. The same data always gives the same ID and hash, on any machine. The rendered documents print both.

The hash shows that a record was not changed after it was made. It does not show when or to whom the form was given. Keep the e-mail you sent, or other delivery evidence, for that.

### Period of validity

Article 4(5) sets at least 30 calendar days from the day the form was provided, and does not say how to count them. Fixform counts the way Article 3 of [Regulation (EEC, Euratom) No 1182/71](https://eur-lex.europa.eu/eli/reg/1971/1182/oj) counts periods in EU acts:

- the day the form is provided does not count (Article 3(1));
- the period ends at the end of the last day (Article 3(2)(b)), in the repairer's time zone;
- Saturdays, Sundays and public holidays count (Article 3(3));
- if the last day is a Saturday, Sunday or public holiday, the period ends at the end of the next working day (Article 3(4)).

The last rule is on by default for weekends. Pass your Member State's public holidays in `validity.rollForward.publicHolidays`, or set `rollForward: false` to count exactly the number of days. The rule only ever lengthens the period. National law transposing the directive decides how the period is counted; check it.

Example: provided on 9 November 2026 in Vilnius, 30 days, valid until the end of 9 December 2026 (22:00 UTC).

## Web component

```html
<script type="module">
  import '@afkzona/fixform/component/define';
</script>

<repair-form mode="fill" lang="lt" currency="EUR" time-zone="Europe/Vilnius"></repair-form>
<repair-form id="view"></repair-form>
```

```js
document.querySelector('repair-form[mode=fill]').addEventListener('repair-form-submit', (event) => {
  // event.detail.form is the form data without validity.providedAt; send it to your server.
});
document.getElementById('view').record = record; // a record from createRepairForm
```

- `mode="view"` (default) shows a record. Records that do not verify are not shown; the element fires `repair-form-error`.
- `mode="fill"` shows a form labelled with the official headings and explanations. It validates on submit, marks invalid fields and moves focus to the first one. It fires `repair-form-submit` or `repair-form-invalid`. It never sends anything itself.
- Attributes: `mode`, `lang` (interface language), `currency` (default `EUR`), `time-zone` (default: the browser's).
- Properties: `record`, `value` (initial values in fill mode).
- Shadow DOM, styles through a constructable stylesheet, no HTML strings. It works under `Content-Security-Policy: script-src 'self'; style-src 'self'`.
- Tested with axe-core for WCAG 2.1 A and AA in Chromium, at 1280 px and 320 px, in all 24 languages for layout.
- Theme it with CSS custom properties: `--fixform-font`, `--fixform-text`, `--fixform-muted`, `--fixform-background`, `--fixform-surface`, `--fixform-border`, `--fixform-accent`, `--fixform-accent-text`, `--fixform-error`, `--fixform-focus`, `--fixform-radius`. Parts: `form`, `document`, `title`, `field`, `label`, `hint`, `input`, `error`, `button`, `table`, `footer`.

If you change the colours, check the contrast again.

## React

```sh
npm install @afkzona/fixform react
```

```jsx
import { RepairForm } from '@afkzona/fixform/react';

<RepairForm mode="fill" lang="fr" timeZone="Europe/Paris" onSubmit={(detail) => send(detail.form)} />
<RepairForm record={record} />
```

Works with React 18 and 19. `record` and `value` are set as element properties, never as attributes.

## Vue

```sh
npm install @afkzona/fixform vue
```

```js
import { RepairForm } from '@afkzona/fixform/vue';

// In a render function or template:
h(RepairForm, { mode: 'fill', lang: 'it', timeZone: 'Europe/Rome', onSubmit: (detail) => send(detail.form) });
```

Emits `submit` and `invalid`. No template compiler or `isCustomElement` setting is needed.

## Command line

```sh
fixform render <file> [--format html|text|md|json] [--lang <code>] [--provided-at <iso>|now] [--out <file>] [--force]
fixform validate <file> [--provided-at <iso>|now]
fixform verify <record.json>
fixform languages
fixform schema
```

- `<file>` is a form in JSON, or in YAML if you install the optional `yaml` package (`npm install yaml`). For `render`, it can also be a record made earlier with `--format json`; the record is verified first.
- `--provided-at now` sets the time the form is provided. Without it, the file must contain `validity.providedAt`.
- `--format json` writes the record. Keep it: it is what `verify` checks.
- `--out` writes only inside the current directory, creates the file with mode 0600, and replaces an existing file only with `--force`. It never writes through a symbolic link.
- Exit codes: 0 success, 1 invalid form or record, 2 usage or file error.

## E-mail: providing the form on a durable medium

Article 2(12) points to the definition in Article 2(11) of [Directive (EU) 2019/771](https://eur-lex.europa.eu/eli/dir/2019/771/oj): a durable medium lets the consumer store information addressed personally to them, accessible for future reference for an adequate time, and reproduce it unchanged. An e-mail to the consumer with the form attached is a common way to do this. Whether your channel qualifies is for you to check.

Fixform renders the e-mail; it does not send it. Hand the message to your own SMTP client or e-mail API.

<!-- doctest -->
```ts
import { createRepairForm } from '@afkzona/fixform';
import { renderRepairFormEmail } from '@afkzona/fixform/email';

const record = createRepairForm({
  language: 'en',
  repairer: { identity: 'Example Repairs Ltd', address: '1 Example Street', telephone: '+370 600 00000', email: 'repairs@example.com' },
  good: 'Laptop',
  defect: 'Does not charge',
  repairType: 'Replace the charging port',
  price: { type: 'fixed', total: { amount: '75', currency: 'EUR' } },
  completionDays: 3,
  temporaryReplacement: { available: false },
  handOverPlace: 'At our shop',
  ancillaryServices: [],
  validity: { providedAt: '2026-11-09T10:00:00+02:00', timeZone: 'Europe/Vilnius' },
});

const email = renderRepairFormEmail({ record, from: 'Example Repairs <repairs@example.com>', to: 'jane@example.org' });
// email.raw is a complete MIME message (text, HTML and the form as an HTML attachment).
// Send it with your transport, for example: transport.sendMail({ envelope: { from: email.envelopeFrom, to: email.envelopeTo }, raw: email.raw })
if (!email.raw.includes('Content-Disposition: attachment')) throw new Error('missing attachment');
```

Every header value is checked for line breaks and control characters, and non-ASCII text is encoded (RFC 2047), so the message cannot be used for header injection.

## Server handler (Fetch API, Node.js, Express)

`createRepairFormHandler` takes `POST { "form": {...}, "consumerEmail": "..." }`, sets the time the form is provided from the server clock, creates the record, renders the e-mail and calls your `deliver` function. It answers `201 { id, integrity, lastDay, endsAt }`.

The handler sends e-mail to an address taken from the request, so it needs an access check and refuses to start without one: `authorize` (your own check, for example a staff session) or `token` (a shared secret of at least 16 characters, sent as `Authorization: Bearer`). When both are set, both must pass.

<!-- doctest -->
```ts
import { createRepairFormHandler } from '@afkzona/fixform/server';

const sent: string[] = [];
const handler = createRepairFormHandler({
  allowedOrigins: ['https://repairs.example.com'],
  from: 'Example Repairs <repairs@example.com>',
  authorize: (request) => request.headers.get('cookie')?.includes('staff_session=') === true, // replace with your session check
  deliver: async (message) => {
    sent.push(message.raw); // replace with your mail transport
  },
  onProvided: async (record) => {
    // store the record as evidence of what was provided
  },
});

const response = await handler(
  new Request('https://repairs.example.com/repair-forms', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }),
);
if (response.status !== 403) throw new Error('cross-site request was not rejected');
```

In a Fetch runtime, pass the client address as the second argument (`handler(request, { clientAddress })`); without it, all requests share one rate-limit bucket. Browsers always send `Origin` with these requests; other clients can send any header, so the origin check protects against cross-site requests from browsers only. The access check is what keeps everyone else out.

With Node.js `http` or Express, wrap it with `toNodeListener`. Do not put a body parser in front of it.

```js
import express from 'express';
import { toNodeListener } from '@afkzona/fixform/node';

const app = express();
app.post('/repair-forms', toNodeListener(handler));
```

A complete example with a staff page is in [`examples/express-email`](examples/express-email) (`npm run example`). A Fetch runtime example (Deno, Bun, edge) is in [`examples/fetch`](examples/fetch).

Handler options:

| Option | Default | Meaning |
|---|---|---|
| `allowedOrigins` | required | Origins allowed to post (CSRF protection). Without an `Origin` header, `Sec-Fetch-Site: same-origin` is required. |
| `from` | required | Sender of the e-mail. Checked at start-up. |
| `deliver(message, record)` | required | Sends the message. If it throws, the answer is `502`. Give your transport a timeout. |
| `onProvided(record)` | none | Called after delivery, for example to store the record. If it throws, the answer is `500` with `error: "provided_not_recorded"` and the form ID: the e-mail was sent, so do not retry. |
| `token` | none | Shared secret for `Authorization: Bearer`, compared in constant time. Read it from the environment. |
| `maxBodyBytes` | 65536 | Request body limit, enforced while streaming. |
| `rateLimit` | 30 per minute | Per client address (IPv6 per /64), in memory, one limiter per handler. `false` turns it off. |
| `allowRequest(key)` | none | Your own rate-limit hook, for example backed by Redis. |
| `now()` | `Date.now` | Clock. |

## Input reference

| Field | Annex I row | Rules |
|---|---|---|
| `language` | | One of `bg es cs da de et el en fr ga hr it lv lt hu mt nl pl pt ro sk sl fi sv`. |
| `repairer.identity` | Repairer [Identity] | Required, one line, up to 200 characters. |
| `repairer.address` | Address | Required, up to 500 characters, line breaks allowed. |
| `repairer.telephone` | Telephone number | Required. Digits, spaces and `+ ( ) . / -`. |
| `repairer.email` | Email address | Required. |
| `repairer.otherMeans` | Other means of online communication | Optional list, up to 10 lines. |
| `good` | Good to be repaired | Required, up to 500 characters. |
| `defect` | Nature of the defect | Required, up to 2000 characters. |
| `repairType` | Type of repair suggested | Required, up to 2000 characters. |
| `price` | Price for repair or calculation method and maximum price | `{ type: 'fixed', total }` or `{ type: 'maximum', calculationMethod, maximum }`. |
| `completionDays` | Time to complete repair | Whole days, 1 to 3650. |
| `temporaryReplacement` | Availability of temporary replacement goods; costs | `{ available: false }` or `{ available: true, cost }` (cost may be zero). |
| `handOverPlace` | Place to hand over the goods | Required. |
| `ancillaryServices` | Ancillary services; costs | List of `{ description, cost }`, up to 20. An empty list prints the official word for "None". |
| `validity.providedAt` | Period of validity | ISO 8601 date and time with an offset. Or set by the server or `--provided-at`. |
| `validity.timeZone` | | The repairer's IANA time zone. |
| `validity.days` | | At least 30 (Article 4(5)). Default 30. |
| `validity.rollForward` | | `{ weekends?: boolean, publicHolidays?: string[] }` or `false`. Default: weekends on. |
| `diagnostic` | Additional information | Optional `{ cost, consumerInformedOn, deductedFromRepairPrice }`. See Article 4(3). |
| `additionalInformation` | If applicable, additional information | Optional, up to 4000 characters. |

Amounts are decimal strings such as `"129.90"` (JSON numbers are accepted when exact). Currencies: `EUR`, and the national currencies of EU and EEA states that do not use the euro: `CZK DKK HUF PLN RON SEK ISK CHF NOK`. Enter the total price the consumer pays, including taxes. Text is trimmed and normalised to Unicode NFC. Control characters and invisible format characters (bidirectional controls, zero-width and tag characters, the soft hyphen) are rejected. Unknown fields are rejected.

A JSON Schema (draft 2020-12) is in `data/repair-form.schema.json` (`@afkzona/fixform/repair-form.schema.json`, or `fixform schema`). It covers structure and limits; `validateRepairForm` is the authority for the rest (time zones, calendar dates, the diagnostic-cost date).

## How Fixform maps to the law

| Provision | What it says | In Fixform |
|---|---|---|
| [Art. 2](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_2) | Definitions: repairer, durable medium (via Directive 2019/771 Art. 2(11)) | E-mail rendering and its documentation |
| [Art. 4(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | Repairers **may** provide the form; durable medium; reasonable time; before the consumer is bound | Optional tool; `renderRepairFormEmail`; server sets the time provided |
| [Art. 4(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | Free of charge | No fee field. Nothing in Fixform charges for the form. |
| [Art. 4(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | Diagnostic costs may be charged; the consumer must be informed about them | `diagnostic` field; error if the consumer was informed after the day the form is provided (recital 12) |
| [Art. 4(4)(a)-(k)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | Content of the form | One required field per point; (i) and (k) "where applicable" |
| [Art. 4(5)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | 30 calendar days binding; longer may be agreed | `validity.days` at least 30; computed last day and end instant |
| [Art. 4(6)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_4) | A complete and accurate form counts for certain pre-contractual duties | Validation of every Annex I row. Accuracy of the content is the repairer's responsibility. |
| [Art. 5](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_5), [6](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_6) | Manufacturers' obligation to repair goods listed in Annex II; information on that obligation | Not covered (see Limitations) |
| [Art. 7(6)(c)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_7) | The European online platform for repair lets consumers request the form from repairers offering it | Not covered; the platform interface is to be developed by the Commission by 31 July 2027 (Art. 7(2)) |
| [Art. 16](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_16) | Amends Directive 2019/771 (durability and repairability in conformity; 12-month extension of liability after repair; informing about the choice between repair and replacement) | Not covered; it concerns the seller's legal guarantee, not the form |
| [Art. 22(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#art_22) | Member States apply their measures from 31 July 2026 | Warning `before_application_date` |
| [Annex I](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024L1799#anx_%C2%A0I) | The form | Headings, part titles, explanations and the words for Yes, No and None, verbatim in 24 languages |

Corrigenda: three corrigenda have been published (OJ L, 2024/90789; OJ L, 2025/90841, Italian only; OJ L, 2026/90848). They renumber points in Articles 17 and 18 and do not change Article 4 or Annex I. Commission Delegated Directive (EU) 2026/74 adds point 11 (local space heaters) to Annex II; it does not change Annex I.

## Languages

The form's title, part titles, row headings, bracketed explanations, closing note and the words for Yes, No and None are **official text**, taken verbatim from the Official Journal HTML of each language on EUR-Lex. They are marked `source: "official"`, with the EUR-Lex URL and a SHA-256 checksum, in `src/annex/data.ts` and `data/annex-i.json`. `npm run annex:verify` downloads all 24 versions again and compares.

Some official versions have peculiarities, kept verbatim:

- Finnish: the cost row after "temporary replacement goods" repeats the heading of the ancillary-services cost row ("Jos lisäpalveluja on saatavilla, niiden kustannukset").
- Croatian uses "Ne" for both "No" and "None". Dutch uses "Neen" for "No".
- Spanish and Dutch write the 30 days in words.

Everything else is a **working translation, not official text, and needs native review**: the footer labels (form ID, integrity check), "days", "provided on", "valid until", "maximum price", the diagnostic-cost lines, the fill-in interface and the error messages. They are in `src/i18n/messages.ts`, marked `source: "translation"`. Native speakers of any of the 24 languages are welcome to review them; see CONTRIBUTING.md.

## Limitations

- Fixform does not make anyone compliant with anything. It helps you produce the optional form correctly. The content (prices, times, the description of the defect) is the repairer's responsibility.
- It covers Article 4 and Annex I only. It does not cover the manufacturers' obligation to repair (Articles 5 and 6), the European online platform (Article 7), national measures or penalties, or the amendments to Directive 2019/771.
- National law transposing the directive may add rules (for example on language, on counting periods, or on deducting diagnostic costs). Fixform does not know national law.
- It does not send e-mail. You choose and run the transport, and you decide whether your channel is a durable medium.
- The integrity hash detects a record that was changed or damaged by mistake. Anyone can compute it for any data, so it is not a signature or a timestamp: keep the sent e-mail as evidence of what was provided.
- Interface translations are not reviewed by native speakers yet.
- Numbers are formatted with fixed separators per language, not with the runtime's locale data, so output is identical everywhere. Dates are written as YYYY-MM-DD.

## Roadmap

These connectors are not built yet. They will only ship once they are finished and tested end to end (for PHP: in Docker against real WordPress and WooCommerce):

- WooCommerce plugin (repair-service orders).
- Shopify and Shopware apps.
- PDF/A output.
- An importer for national public-holiday calendars.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability. In short: every input is validated with allow-lists and size limits; all output is escaped for its format; the web component builds DOM with `createElement` and `textContent` only; the server handler checks method, rate limit, origin, token, content type and body size before parsing; the CLI writes only inside the working directory and never through symbolic links. There is no telemetry and nothing leaves your machine unless your own `deliver` function sends it.

## Dependencies

Runtime: none. Optional peer dependencies, used only if you use the matching feature:

- `react` (>= 18) for `@afkzona/fixform/react`;
- `vue` (>= 3.3) for `@afkzona/fixform/vue`;
- `yaml` (>= 2.8, < 3) for YAML input in the CLI. Chosen because it has no dependencies, supports a strict core schema and can forbid aliases.

Development dependencies (exact versions, see `package.json`): TypeScript, ESLint with typescript-eslint, Vitest with V8 coverage, happy-dom, React, Vue, Express and its types, ajv (to check the JSON schema), playwright-core and axe-core (browser accessibility tests). Run `npm run browsers` once to download Playwright's Chromium headless shell.

## Development

```sh
npm ci
npm run browsers   # once: Chromium for the browser tests
npm run check      # typecheck + lint + build + tests with coverage
npm run example    # example staff page on http://localhost:3000
npm run annex:verify   # compare the official text with EUR-Lex (needs network)
```

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 MB AFKzona Group. The official text of the directive is (c) European Union and reused under Commission Decision 2011/833/EU. "Fixform" is a trademark of MB AFKzona Group; see [TRADEMARKS.md](TRADEMARKS.md).

## Enterprise

MB AFKzona Group offers integration into your systems, custom connectors and features, and support agreements. Contact info@afkzonagroup.lt.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests need a signed [CLA](CLA.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Disclaimer

This is not legal advice. Fixform is a technical tool. Read the official text and your national law, and ask a lawyer if you are unsure.

Maintained by AFKzona Group.
