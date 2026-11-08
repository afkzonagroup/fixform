import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderedEmail } from '../src/email/index.js';
import type { RepairFormRecord } from '../src/index.js';
import { clientRateLimitKey, constantTimeEqual, createRepairFormHandler, RateLimiter, type HandlerOptions } from '../src/server/index.js';
import { toNodeListener } from '../src/server/node.js';
import { mutableInput } from './fixtures.js';

const ORIGIN = 'https://repairs.example.com';
const NOW = Date.UTC(2026, 10, 9, 8, 15);
const TOKEN = 'a-very-long-test-token-0123456789';

function formWithoutProvidedAt(): Record<string, unknown> {
  const input = mutableInput();
  Reflect.deleteProperty(input.validity, 'providedAt');
  return input;
}

function setup(overrides: Partial<HandlerOptions> = {}): { handler: ReturnType<typeof createRepairFormHandler>; sent: RenderedEmail[]; stored: RepairFormRecord[] } {
  const sent: RenderedEmail[] = [];
  const stored: RepairFormRecord[] = [];
  const handler = createRepairFormHandler({
    allowedOrigins: [ORIGIN],
    from: 'Example Repairs <repairs@example.com>',
    deliver: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
    onProvided: (record) => {
      stored.push(record);
      return Promise.resolve();
    },
    now: () => NOW,
    authorize: () => true,
    ...overrides,
  });
  return { handler, sent, stored };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://repairs.example.com/forms', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const goodBody = (): unknown => ({ form: formWithoutProvidedAt(), consumerEmail: 'Jane Doe <jane@example.org>' });

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
}

