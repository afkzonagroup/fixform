# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
open the repository's **Security** tab and choose **Report a vulnerability**.
Do not open a public issue. If you cannot use GitHub, e-mail
info@afkzonagroup.lt with "Fixform security" in the subject.

We confirm receipt within three working days, agree a fix and disclosure date
with you, and credit you unless you prefer otherwise.

Supported versions: the latest minor release.

## Threat model

### Assets

- **The form as provided.** The repairer is bound by its conditions for at
  least 30 days (Article 4(5) of Directive (EU) 2024/1799). A changed or
  forged form, or a form that shows something other than its data, harms the
  consumer or the repairer.
- **The record and its integrity hash.** Evidence of what was provided.
- **The consumer's e-mail address.** Personal data, used only as the
  recipient of the e-mail. It is not part of the record.
- **The repairer's identity and contact data.** May be personal data when the
  repairer is a sole trader.
- **The pages that embed the component and the server that runs the
  handler.**
- **The files the CLI reads and writes.**

### Actors

- Repairers and their staff who fill in forms (trusted to enter their own
  data, but their input is still validated: a staff account can be
  compromised, and data is often pasted from other systems).
- Consumers who receive the form.
- Anonymous internet clients, including bots, and malicious third-party
  websites visited by staff (cross-site requests).
- Developers who integrate Fixform (trusted).
- Contributors (trusted after review; see supply chain).

### Trust boundaries

1. Untrusted data to the library: everything passed to
   `validateRepairForm`, `createRepairForm`, `verifyRepairForm` and the
   component's `value` and `record` properties.
2. Browser to server: every request header and body reaching the handler.
3. Library to output formats: HTML, Markdown, plain text, e-mail headers and
   bodies.
4. CLI to the file system: input paths and output paths given on the
   command line.
5. Server to mail transport: the rendered message leaves the system through
   the integrator's `deliver` function.

### Threats and mitigations

