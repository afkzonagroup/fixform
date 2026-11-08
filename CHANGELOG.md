# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

### Added

- Official text of Annex I of Directive (EU) 2024/1799 (the European Repair
  Information Form) in all 24 official languages, verbatim from EUR-Lex, with
  source URLs and SHA-256 checksums, and a script that re-checks it.
- Typed form model, validation with allow-lists and limits, the 30-day
  period of validity computed in the repairer's time zone, diagnostic-cost
  check, deterministic form ID and integrity hash, record verification.
- Rendering to a self-contained HTML document, an HTML fragment, plain text
  and Markdown, with escaping for each format.
- JSON Schema of the form input.
- `<repair-form>` web component (view and fill), React and Vue wrappers.
- `fixform` CLI: render, validate, verify, languages, schema; JSON and
  optional YAML input; safe file output.
- E-mail rendering (MIME) for providing the form on a durable medium.
- Fetch API request handler with Node.js and Express adapter, and examples.
  The handler requires an access check (`authorize` or `token`).
