/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A Fetch API request handler that creates a form, renders the e-mail that
 * provides it to the consumer, and hands the message to your mail transport.
 * Works in Node.js (through `./node`), Deno, Bun and edge runtimes.
 *
 * Controls, in the order they run:
 *
 * 1. method must be POST (405);
 * 2. rate limit per client, before the body is read (429);
 * 3. CSRF: the `Origin` header must be an allowed origin; without `Origin`,
 *    `Sec-Fetch-Site: same-origin` is required (403);
 * 4. optional bearer token, compared in constant time (401);
 * 5. `Content-Type` must be `application/json` (415);
 * 6. body size limit, enforced while streaming (413);
 * 7. JSON parsing and validation of every field (400, 422).
 *
 * Every response carries security headers and `Cache-Control: no-store`.
 * Errors never include stack traces or internal messages. Nothing is logged.
 *
 * @packageDocumentation
 */

import { createRepairForm, FixformValidationError } from '../core/record.js';
import type { RepairFormRecord } from '../core/types.js';
import type { Issue } from '../core/validate.js';
import { parseMailbox, renderRepairFormEmail, type RenderedEmail } from '../email/index.js';

export interface HandlerOptions {
  /** Origins allowed to call the handler, for example ["https://repairs.example.com"]. Required and not empty. */
  readonly allowedOrigins: readonly string[];
  /** Sender of the e-mail, for example "Repair Shop <forms@example.com>". */
  readonly from: string;
  /** Sends the rendered message. Fixform has no SMTP client: use your own transport. */
  readonly deliver: (message: RenderedEmail, record: RepairFormRecord) => Promise<void>;
  /**
   * Called after delivery succeeded, for example to store the record as
   * evidence. If it throws, the answer is `500 { error: 'provided_not_recorded', id, integrity }`:
   * the consumer already has the form, so do not send it again.
   */
  readonly onProvided?: (record: RepairFormRecord) => Promise<void>;
  /**
   * Shared secret for an `Authorization: Bearer` header, at least 16
   * characters. Read it from the environment; never hard-code it.
   */
  readonly token?: string | undefined;
  /**
   * Your own access check, for example that the request carries a staff
   * session. Return `false` to answer 401. Runs after the origin check and
   * before the body is read.
   *
   * The handler sends e-mail to an address taken from the request, so it
   * refuses to start unless `token` or `authorize` (or both) is set:
   * otherwise anyone could use your server to send mail from your domain.
   */
  readonly authorize?: ((request: Request) => boolean | Promise<boolean>) | undefined;
  /** Maximum request body in bytes. Default 64 KiB. */
  readonly maxBodyBytes?: number;
  /** Requests per client per window. Default 30 per minute. `false` disables the built-in limiter. */
  readonly rateLimit?: { readonly limit: number; readonly windowMs: number } | false;
  /** Extra rate-limit hook; return `false` to reject with 429. Runs after the built-in limiter. */
  readonly allowRequest?: (clientKey: string) => boolean | Promise<boolean>;
  /** Clock, for tests. Default `Date.now`. The time the form is provided is taken from this clock, never from the request. */
  readonly now?: () => number;
}

/** Information from the hosting server that a Fetch `Request` does not carry. */
export interface RequestContext {
  /** The client's IP address, used as the rate-limit key. */
  readonly clientAddress?: string | undefined;
}

