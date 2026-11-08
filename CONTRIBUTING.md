# Contributing

Thank you for helping. Please read this first.

## Before you start

- Every pull request needs a signed [Contributor Licence Agreement](CLA.md).
  Sign it in your first pull request as described there. We cannot merge
  without it.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security problems privately, never in a public issue. See
  [SECURITY.md](SECURITY.md).

## Ground rules

- **Law first.** Anything that implements a legal requirement must cite the
  article and paragraph and link the official text on EUR-Lex. Do not rely on
  blogs or summaries for what the law says.
- **Official wording is verbatim.** `src/annex/data.ts` and
  `data/annex-i.json` are generated from the Official Journal by
  `scripts/annex-eurlex.mjs`. Do not edit them by hand. If you think a text
  is wrong, open an issue with the EUR-Lex link and the exact sentence. Run
  `npm run annex:verify` to compare every language with EUR-Lex.
- **Translations.** Interface strings in `src/i18n/messages.ts` are working
  translations, not official text. Native speakers are very welcome to
  improve them. Say which language you are a native speaker of in the pull
  request.
- **No runtime dependencies** without discussion in an issue first.
- **No telemetry**, no network calls that the user did not configure.

## Development

Requirements: Node.js 22 or newer, npm.

```sh
npm ci
npm run browsers   # once: Chromium headless shell for the browser tests
npm run check      # typecheck + lint + build + tests with coverage
```

`npm run check` must pass. Rules the linter and tests enforce:

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any`, no `@ts-ignore`. An `eslint-disable` needs a written reason on
  the same line.
- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function`.
- No raw invisible or special space characters in code: write `\u{a0}`.

Every rule and every security control needs a test that fails if the rule or
control is removed.

## Pull requests

- Keep them small and focused. One topic per pull request.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Describe what you changed and why, and how you tested it.
- Do not include personal data in tests, fixtures or screenshots.
