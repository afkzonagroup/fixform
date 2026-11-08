import { describe, expect, it } from 'vitest';
import { encodeHeaderText, parseMailbox, renderRepairFormEmail, rfc5322Date } from '../src/email/index.js';
import { createRepairForm, renderHtml, renderText } from '../src/index.js';
import { validInput } from './fixtures.js';

const record = createRepairForm(validInput());

function headers(raw: string): string {
  return raw.slice(0, raw.indexOf('\r\n\r\n'));
}

function decodeParts(raw: string): string[] {
  return [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/gu)].map((m) => Buffer.from((m[1] ?? '').replace(/\r\n/gu, ''), 'base64').toString('utf8'));
}

describe('e-mail rendering', () => {
  it('builds a MIME message with text, HTML and an HTML attachment', () => {
    const email = renderRepairFormEmail({ record, from: 'Example Repairs <repairs@example.com>', to: 'Jane Doe <jane@example.org>' });
    const h = headers(email.raw);
    expect(h).toContain('From: Example Repairs <repairs@example.com>');
    expect(h).toContain('To: Jane Doe <jane@example.org>');
    expect(h).toContain(`Subject: EUROPEAN REPAIR INFORMATION FORM ${record.id}`);
    expect(h).toContain('Date: Mon, 09 Nov 2026 08:15:00 +0000');
    expect(h).toContain(`Message-ID: <${record.id}.`);
    expect(h).toContain('@example.com>');
    expect(h).toContain('MIME-Version: 1.0');
    expect(email.envelopeTo).toBe('jane@example.org');
    expect(email.envelopeFrom).toBe('repairs@example.com');
    expect(email.attachmentName).toBe(`european-repair-information-form-${record.id}.html`);
    const [text, html, attachment] = decodeParts(email.raw);
    expect(text).toBe(renderText(record));
    expect(html).toBe(renderHtml(record));
    expect(attachment).toBe(renderHtml(record));
    expect(email.raw).toContain(`Content-Disposition: attachment; filename="${email.attachmentName}"`);
  });

  it('uses CRLF only and keeps every line within 998 characters', () => {
    const { raw } = renderRepairFormEmail({ record, from: 'repairs@example.com', to: 'jane@example.org' });
    expect(raw.replace(/\r\n/gu, '')).not.toMatch(/[\r\n]/u);
    for (const line of raw.split('\r\n')) expect(line.length).toBeLessThanOrEqual(998);
  });

  it('can leave out the attachment', () => {
    const { raw } = renderRepairFormEmail({ record, from: 'repairs@example.com', to: 'jane@example.org', attachHtml: false });
    expect(raw).not.toContain('multipart/mixed');
    expect(raw).not.toContain('Content-Disposition');
    expect(decodeParts(raw)).toHaveLength(2);
  });

  it('is deterministic', () => {
    const a = renderRepairFormEmail({ record, from: 'repairs@example.com', to: 'jane@example.org' });
    const b = renderRepairFormEmail({ record, from: 'repairs@example.com', to: 'jane@example.org' });
    expect(a.raw).toBe(b.raw);
  });

  it('encodes non-ASCII headers (RFC 2047) in words of at most 75 characters', () => {
    const de = createRepairForm(validInput('de'));
    const { raw } = renderRepairFormEmail({ record: de, from: 'Taisykla Žalgiris <info@example.lt>', to: 'Jonas Jonaitis <jonas@example.lt>' });
    const h = headers(raw);
    expect(h).toMatch(/Subject: =\?UTF-8\?B\?/u);
    expect(h).toContain('From: =?UTF-8?B?');
    for (const word of h.match(/=\?UTF-8\?B\?[^?]*\?=/gu) ?? []) expect(word.length).toBeLessThanOrEqual(75);
    const subject = (h.match(/Subject: ((?:.*)(?:\r\n .*)*)/u)?.[1] ?? '')
      .split('\r\n ')
      .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?|\?=$/gu, ''), 'base64').toString('utf8'))
      .join('');
    expect(subject).toBe(`EUROPÄISCHES FORMULAR FÜR REPARATURINFORMATIONEN ${de.id}`);
    expect(encodeHeaderText('Plain name')).toBe('Plain name');
    expect(encodeHeaderText('a\u{1f527}'.repeat(30)).split('\r\n ').length).toBeGreaterThan(1);
  });

  it('rejects header injection in addresses, names and the subject', () => {
    const attempts = [
      { from: 'repairs@example.com\r\nBcc: victim@example.net', to: 'jane@example.org' },
      { from: 'repairs@example.com', to: 'jane@example.org\nBcc: victim@example.net' },
      { from: 'Evil\r\nBcc: x@y.z <repairs@example.com>', to: 'jane@example.org' },
      { from: 'repairs@example.com', to: 'jane@example.org', subject: 'Hi\r\nBcc: victim@example.net' },
      { from: 'repairs@example.com', to: 'Jane <jane@example.org>, other@example.net' },
      { from: 'repairs@example.com', to: 'not an address' },
      { from: 'repairs@example.com', to: 'a\u{202e}@example.org' },
      { from: 'repairs@example.com', to: `${'x'.repeat(300)}@example.org` },
      { from: 'repairs@example.com', to: 'jane@example.org', subject: 'x'.repeat(251) },
      { from: `${'N'.repeat(129)} <repairs@example.com>`, to: 'jane@example.org' },
      { from: 'Repairs \u{202e}moc.live <repairs@example.com>', to: 'jane@example.org' },
      { from: 'Repairs\u{7} <repairs@example.com>', to: 'jane@example.org' },
      { from: 'Repairs\u{85} <repairs@example.com>', to: 'jane@example.org' },
      { from: 'Repairs <repairs@example.com>', to: 'Jane\u{e0001}\u{e0078} <jane@example.org>' },
      { from: 'repairs@example.com', to: 'jane@example.org', subject: 'Form\u{ad}\u{e0020}' },
    ];
    for (const attempt of attempts) expect(() => renderRepairFormEmail({ record, ...attempt }), JSON.stringify(attempt)).toThrow(TypeError);
    expect(() => renderRepairFormEmail({ record, from: 'repairs@example.com', to: 'jane@example.org', date: new Date(Number.NaN) })).toThrow(TypeError);
  });

  it('refuses a tampered record', () => {
    expect(() => renderRepairFormEmail({ record: { ...record, id: 'FX-0000-0000-0000-0000' }, from: 'repairs@example.com', to: 'jane@example.org' })).toThrow(TypeError);
  });

  it('helpers', () => {
    expect(parseMailbox(' jane@example.org ', 'to')).toEqual({ address: 'jane@example.org', header: 'jane@example.org' });
    expect(parseMailbox('"Jane" <jane@example.org>', 'to').header).toMatch(/^=\?UTF-8\?B\?.+\?= <jane@example.org>$/u);
    expect(rfc5322Date(new Date(Date.UTC(2026, 0, 4, 3, 2, 1)))).toBe('Sun, 04 Jan 2026 03:02:01 +0000');
    // Text that looks like an encoded word is encoded, so clients show it literally instead of decoding it.
    const lookalike = '=?UTF-8?B?PGV2aWxAZXhhbXBsZS5uZXQ+?=';
    expect(encodeHeaderText(lookalike)).toBe(`=?UTF-8?B?${Buffer.from(lookalike).toString('base64')}?=`);
    expect(parseMailbox(`${lookalike} <jane@example.org>`, 'to').header).toBe(`=?UTF-8?B?${Buffer.from(lookalike).toString('base64')}?= <jane@example.org>`);
    expect(encodeHeaderText('Plain Name')).toBe('Plain Name');
  });
});