export type RepairFormHandler = (request: Request, context?: RequestContext) => Promise<Response>;

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function json(status: number, body: unknown, extra: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

/** Compares two strings in time that depends only on their lengths. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const length = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < length; i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * Normalises a client address into a rate-limit key: IPv4-mapped IPv6
 * addresses count as IPv4, and IPv6 clients are counted per /64 network,
 * because one client usually controls a whole /64.
 */
export function clientRateLimitKey(address: string | undefined): string {
  if (address === undefined || address === '') return 'unknown';
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(lower);
  if (mapped?.[1] !== undefined) return mapped[1];
  if (!lower.includes(':')) return lower;
  const [head = '', tail = ''] = lower.split('::');
  const headParts = head === '' ? [] : head.split(':');
  const tailParts = tail === '' ? [] : tail.split(':');
  const missing = lower.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  const full = [...headParts, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailParts];
  return `${full
    .slice(0, 4)
    .map((p) => p.replace(/^0+(?=.)/u, ''))
    .join(':')}::/64`;
}

/** Fixed-window rate limiter. One instance per handler, so the limit applies across all requests. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records a hit and returns whether it is within the limit. */
  hit(key: string, now: number): boolean {
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      // If the table is still full of live entries, refuse new keys instead of growing without bound.
      if (this.hits.size >= this.maxKeys) return false;
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

class BodyTooLarge extends Error {}

async function readBody(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) throw new BodyTooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // fatal: invalid UTF-8 is rejected instead of being replaced.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function normaliseOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Creates the handler. Expects `POST` with a JSON body
 * `{ "form": <form input without validity.providedAt>, "consumerEmail": "..." }`.
 * Responds `201 { id, integrity, lastDay, endsAt }`.
 *
 * @example
 * ```ts
 * const handler = createRepairFormHandler({
 *   allowedOrigins: ['https://repairs.example.com'],
 *   from: 'Repair Shop <forms@example.com>',
 *   token: process.env.FIXFORM_TOKEN,
 *   deliver: async (message) => { await myMailer.sendRaw(message.envelopeFrom, message.envelopeTo, message.raw); },
 * });
 * ```
 */
export function createRepairFormHandler(options: HandlerOptions): RepairFormHandler {
  const origins = new Set(options.allowedOrigins.map((o) => normaliseOrigin(o)));
  if (origins.size === 0 || origins.has(null)) throw new TypeError('allowedOrigins must list at least one http(s) origin');
  if (options.token !== undefined && options.token.length < 16) throw new TypeError('token must be at least 16 characters');
  if (options.token === undefined && options.authorize === undefined) {
    throw new TypeError('createRepairFormHandler needs token or authorize: without an access check anyone could make your server send e-mail');
  }
  // Fail at start-up, not on the first request, if the sender address is wrong.
  parseMailbox(options.from, 'from');
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  // A NaN or infinite limit would make every size comparison false and silently remove the limit.
  if (!isPositiveInteger(maxBodyBytes)) throw new TypeError('maxBodyBytes must be a positive whole number');
  const now = options.now ?? Date.now;
  const rate = options.rateLimit === false ? null : { limit: options.rateLimit?.limit ?? 30, windowMs: options.rateLimit?.windowMs ?? 60_000 };
  if (rate && (!isPositiveInteger(rate.limit) || !isPositiveInteger(rate.windowMs))) throw new TypeError('rateLimit needs a positive whole limit and windowMs');
  const limiter = rate ? new RateLimiter(rate.limit, rate.windowMs) : null;
  const retryAfter = String(Math.ceil((rate?.windowMs ?? 60_000) / 1000));
  const expectedAuth = options.token === undefined ? undefined : `Bearer ${options.token}`;

  return async (request, context = {}) => {
    try {
      if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

      const key = clientRateLimitKey(context.clientAddress);
      if (limiter && !limiter.hit(key, now())) return json(429, { error: 'rate_limited' }, { 'Retry-After': retryAfter });
      if (options.allowRequest && !(await options.allowRequest(key))) return json(429, { error: 'rate_limited' }, { 'Retry-After': retryAfter });

      const origin = request.headers.get('origin');
      const site = request.headers.get('sec-fetch-site');
      const originOk = origin !== null ? origins.has(normaliseOrigin(origin)) : site === 'same-origin';
      if (!originOk) return json(403, { error: 'forbidden_origin' });

      if (expectedAuth !== undefined && !constantTimeEqual(request.headers.get('authorization') ?? '', expectedAuth)) {
        return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      }
      // Only `true` passes: a JavaScript caller returning a truthy value by mistake (a session object, 1) is refused.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
      if (options.authorize && (await options.authorize(request)) !== true) return json(401, { error: 'unauthorized' });

      const type = (request.headers.get('content-type') ?? '').toLowerCase().replace(/\s+/gu, '');
      if (type !== 'application/json' && type !== 'application/json;charset=utf-8') return json(415, { error: 'unsupported_media_type' });

      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(request, maxBodyBytes));
      } catch (error) {
        if (error instanceof BodyTooLarge) return json(413, { error: 'payload_too_large' });
        return json(400, { error: 'invalid_json' });
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return json(400, { error: 'invalid_body' });
      const keys = Object.keys(parsed).sort().join(',');
      if (keys !== 'consumerEmail,form') return json(400, { error: 'invalid_body' });
      const body = parsed as { form: unknown; consumerEmail: unknown };
      if (typeof body.consumerEmail !== 'string') return json(422, { error: 'invalid_form', issues: [{ path: 'consumerEmail', code: 'type' }] });
      try {
        parseMailbox(body.consumerEmail, 'to');
      } catch {
        return json(422, { error: 'invalid_form', issues: [{ path: 'consumerEmail', code: 'email' }] });
      }

      let record: RepairFormRecord;
      try {
        record = createRepairForm(body.form, { providedAt: new Date(now()).toISOString() });
      } catch (error) {
        if (error instanceof FixformValidationError) {
          return json(422, { error: 'invalid_form', issues: error.issues.map((i: Issue) => ({ path: i.path, code: i.code })) });
        }
        throw error;
      }
      const message = renderRepairFormEmail({ record, from: options.from, to: body.consumerEmail });
      try {
        await options.deliver(message, record);
      } catch {
        return json(502, { error: 'delivery_failed' });
      }
      if (options.onProvided) {
        try {
          await options.onProvided(record);
        } catch {
          // The e-mail has gone out: say so, so the caller does not retry and send a second, different form.
          return json(500, { error: 'provided_not_recorded', id: record.id, integrity: record.integrity });
        }
      }
      return json(201, { id: record.id, integrity: record.integrity, lastDay: record.validity.lastDay, endsAt: record.validity.endsAt });
    } catch {
      return json(500, { error: 'internal_error' });
    }
  };
}
