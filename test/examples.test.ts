/**
 * Runs the examples for real: the Express e-mail example in Chromium (fill
 * in the form, create it, check the rendered e-mail in the outbox), and the
 * Fetch example. Requires `npm run build`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyRepairForm } from '../src/index.js';

const OUTBOX = new URL('../examples/express-email/outbox/', import.meta.url).pathname;
let child: ChildProcess;
let base: string;
let browser: Browser;
const STAFF_PASSWORD = 'example-test-password-1';
const STAFF_AUTH = `Basic ${Buffer.from(`staff:${STAFF_PASSWORD}`).toString('base64')}`;

async function freePort(): Promise<number> {
  return await new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const address = s.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      s.close(() => { resolve(port); });
    });
  });
}

beforeAll(async () => {
  rmSync(OUTBOX, { recursive: true, force: true });
  const port = await freePort();
  base = `http://localhost:${String(port)}`;
  child = spawn(process.execPath, ['examples/express-email/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), FIXFORM_ORIGIN: base, FIXFORM_STAFF_PASSWORD: STAFF_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Fixform example')) resolve();
    });
    child.on('exit', (code) => { reject(new Error(`example exited with ${String(code)}`)); });
  });
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser.close();
  child.kill();
  rmSync(OUTBOX, { recursive: true, force: true });
});

describe('Express e-mail example', () => {
  it('a staff member fills in the form; the consumer e-mail is rendered to the outbox', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, httpCredentials: { username: 'staff', password: STAFF_PASSWORD } });
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(base);
    const form = page.locator('repair-form');
    await form.locator('#f-identity').fill('Example Repairs Ltd');
    await form.locator('#f-address').fill('1 Example Street, Vilnius');
    await form.locator('#f-telephone').fill('+370 600 00000');
    await form.locator('#f-email').fill('repairs@example.com');
    await form.locator('#f-good').fill('Coffee machine');
    await form.locator('#f-defect').fill('Leaks water');
    await form.locator('#f-repairType').fill('Replace the seal');
    await form.locator('#f-priceAmount').fill('49,90');
    await form.locator('#f-completionDays').fill('4');
    await form.locator('#f-replacement-no').check();
    await form.locator('#f-handOverPlace').fill('At the shop');
    await page.locator('#consumer-email').fill('jane@example.org');
    await form.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('status')?.textContent.startsWith('Form FX-') === true);
    const status = (await page.locator('#status').textContent()) ?? '';
    expect(status).toMatch(/^Form FX-[0-9A-Z-]+ sent\. Valid until the end of \d{4}-\d{2}-\d{2}\.$/u);
    expect(errors).toEqual([]);
    const files = readdirSync(OUTBOX);
    const json = files.find((f) => f.endsWith('.json'));
    const eml = files.find((f) => f.endsWith('.eml'));
    expect(json && eml).toBeTruthy();
    const record = JSON.parse(readFileSync(`${OUTBOX}${json ?? ''}`, 'utf8')) as unknown;
    const verified = verifyRepairForm(record);
    expect(verified.ok).toBe(true);
    expect(verified.ok && verified.record.form.price).toEqual({ type: 'fixed', total: { amount: '49.90', currency: 'EUR' } });
    const raw = readFileSync(`${OUTBOX}${eml ?? ''}`, 'utf8');
    expect(raw).toContain('To: jane@example.org');
    expect(raw).toContain('From: Example Repairs <repairs@example.com>');
    await page.close();
  });

  it('requires the staff sign-in for the page and the handler', async () => {
    expect((await fetch(base)).status).toBe(401);
    const r = await fetch(`${base}/repair-forms`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    const wrong = `Basic ${Buffer.from('staff:wrong').toString('base64')}`;
    expect((await fetch(base, { headers: { authorization: wrong } })).status).toBe(401);
  });

  it('rejects cross-site requests and serves security headers', async () => {
    const r = await fetch(`${base}/repair-forms`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', authorization: STAFF_AUTH }, body: '{}' });
    expect(r.status).toBe(403);
    const page = await fetch(base, { headers: { authorization: STAFF_AUTH } });
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(page.headers.get('x-powered-by')).toBeNull();
    expect((await fetch(`${base}/fixform/../package.json`, { headers: { authorization: STAFF_AUTH } })).status).toBe(404);
  });
});

describe('Fetch example', () => {
  it('exports a fetch handler', async () => {
    process.env.FIXFORM_TOKEN = 'fetch-example-token-0123456789';
    const workerUrl = new URL('../examples/fetch/worker.mjs', import.meta.url).href;
    const worker = (await import(/* @vite-ignore */ workerUrl)) as { default: { fetch: (r: Request) => Promise<Response> } };
    const response = await worker.default.fetch(new Request('https://repairs.example.com/forms', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(response.status).toBe(403);
  });
});
