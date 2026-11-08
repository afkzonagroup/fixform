# Review record

Two review passes were made after the build, as the project rules require.
Both are recorded here: what was checked, what was found and what was fixed.
An independent review by the maintainers follows before publishing.

## Pass 1: correctness, law, API, tests, security checklist

### Law (checked against the official text on EUR-Lex)

- Read Directive (EU) 2024/1799 in full in English: Articles 1 to 24,
  Annexes I and II, recitals 10 to 14, 23 and 33 (the ones about the form).
  Checked the corrigenda (OJ L 2024/90789, all languages; 2025/90841,
  Italian only; 2026/90848, all languages) in all their language versions:
  they renumber points in the annexes amended by Articles 17 and 18 and do
  not touch Article 4 or Annex I. Commission Delegated Directive (EU)
  2026/74 adds point 11 to Annex II only.
- Article references in the brief were checked against the text: the
  European online platform is Article 7 (Article 6 is "information on
  obligation to repair"); transposition and the application date are in
  Article 22 (Article 13 is "Member States' measures promoting repair").
  The README cites the correct articles.
- Annex I was extracted from the Official Journal HTML of all 24 language
  versions with `scripts/annex-eurlex.mjs`, and independently with a second
  parser during the build; both gave identical strings. All 24 versions have
  the same structure: two parts, 5 + 12 rows, the same four rows without a
  bracketed indication, and a closing note. `npm run annex:verify` was run
  against live EUR-Lex: all 24 match.
- Peculiarities of the official versions are kept verbatim and documented
  (Finnish repeated cost heading, Croatian "Ne" for No and None, Dutch
  "Neen", numbers in words in Spanish and Dutch, Swedish full stop after one
  bracket).
- The form is presented as optional ("repairers may", Article 4(1)) in the
  README and nowhere as mandatory. The tool never claims compliance.
- Article 4(4)(a)-(k) map to required fields; (i) and (k) are "where
  applicable". Telephone and e-mail are required (Article 4(4)(b)).
- Article 4(5): at least 30 calendar days; counting follows Article 3 of
  Regulation 1182/71, which the directive does not name: documented as
  Fixform's choice, national law decides. The Article 3(4) roll-forward is on
  by default for weekends because it only lengthens the period.
- Article 4(3): diagnostic costs. The timing rule (before the form) comes
  from recital 12 and is labelled as such in the error message.
- Bulgaria's currency: checked Council Decision (EU) 2025/1407 on EUR-Lex
  (euro from 1 January 2026); BGN is not accepted.

### Findings and fixes

| # | Finding | Fix |
|---|---|---|
| 1 | Long German words overflowed the fill form at 320 px (322 px wide). | `overflow-wrap:anywhere; hyphens:auto` in the component and document styles; a browser test now checks every language at 320 px in view and fill mode. |
| 2 | The footer (form ID, hash) was squeezed into a narrow column at 320 px and the ID was hyphenated. | Footer stacks on narrow screens; `hyphens:none` on the ID and hash. Checked on screenshots. |
| 3 | "Additional information" appeared twice in fill mode (legend and field label). | Diagnostic fields moved before a single "additional information" field. |
| 4 | React 19 sets custom-element props as properties; `currency` had only a getter and threw. | Setters for `currency` and `timeZone`; wrapper test with React 19. |
| 5 | Telephone numbers starting with "(" were rejected. | Pattern allows an opening parenthesis; schema pattern updated. |
| 6 | Tool input turned ` `-style escapes into raw no-break spaces in several files. | Replaced with `\u{a0}` escapes; a hygiene test rejects raw special spaces in code. |
| 7 | Removing four security controls did not make any test fail: e-mail display-name control characters, the CLI streaming size limit, own-property reading in the component, and the CSP meta element. | Added tests for each. The CLI now relies on the streaming limit (the stat check was redundant). Every control in the list below was removed one at a time and a test failed each time. |
| 8 | A line of `===` in data could turn the previous line into a Markdown heading. | `=` is escaped; test with `===`, `---`, `1.` and `>` lines. |
| 9 | A contributor could change the official text and its checksum together. | The 24 checksums are also pinned in `test/annex.test.ts`, so a change must touch two files; `npm run annex:verify` compares with EUR-Lex. |
| 10 | A deeply nested stored record could overflow the stack in verification. | Caught and reported as "invalid record"; test with 100 000 levels. |

### Security controls checked by removal

Each control was removed in turn and the test suite run; all failed as
expected: HTML escaping, Markdown escaping, forbidden keys, unknown fields,
forbidden characters, length limits, count limits, the 30-day minimum,
server-set "provided at", the diagnostic-cost date, record verification in
the renderers, the integrity check, the origin check, the token check, the
content-type check, the streaming body limit, the Content-Length limit, the
rate limiter, the rate limiter's memory bound, security headers, error
details not leaking, e-mail header injection (addresses, names, subject),
CLI output inside the working directory, CLI regular-file check, CLI input
size, no overwrite without `--force`, no replacing through a symlink, mode
0600, YAML aliases, YAML unique keys, record verification in the component,
own-property reading in the component, and the document's CSP.

### Other checks

- `npm run check`: typecheck, lint, build and all tests pass; coverage
  above 97 % of lines.
- README quick start run from a packed tarball in an empty directory:
  install, `validate`, `render --format text`, `render --out`, library
  imports from every entry point, YAML with and without the optional
  `yaml` package.
- `npm audit --omit=dev`: 0 vulnerabilities (there are no runtime
  dependencies). The development toolchain reports a moderate advisory in
  `minimatch` through ESLint; it does not ship.
- Screenshots of view mode, fill mode with errors and the standalone
  document at 1280 px and 320 px were looked at.

## Pass 2: hostile input and hostile contributors

Questions asked: what would an attacker send, and what could a malicious
pull request slip in?

| # | Attack considered | Result |
|---|---|---|
| 1 | Change a record after verification through the component's `record` getter, then trigger a re-render. | Found: the view rendered the changed data. Fixed: the component verifies the record at every render; test added. |
| 2 | Non-browser client forging `Origin` / `Sec-Fetch-Site`. | Not a CSRF issue (CSRF needs a victim browser), but the origin check is not authentication. Documented in README and SECURITY.md: use `token` or your own login for API clients. |
| 3 | Fetch runtimes without a client address share one rate-limit bucket. | Documented: pass `clientAddress` as the second argument. |
| 4 | Catastrophic backtracking in the e-mail, telephone and date patterns. | The local part and domain labels are unambiguous; inputs are length-limited before matching. Test runs 200 validations of hostile strings within a time bound. |
| 5 | Prototype pollution through JSON (`__proto__`), YAML, the CLI `--lang` spread, the component `value` setter. | Rejected or ignored in each path; tests check that `Object.prototype` is not polluted. |
| 6 | Trojan Source / hidden text in the official data or in code. | Hygiene test scans every tracked text file; the official data stores no-break spaces as escapes. |
| 7 | A pull request adding `innerHTML`, `eval`, `new Function`, `child_process` or a dynamic import of a variable to library code. | Lint rules and a source scan test fail; the only dynamic import is the constant `'yaml'`. |
| 8 | A pull request adding a runtime dependency or an install script. | Hygiene test requires no `dependencies`, exact dev versions, and no install hooks. |
| 9 | A pull request turning CI on for pushes or schedules, or using unpinned actions. | Hygiene test checks the workflow triggers, read-only permissions and SHA-pinned actions. |
| 10 | Symlink race on CLI output. | The final component is opened with `O_EXCL \| O_NOFOLLOW`; `--force` replaces by rename. Remaining risk: a local attacker who can write to the working directory could swap a parent directory between the check and the write. Documented as out of scope (the working directory is trusted). |
| 11 | Hanging `deliver` function holding connections. | Integrator code; noted for integrators to add a timeout in their transport. |
| 12 | Hash collision or forged record. | SHA-256 over canonical JSON; the hash is not a signature (documented). Anyone can make a new valid record; integrity only shows that a given record was not changed. |

No further findings.

## Coordinator review (8 Nov 2026)

| # | Severity | Finding | Status |
|---|---|---|---|
| C1 | High | `createRepairFormHandler` started without any access check when `token` was unset. The origin check stops browsers only, so any other client could forge `Origin` and make the repairer's server send e-mail with its own text to any address, from the repairer's domain. | Fixed: the handler refuses to start without `authorize` (new: the integrator's own check, run before the body is read, only `true` passes) or `token`. Both apply when both are set. The Express example now has a staff sign-in, and the Fetch example reads `FIXFORM_TOKEN`. Tests cover start-up refusal, unread body on refusal, truthy non-boolean results, both checks together, and a throwing check. |
| C2 | Low | The README said the integrity hash "proves that a record did not change". Anyone can recompute it for changed data. | Fixed: it now says the hash detects accidental change, is not a signature, and that the sent e-mail is the evidence. |
| C3 | Low | LICENSE appendix filled in. The other repos keep the Apache-2.0 text verbatim; the copyright line is in NOTICE and the file headers. | Fixed: verbatim text restored. |

Checked with no finding:
- no HTML sinks in the component;
- the escaping helpers;
- the renderers emit no links and carry a CSP with a style hash;
- the request body is capped while streaming and decoded as strict UTF-8;
- exact body keys;
- error responses carry codes only;
- the rate limiter is created once per handler;
- the hand-written SHA-256 is used for IDs and integrity only (no secrets) and is tested against NIST vectors and `node:crypto`.

The 30-day count follows Regulation 1182/71 Art. 3, and the roll-forward past a weekend or holiday only lengthens the period: kept as the default.

## Independent review (8 Nov 2026)

A fresh review that did not rely on this file or the README: the code, the
tests and the official texts were checked directly.

### Law, checked against the Official Journal

- Article 4 read in the EUR-Lex HTML (CELEX 32024L1799): "may provide"
  (4(1)), durable medium, reasonable time, before the consumer is bound;
  free of charge (4(2)); diagnostic costs (4(3)) and recital 12; points
  (a) to (k) (4(4)); 30 calendar days, longer by agreement, binding on
  acceptance (4(5)); deemed compliance (4(6)). Article 2(12), 7(2), 7(6)(c),
  16 and 22(1) as cited in the README were also checked. The README
  presents the form as optional and claims nothing beyond the text.
- Corrigenda checked on EUR-Lex: 32024L1799R(01) (OJ L 2024/90789) and
  R(03) (OJ L 2026/90848) in EN, DE, FR, LT and PL, and R(02) (OJ L
  2025/90841), which exists in Italian only; R(02) and R(04) do not exist in
  the other 23 languages. All renumber points in Articles 17 and 18; none
  touches Article 4 or Annex I. Delegated Directive (EU) 2026/74 changes
  Annex II only. Council Decision (EU) 2025/1407 (Bulgaria, euro from
  1 January 2026) confirmed.
- Annex I: all 24 language versions were downloaded from EUR-Lex and
  compared with `data/annex-i.json` by a separate script written for this
  review (whole-annex text comparison, not the repository's extractor). All
  24 match verbatim, including no-break spaces. The Yes/No/None words were
  checked in the hints of every language; read by eye in EN, DE, FR, LT,
  PL, FI, HR, NL, SK and SL.
- Period of validity: Regulation 1182/71 Article 3(1), 3(2)(b), 3(3) and
  3(4) are applied correctly. Checked by hand: month end (30 Jan + 30 =
  1 Mar 2026; 29 Feb 2028), a Saturday end rolled to Monday, a run of
  listed holidays plus a weekend, the DST starts and ends in Vilnius,
  Helsinki and Paris (including a period ending on the 25-hour day),
  Honolulu and Chatham (+12:45/+13:45). Counting in the repairer's time
  zone is a documented choice; national law decides.

### Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| I1 | Medium | Invisible Unicode format characters other than the listed bidi/zero-width ones were accepted in form text and e-mail headers: tag characters U+E0000-E007F (a hidden second text, "ASCII smuggling"), the soft hyphen, U+180E, Arabic number signs, noncharacters. | Fixed: every `\p{Cf}` character and noncharacters are rejected in validation and in e-mail header text; tests added. |
| I2 | Low | Display names and subjects made only of atom characters were written raw even when they looked like an RFC 2047 encoded word (`=?UTF-8?B?...?=`); mail clients would decode them and show other text. | Fixed: such text is always encoded; test added. |
| I3 | Low | `maxBodyBytes: NaN` (or Infinity) silently removed the body limit, and a NaN `rateLimit.windowMs` never reset the window. | Fixed: both are checked at start-up (positive whole numbers); `Retry-After` now follows the configured window; tests added. |
| I4 | Low | When `onProvided` threw after the e-mail was sent, the answer was a generic 500, inviting a retry that would send the consumer a second, different form. | Fixed: `500 { error: "provided_not_recorded", id, integrity }`; documented in the README and TSDoc; test added. |
| I5 | Low | Four security controls could be removed without a failing test: the pre-normalisation length check, verification in `renderHtmlFragment`, strict UTF-8 decoding of request bodies, and `Connection: close` after refusing a request with an unread body. | Fixed: a test for each; each now fails when its control is removed. |
| I6 | Low (usability) | The "consumer informed on" date field (YYYY-MM-DD) asked phones for a numeric keypad, which has no "-". | Fixed: no `inputmode`; test added. |
| I7 | Info | README said no other open source tool for the form existed; this cannot be verified. | Fixed: sentence removed. |
| I8 | Info | Three controls cannot be shown by a deterministic removal test: `O_EXCL` on CLI output (it only matters in a race after the `lstat` check), the explicit `assertRecord` at the start of `renderRepairFormEmail` (the HTML rendering it calls verifies the same record) and the 64-character limit on time-zone names (the runtime rejects such names anyway). | Open, accepted: checked by reading the code. |
| I9 | Info | Verification recomputes the period with the runtime's time-zone database; a later tzdata change for the dates of an old record would make it fail verification. | Open, accepted: rare, and failing closed is the safe direction. |

Checked with no finding:
- Money: amounts are decimal strings with at most two decimals (none for
  ISK beyond zeros), so "1.200" or "1,500" typed in the component is
  refused, never read as 1.20 or 1.50. Separators per language are fixed.
- Records: renderers and the component render the record rebuilt from the
  validated data, so a record that verifies cannot render anything other
  than what was hashed (translated interface strings aside). Canonical JSON
  matches RFC 8785 for the value types used. Form IDs are 80 bits of the
  hash in Crockford base32.
- The hand-written SHA-256 and base64 match `node:crypto` and `Buffer` on
  6,000 random inputs of 0-299 bytes (every length around 55, 56 and 64)
  and on inputs up to 1 MiB plus 55 bytes.
- No catastrophic backtracking in the e-mail, mailbox, telephone, date and
  time-zone patterns (hostile inputs of 200-320 characters run in well
  under a millisecond after warm-up).
- Markdown output rendered with markdown-it (`linkify` and `html` on):
  no links, images, HTML, lists, quotes, tables or extra headings from
  hostile data.
- Handler: method, rate limit, origin, access check, content type, body
  limits, exact body keys, server clock for "provided at", error codes only.
- CI: `pull_request` and `workflow_dispatch` only (release on a published
  release), `contents: read`, `persist-credentials: false`, and all pinned
  action SHAs resolve to the tags named in the comments.
- Component in Chromium at 320 px in DE, FI and HU, view and fill mode with
  all errors shown: no horizontal scrolling; keyboard Tab order follows the
  form; arrow keys switch the price type; Space toggles the diagnostic box.
- Hygiene: no tracked file contains the two forbidden tool names; no raw
  bidi, zero-width, BOM, soft hyphen or tag characters; commits only by
  the configured user without trailers. NOTICE, CLA, TRADEMARKS and the
  README Enterprise section are present.
- 65 security controls were removed one at a time: 62 now make a test fail
  (58 did before this review, the other 4 are I5); the remaining 3 are I8.
- README quick start run from `npm pack` in an empty directory: install,
  `validate`, `render --format text`, `render --out` (mode 0600),
  `--format json` then `verify` and `render` of the record, `languages`,
  and imports from every entry point.
