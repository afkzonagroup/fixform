/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renders the form as an e-mail message (RFC 5322, MIME), ready to hand to
 * any mail transport. Fixform does not send mail; you pass the message to
 * your own SMTP client or e-mail API.
 *
 * Article 4(1) of Directive (EU) 2024/1799 requires the form to be provided
 * "on a durable medium". Article 2(12) refers to Article 2(11) of Directive
 * (EU) 2019/771: "any instrument which enables the consumer or the seller to
 * store information addressed personally to that person in a way that is
 * accessible for future reference, for a period of time adequate for the
 * purposes of the information, and which allows the unchanged reproduction of
 * the information stored". An e-mail sent to the consumer, with the form as a
 * self-contained HTML attachment, is a common way to do this. Whether a
 * particular channel qualifies is a legal question for you to check.
 *
 * Header injection is impossible: every header value is checked for line
 * breaks and control characters, and non-ASCII text is encoded (RFC 2047).
 *
 * @packageDocumentation
 */

import { annexText } from '../annex/index.js';
import { assertRecord } from '../core/record.js';
import { parseInstant } from '../core/time.js';
import type { RepairFormRecord } from '../core/types.js';
import { toBase64, utf8 } from '../core/sha256.js';
import { renderHtml } from '../render/html.js';
import { renderText } from '../render/text.js';

export interface EmailOptions {
  readonly record: RepairFormRecord;
  /** Sender: "shop@example.com" or "Repair Shop <shop@example.com>". */
  readonly from: string;
  /** Recipient (the consumer): "jane@example.com" or "Jane Doe <jane@example.com>". */
  readonly to: string;
  /** Subject. Default: the official form title followed by the form ID. */
  readonly subject?: string;
  /** Value of the Date header. Default: the time the form was provided. */
  readonly date?: Date;
  /** Attach the form as a self-contained HTML file. Default `true`. */
  readonly attachHtml?: boolean;
}

export interface RenderedEmail {
  /** The complete message with CRLF line endings. */
  readonly raw: string;
  /** Bare address of the recipient, for the SMTP envelope. */
  readonly envelopeTo: string;
  /** Bare address of the sender, for the SMTP envelope. */
  readonly envelopeFrom: string;
  /** File name of the HTML attachment. */
  readonly attachmentName: string;
}

const ADDR_SPEC =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
// Controls (including CR and LF), invisible format characters (Unicode Cf: bidirectional controls,
// zero-width characters, tag characters), separators, lone surrogates and noncharacters.
// eslint-disable-next-line no-control-regex -- this pattern exists to find and reject control characters.
const UNSAFE_HEADER_TEXT = /[\u{0}-\u{1F}\u{7F}-\u{9F}\u{2028}\u{2029}]|\p{Cf}|\p{Cs}|\p{Noncharacter_Code_Point}/u;

interface Mailbox {
  readonly address: string;
  readonly header: string;
}

/** Parses "addr" or "Display Name <addr>". Throws `TypeError` for anything else. */
export function parseMailbox(value: string, what: string): Mailbox {
  if (value.length > 320 || UNSAFE_HEADER_TEXT.test(value)) throw new TypeError(`${what}: invalid characters`);
  const m = /^\s*(?:(.*?)\s*<([^<>\s]+)>|([^<>\s]+))\s*$/u.exec(value);
  const address = m?.[2] ?? m?.[3];
  if (!m || address === undefined || address.length > 254 || !ADDR_SPEC.test(address) || (address.split('@')[0] ?? '').length > 64) {
    throw new TypeError(`${what}: not an e-mail address`);
  }
  const name = (m[1] ?? '').trim();
  if (name === '') return { address, header: address };
  if (name.length > 128) throw new TypeError(`${what}: display name too long`);
  return { address, header: `${encodeHeaderText(name)} <${address}>` };
}

const ATOM_TEXT = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~ -]+$/u;

/**
 * RFC 2047 "B" encoded words, split on character boundaries, each at most 75
 * characters long. Plain ASCII words are written as they are, unless they
 * contain "=?": a mail client would decode such text as an encoded word and
 * show something else than what was given.
 */
export function encodeHeaderText(text: string): string {
  if (ATOM_TEXT.test(text) && text.length <= 60 && !text.includes('=?')) return text;
  const words: string[] = [];
  let chunk = '';
  for (const ch of text) {
    // 45 bytes of UTF-8 become 60 base64 characters; with "=?UTF-8?B?" and "?=" that is 72.
    if (utf8(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk !== '') words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${toBase64(utf8(w))}?=`).join('\r\n ');
}

function base64Lines(text: string): string {
  const b64 = toBase64(utf8(text));
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
  return out.join('\r\n');
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** RFC 5322 date-time in UTC, for example "Mon, 09 Nov 2026 08:15:00 +0000". */
export function rfc5322Date(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${DAYS[date.getUTCDay()] ?? ''}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

/**
 * Renders the e-mail that provides the form to the consumer. The output is
 * deterministic: the same record and options give the same bytes.
 *
 * @example
 * ```ts
 * const email = renderRepairFormEmail({ record, from: 'Repair Shop <shop@example.com>', to: 'jane@example.com' });
 * await transport.send({ from: email.envelopeFrom, to: email.envelopeTo, raw: email.raw });
 * ```
 */
export function renderRepairFormEmail(options: EmailOptions): RenderedEmail {
  const record = assertRecord(options.record);
  const from = parseMailbox(options.from, 'from');
  const to = parseMailbox(options.to, 'to');
  const subject = options.subject ?? `${annexText(record.form.language).formTitle} ${record.id}`;
  if (subject.length > 250 || UNSAFE_HEADER_TEXT.test(subject)) throw new TypeError('subject: invalid characters or too long');
  const date = options.date ?? new Date(parseInstant(record.form.validity.providedAt) ?? 0);
  if (Number.isNaN(date.getTime())) throw new TypeError('date: invalid date');
  const domain = from.address.slice(from.address.lastIndexOf('@') + 1);
  const token = record.integrity.slice('sha256-'.length, 'sha256-'.length + 24);
  const mixed = `fixform-mixed-${token}`;
  const alternative = `fixform-alt-${token}`;
  const attachmentName = `european-repair-information-form-${record.id}.html`;
  const html = renderHtml(record);
  const text = renderText(record);
  const attach = options.attachHtml !== false;

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${alternative}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${alternative}--`,
  ];
  const headers = [
    `From: ${from.header}`,
    `To: ${to.header}`,
    `Subject: ${encodeHeaderText(subject)}`,
    `Date: ${rfc5322Date(date)}`,
    `Message-ID: <${record.id}.${token}@${domain}>`,
    `Content-Language: ${record.form.language}`,
    'MIME-Version: 1.0',
  ];
  const body = attach
    ? [
        `Content-Type: multipart/mixed; boundary="${mixed}"`,
        '',
        `--${mixed}`,
        ...alternativePart,
        `--${mixed}`,
        `Content-Type: text/html; charset=utf-8; name="${attachmentName}"`,
        `Content-Disposition: attachment; filename="${attachmentName}"`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(html),
        `--${mixed}--`,
      ]
    : alternativePart;
  return { raw: `${[...headers, ...body].join('\r\n')}\r\n`, envelopeTo: to.address, envelopeFrom: from.address, attachmentName };
}