| Threat | Mitigation | Where |
|---|---|---|
| Script injection through form data (stored XSS in the HTML document, the component or e-mail). | All text is escaped for its output format (HTML: `& < > " '`). The component builds DOM with `createElement` and `textContent` only; no HTML strings anywhere in the library (lint rule and test). The HTML document has no scripts and a CSP `default-src 'none'` that allows only its own style element by hash. | `src/render/escape.ts`, `html.ts`, `src/component/repair-form.ts`, `test/render.test.ts`, `test/browser.test.ts` |
| Markdown injection: links, images, HTML or formatting from data. | Every ASCII punctuation character that can start Markdown syntax is backslash-escaped, including `<`, `&` and `:` (no autolinks). | `escapeMarkdown`, `test/render.test.ts` |
| Hidden or reordered text (Trojan Source style) in a binding document. | Validation rejects C0/C1 controls, DEL, every invisible format character (Unicode Cf: bidirectional controls and isolates, zero-width characters, BOM, soft hyphen, tag characters), line/paragraph separators, lone surrogates and noncharacters. A repository test rejects such characters in tracked files. | `src/core/validate.ts`, `test/hygiene.test.ts` |
| Prototype pollution through crafted JSON or YAML (`__proto__`, `constructor`, `prototype`). | The validator reads only own properties of plain objects, rejects those keys and unknown keys, copies into null-prototype objects and builds fresh output objects. The component's `value` setter reads own properties only. YAML is parsed with the core schema, unique keys and no aliases. | `validate.ts`, `repair-form.ts`, `src/cli/cli.ts`, tests |
| Oversized input (memory or CPU exhaustion). | Length and count limits on every field (checked before normalisation for very long strings); at most 100 reported errors; handler body limit (64 KiB default) checked against `Content-Length` and while streaming; CLI input limit 256 KiB checked on the open file and while reading; YAML alias expansion disabled. | `LIMITS`, `src/server/index.ts`, `src/cli/files.ts` |
| A changed record shown or sent as if genuine. | Records carry a SHA-256 over canonical JSON. Every renderer and the e-mail builder verify the record (valid, normalised data; recomputed period of validity; matching ID and hash) before output. | `src/core/record.ts` |
| Cross-site request forgery: another site makes a staff browser create and send a form. | `Origin` must be in `allowedOrigins`; without `Origin`, `Sec-Fetch-Site: same-origin` is required. Only `application/json` is accepted, which HTML forms cannot send and which forces a CORS preflight; the handler sends no CORS headers. | `src/server/index.ts` |
| Non-browser clients sending forged `Origin` or `Sec-Fetch-Site` headers. | The origin check protects browsers against cross-site requests; it is not authentication. The required access check (`authorize` or `token`) keeps other clients out. | README, `createRepairFormHandler` |
| Unauthorised use of the endpoint, including using it to send e-mail from the repairer's domain to any address. | The handler refuses to start without an access check: `authorize` (the integrator's own check, run before the body is read; only `true` passes) or a bearer `token` (constant-time comparison, minimum length 16), or both. | `createRepairFormHandler`, `constantTimeEqual` |
| Flooding: many requests or many e-mails. | Rate limit per client before the body is read (default 30 per minute); IPv6 clients counted per /64; one limiter per handler instance; bounded memory (new keys refused when the table is full of live entries). Hook for an external limiter. | `RateLimiter`, `clientRateLimitKey` |
| Client sets the "provided at" time to extend or shorten the period of validity. | The handler sets the time from the server clock and rejects requests that contain `validity.providedAt`. | `createRepairFormHandler`, `ValidateOptions.providedAt` |
| E-mail header injection (adding recipients, spoofing headers). | Addresses must be a single addr-spec with an optional display name; CR, LF and other controls are rejected in every header value; non-ASCII text is RFC 2047 encoded; bodies are base64. | `src/email/index.ts` |
| Information leaks in errors. | Responses carry only an error code (and field paths and codes for invalid forms). No stack traces, no messages from `deliver` or `onProvided`. Nothing is logged. | `src/server/index.ts`, `src/server/node.ts` |
| Missing browser protections on responses. | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`. | `SECURITY_HEADERS` |
| CLI path traversal or symlink attacks when writing output. | Output must resolve (after resolving the parent directory's symbolic links) inside the working directory. New files are created with `O_CREAT \| O_EXCL \| O_NOFOLLOW` and mode 0600. An existing file is replaced only with `--force`, only if it is a regular file, by writing a new file and renaming it over the old one (a planted link is replaced, never followed). | `src/cli/files.ts` |
| CLI reading devices, FIFOs or huge files. | Input is opened non-blocking and must be a regular file within the size limit; invalid UTF-8 is rejected. | `readInputFile` |
| Code execution through input. | No `eval`, `new Function`, `child_process` or dynamic import of user input. The only dynamic import is the constant module name `yaml`. Checked by lint and a test. | `test/hygiene.test.ts` |
| Malicious dependency or build change (supply chain). | Zero runtime dependencies; exact versions and a committed lockfile; `npm audit --omit=dev` in CI; no install scripts; a `files` allow-list; CI with pinned action SHAs and read-only permissions; releases with npm provenance. | `package.json`, `.github/workflows` |

### Content Security Policy

The web component needs no inline script or style. It works under:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'
```

(`connect-src` only if your page posts the form data.) This is tested in
Chromium, including that styles from the constructable stylesheet apply and
that no CSP violation is reported.

The standalone HTML document carries its own policy:
`default-src 'none'; style-src 'sha256-...'; base-uri 'none'; form-action 'none'`.

### Data flows and personal data

- The library and the CLI work locally. They make no network requests and
  collect no telemetry.
- The server handler receives the form data and the consumer's e-mail
  address, renders the message and passes it to your `deliver` function. It
  stores nothing. If you pass `onProvided`, you decide what to keep; the
  record contains the repairer's data and the form, not the consumer's
  address.
- The web component never sends data. Your page decides where the submitted
  data goes.

### What is out of scope

- Delivery of the e-mail, the security of your mail transport, and storage
  of records are your responsibility.
- The working directory of the CLI is trusted. A local attacker who can
  write to it could swap a parent directory between the path check and the
  write; the final path component is never followed if it is a link.
- A `deliver` function without a timeout can hold connections open; give
  your transport a timeout.
- The integrity hash is not a digital signature. Anyone can compute a valid
  hash for a new record. Use your own signing or timestamping service if you
  need non-repudiation.