describe('createRepairFormHandler', () => {
  it('creates the form with the server clock, delivers the e-mail and stores the record', async () => {
    const { handler, sent, stored } = setup();
    const response = await handler(post(goodBody()), { clientAddress: '192.0.2.1' });
    expect(response.status).toBe(201);
    expectSecurityHeaders(response);
    const body = (await response.json()) as { id: string; integrity: string; lastDay: string; endsAt: string };
    expect(body.lastDay).toBe('2026-12-09');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.envelopeTo).toBe('jane@example.org');
    expect(stored[0]?.id).toBe(body.id);
    expect(stored[0]?.form.validity.providedAt).toBe('2026-11-09T08:15:00.000Z');
    // The consumer's address is not part of the form record (data minimisation).
    expect(JSON.stringify(stored[0])).not.toContain('jane@example.org');
  });

  it('405 for other methods', async () => {
    const { handler } = setup();
    const response = await handler(new Request('https://x/forms', { method: 'GET' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expectSecurityHeaders(response);
  });

  it('rate limit per client, shared across requests of one handler, before the body is read', async () => {
    const { handler } = setup({ rateLimit: { limit: 2, windowMs: 60_000 } });
    expect((await handler(post('{}'), { clientAddress: '192.0.2.1' })).status).toBe(400);
    expect((await handler(post('{}'), { clientAddress: '192.0.2.1' })).status).toBe(400);
    const limited = await handler(post('{}'), { clientAddress: '192.0.2.1' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await handler(post('{}'), { clientAddress: '192.0.2.2' })).status).toBe(400);
    // Same /64 network counts as one client.
    const v6 = setup({ rateLimit: { limit: 1, windowMs: 60_000 } }).handler;
    expect((await v6(post('{}'), { clientAddress: '2001:db8:1:2::1' })).status).toBe(400);
    expect((await v6(post('{}'), { clientAddress: '2001:db8:1:2:ffff::9' })).status).toBe(429);
    // Retry-After follows the configured window.
    const short = setup({ rateLimit: { limit: 1, windowMs: 4_500 } }).handler;
    await short(post('{}'), { clientAddress: '192.0.2.9' });
    expect((await short(post('{}'), { clientAddress: '192.0.2.9' })).headers.get('retry-after')).toBe('5');
  });

  it('custom rate-limit hook', async () => {
    const allowRequest = vi.fn(() => false);
    const { handler } = setup({ allowRequest, rateLimit: false });
    expect((await handler(post(goodBody()), { clientAddress: '192.0.2.1' })).status).toBe(429);
    expect(allowRequest).toHaveBeenCalledWith('192.0.2.1');
  });

  it('CSRF: rejects other origins and requests without Origin unless same-origin fetch metadata', async () => {
    const { handler, sent } = setup();
    expect((await handler(post(goodBody(), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(post(goodBody(), { origin: 'null' }))).status).toBe(403);
    const noOrigin = new Request('https://x/forms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(goodBody()) });
    expect((await handler(noOrigin)).status).toBe(403);
    const crossSite = new Request('https://x/forms', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify(goodBody()) });
    expect((await handler(crossSite)).status).toBe(403);
    const sameOrigin = new Request('https://x/forms', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(goodBody()) });
    expect((await handler(sameOrigin)).status).toBe(201);
    expect(sent).toHaveLength(1);
  });

  it('bearer token, compared in constant time', async () => {
    const { handler } = setup({ token: TOKEN });
    expect((await handler(post(goodBody()))).status).toBe(401);
    expect((await handler(post(goodBody(), { authorization: `Bearer ${TOKEN}x` }))).status).toBe(401);
    expect((await handler(post(goodBody(), { authorization: `bearer ${TOKEN}` }))).status).toBe(401);
    const ok = await handler(post(goodBody(), { authorization: `Bearer ${TOKEN}` }));
    expect(ok.status).toBe(201);
    expect(() => setup({ token: 'short' })).toThrow(TypeError);
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('415 unless the body is JSON', async () => {
    const { handler } = setup();
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/json-patch+json', 'application/json; charset=latin1']) {
      expect((await handler(post(goodBody(), { 'content-type': type }))).status, type).toBe(415);
    }
    expect((await handler(post(goodBody(), { 'content-type': 'Application/JSON; Charset=UTF-8' }))).status).toBe(201);
  });

  it('413 for bodies over the limit, by Content-Length and while streaming', async () => {
    const { handler } = setup({ maxBodyBytes: 100 });
    expect((await handler(post('x'.repeat(101)))).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64).fill(0x20));
      },
    });
    const streamed = new Request('https://x/forms', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    expect((await handler(streamed)).status).toBe(413);
    expect((await handler(post('{}', { 'content-length': 'abc' }))).status).toBe(413);
  });

  it('400 for invalid JSON, invalid UTF-8 and unexpected body fields', async () => {
    const { handler } = setup();
    expect((await handler(post('{nope'))).status).toBe(400);
    const latin1 = new Request('https://x/forms', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: new Uint8Array([0x7b, 0x22, 0xe9, 0x22, 0x7d]) });
    expect((await handler(latin1)).status).toBe(400);
    // Invalid UTF-8 inside an otherwise valid JSON body is refused, not replaced with U+FFFD.
    const prefix = new TextEncoder().encode('{"form":{},"consumerEmail":"jane');
    const suffix = new TextEncoder().encode('@example.org"}');
    const badUtf8 = new Request('https://x/forms', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: new Uint8Array([...prefix, 0xe9, ...suffix]) });
    expect((await handler(badUtf8)).status).toBe(400);
    expect((await handler(post('[]'))).status).toBe(400);
    expect((await handler(post({ ...(goodBody() as object), extra: 1 }))).status).toBe(400);
    expect((await handler(post({ form: {} }))).status).toBe(400);
  });

  it('422 with paths and codes only (no internal messages)', async () => {
    const { handler, sent } = setup();
    const bad = formWithoutProvidedAt();
    bad['good'] = '';
    const response = await handler(post({ form: bad, consumerEmail: 'jane@example.org' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid_form', issues: [{ path: 'good', code: 'empty' }] });
    const clientTime = mutableInput();
    const r2 = await handler(post({ form: clientTime, consumerEmail: 'jane@example.org' }));
    expect(await r2.json()).toEqual({ error: 'invalid_form', issues: [{ path: 'validity.providedAt', code: 'provided_at_set_by_caller' }] });
    const r3 = await handler(post({ form: formWithoutProvidedAt(), consumerEmail: 'jane@example.org\r\nBcc: x@y.z' }));
    expect(await r3.json()).toEqual({ error: 'invalid_form', issues: [{ path: 'consumerEmail', code: 'email' }] });
    const r4 = await handler(post({ form: formWithoutProvidedAt(), consumerEmail: 7 }));
    expect(r4.status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it('502 when delivery fails, 500 on unexpected errors, never leaking details', async () => {
    const failing = setup({ deliver: () => Promise.reject(new Error('SMTP password wrong: hunter2')) });
    const r1 = await failing.handler(post(goodBody()));
    expect(r1.status).toBe(502);
    const t1 = await r1.text();
    expect(t1).toBe('{"error":"delivery_failed"}');
    // Storing failed after the e-mail went out: a distinct answer, so the caller does not send a second form.
    const crashing = setup({ onProvided: () => Promise.reject(new Error('database at 10.0.0.5 down')) });
    const r2 = await crashing.handler(post(goodBody()));
    expect(r2.status).toBe(500);
    const t2 = await r2.text();
    expect(JSON.parse(t2)).toEqual({ error: 'provided_not_recorded', id: expect.stringMatching(/^FX-/u) as unknown, integrity: expect.stringMatching(/^sha256-/u) as unknown });
    expect(t2).not.toContain('10.0.0.5');
    expect(crashing.sent).toHaveLength(1);
    expectSecurityHeaders(r2);
    const broken = setup({ deliver: () => { throw new TypeError('sync failure'); } });
    expect((await broken.handler(post(goodBody()))).status).toBe(502);
  });

  it('checks its configuration at start-up', () => {
    expect(() => setup({ allowedOrigins: [] })).toThrow(TypeError);
    expect(() => setup({ allowedOrigins: ['javascript:alert(1)'] })).toThrow(TypeError);
    expect(() => setup({ allowedOrigins: ['not a url'] })).toThrow(TypeError);
    expect(() => setup({ from: 'nobody' })).toThrow(TypeError);
    // Without token or authorize anyone could make the server send e-mail: refuse to start.
    expect(() => setup({ authorize: undefined })).toThrow(/token or authorize/);
    expect(() => setup({ authorize: undefined, token: TOKEN })).not.toThrow();
    // A NaN or infinite body limit would disable the limit; a NaN window would never reset.
    for (const maxBodyBytes of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) expect(() => setup({ maxBodyBytes }), String(maxBodyBytes)).toThrow(/maxBodyBytes/);
    for (const rateLimit of [{ limit: Number.NaN, windowMs: 1000 }, { limit: 5, windowMs: Number.NaN }, { limit: 0, windowMs: 1000 }, { limit: 5, windowMs: Number.POSITIVE_INFINITY }]) {
      expect(() => setup({ rateLimit }), JSON.stringify(rateLimit)).toThrow(/rateLimit/);
    }
    expect(() => setup({ rateLimit: false, maxBodyBytes: 1024 })).not.toThrow();
  });

  it('authorize: own access check before the body is read; both checks apply when both are set', async () => {
    const seen: string[] = [];
    const { handler, sent } = setup({
      authorize: (request) => {
        seen.push(request.headers.get('cookie') ?? '');
        return Promise.resolve(request.headers.get('cookie') === 'staff=1');
      },
    });
    expect((await handler(post(goodBody()))).status).toBe(401);
    // A truthy value that is not `true` is not a yes.
    const loose = setup({ authorize: () => 1 as unknown as boolean });
    expect((await loose.handler(post(goodBody()))).status).toBe(401);
    // The body is not read before the check passes.
    const unread = post(goodBody());
    expect((await handler(unread)).status).toBe(401);
    expect(unread.bodyUsed).toBe(false);
    expect((await handler(post(goodBody(), { cookie: 'staff=1' }))).status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(seen).toContain('staff=1');
    const both = setup({ token: TOKEN, authorize: (request) => request.headers.get('cookie') === 'staff=1' });
    expect((await both.handler(post(goodBody(), { cookie: 'staff=1' }))).status).toBe(401);
    expect((await both.handler(post(goodBody(), { authorization: `Bearer ${TOKEN}` }))).status).toBe(401);
    expect((await both.handler(post(goodBody(), { cookie: 'staff=1', authorization: `Bearer ${TOKEN}` }))).status).toBe(201);
    // A throwing check answers 500 without details and sends nothing.
    const throwing = setup({ authorize: () => { throw new Error('session store down'); } });
    const res = await throwing.handler(post(goodBody()));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('session');
    expect(throwing.sent).toHaveLength(0);
  });
});

describe('rate-limit helpers', () => {
  it('client keys', () => {
    expect(clientRateLimitKey(undefined)).toBe('unknown');
    expect(clientRateLimitKey('')).toBe('unknown');
    expect(clientRateLimitKey('192.0.2.1')).toBe('192.0.2.1');
    expect(clientRateLimitKey('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(clientRateLimitKey('2001:DB8:0001:0002:0003::1')).toBe('2001:db8:1:2::/64');
    expect(clientRateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(clientRateLimitKey('::1')).toBe('0:0:0:0::/64');
  });

  it('fixed window and bounded memory', () => {
    const limiter = new RateLimiter(1, 1000, 2);
    expect(limiter.hit('a', 0)).toBe(true);
    expect(limiter.hit('a', 10)).toBe(false);
    expect(limiter.hit('a', 1000)).toBe(true);
    expect(limiter.hit('b', 1000)).toBe(true);
    // Table full of live entries: new keys are refused rather than growing the table.
    expect(limiter.hit('c', 1001)).toBe(false);
    // After the window, expired entries are pruned.
    expect(limiter.hit('c', 2500)).toBe(true);
  });
});

describe('Node http and Express adapter', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server) server.close(() => { resolve(); });
      else resolve();
    });
    server = undefined;
  });

  async function listen(app: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  }

  it('works as a Node request listener', async () => {
    const { handler, sent } = setup();
    const base = await listen(toNodeListener(handler));
    const response = await fetch(`${base}/forms`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(goodBody()) });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(sent).toHaveLength(1);
    const get = await fetch(`${base}/forms`);
    expect(get.status).toBe(405);
  });

  it('works as an Express route and enforces the body limit on the stream', async () => {
    const { handler, sent } = setup({ maxBodyBytes: 4096 });
    const app = express();
    app.disable('x-powered-by');
    app.post('/forms', toNodeListener(handler, { clientAddress: (req) => req.socket.remoteAddress }));
    const base = await listen(app);
    const ok = await fetch(`${base}/forms`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(goodBody()) });
    expect(ok.status).toBe(201);
    expect(sent).toHaveLength(1);
    const big = await fetch(`${base}/forms`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: 'x'.repeat(100_000) });
    expect(big.status).toBe(413);
    expect(await big.text()).toBe('{"error":"payload_too_large"}');
  });

  it('closes the connection after refusing a request whose body was not read', async () => {
    const { handler } = setup();
    const base = await listen(toNodeListener(handler));
    const { port } = new URL(base);
    const headers = await new Promise<Record<string, string | string[] | undefined>>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/forms', method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', 'content-length': '50000' } }, (res) => {
        res.resume();
        resolve(res.headers);
      });
      req.on('error', reject);
      // Send only part of the declared body: the refusal must not wait for the rest.
      req.write('x'.repeat(1000));
    });
    expect(headers['connection']).toBe('close');
  });

  it('answers 500 without details if the handler throws', async () => {
    const base = await listen(toNodeListener(() => Promise.reject(new Error('secret detail'))));
    const response = await fetch(`${base}/forms`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal_error"}');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
