/**
 * Real-browser tests of the web component and the HTML document, in
 * Playwright's bundled Chromium (headless shell), with axe-core for WCAG 2.1
 * A/AA checks. The page is served with a strict Content-Security-Policy.
 * Requires `npm run build` (the browser loads dist/) and `npm run browsers`.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, normalize } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepairForm, renderHtml } from '../src/index.js';
import { validInput } from './fixtures.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TYPES: Record<string, string> = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8' };

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixform test page</title><link rel="stylesheet" href="/page.css"></head>
<body><main><h1>Repair form test page</h1></main><script type="module" src="/page.js"></script></body>
</html>`;

const PAGE_CSS = 'body{margin:0;padding:0 16px;font-family:sans-serif;background:#fff;color:#111}';

function pageScript(): string {
  const fixture = JSON.stringify({ ...validInput(), good: '<img src=x onerror="window.__xss=1">' });
  return `import '/dist/component/define.js';
import { createRepairForm } from '/dist/index.js';
const params = new URLSearchParams(location.search);
window.__violations = [];
document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(e.violatedDirective + ' ' + e.blockedURI));
const el = document.createElement('repair-form');
el.setAttribute('lang', params.get('lang') || 'en');
if (params.get('mode') === 'fill') {
  el.setAttribute('mode', 'fill');
  el.setAttribute('time-zone', 'Europe/Vilnius');
  el.addEventListener('repair-form-submit', (e) => { window.__submitted = e.detail; });
} else {
  el.record = createRepairForm(${fixture});
}
document.querySelector('main').append(el);
window.__ready = true;
`;
}

let server: Server;
let base: string;
let browser: Browser;

beforeAll(async () => {
  const documentHtml = renderHtml(createRepairForm(validInput('lt')));
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string, csp = true): void => {
      res.writeHead(status, { 'Content-Type': type, ...(csp ? { 'Content-Security-Policy': CSP } : {}), 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    };
    if (url.pathname === '/') { send(200, TYPES['.html'] ?? '', PAGE); return; }
    if (url.pathname === '/page.js') { send(200, TYPES['.js'] ?? '', pageScript()); return; }
    if (url.pathname === '/page.css') { send(200, TYPES['.css'] ?? '', PAGE_CSS); return; }
    // The standalone document relies on its own CSP meta element, so no header here.
    if (url.pathname === '/document.html') { send(200, TYPES['.html'] ?? '', documentHtml, false); return; }
    const path = normalize(decodeURIComponent(url.pathname));
    if (path.startsWith('/dist/') && !path.includes('..') && extname(path) === '.js') {
      try {
        send(200, TYPES['.js'] ?? '', readFileSync(`${ROOT}${path.slice(1)}`, 'utf8')); return;
      } catch {
        send(404, 'text/plain', 'not found'); return;
      }
    }
    send(404, 'text/plain', 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
});

interface AxeViolation {
  id: string;
  impact: string;
  nodes: { target: unknown; failureSummary: string }[];
}

async function axe(page: Page): Promise<AxeViolation[]> {
  await page.evaluate(AXE);
  return await page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: AxeViolation[] }> } };
    const result = await w.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })) }));
  });
}

async function open(query: string, width: number): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`${base}/${query}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  return { page, errors };
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
}

describe('<repair-form> in Chromium under a strict CSP', () => {
  for (const width of [1280, 320]) {
    it(`view mode at ${String(width)} px: renders, no CSP violations, no XSS, WCAG 2.1 AA clean, no horizontal scroll`, async () => {
      const { page, errors } = await open('?mode=view', width);
      const rows = await page.locator('repair-form').locator('th[scope=row]').count();
      expect(rows).toBe(17);
      expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
      expect(errors).toEqual([]);
      // Styles from the constructable stylesheet are applied despite style-src 'self'.
      const bg = await page.locator('repair-form').locator('th').first().evaluate((th) => getComputedStyle(th).backgroundColor);
      expect(bg).toBe('rgb(242, 242, 242)');
      expect(await axe(page)).toEqual([]);
      await noHorizontalScroll(page);
      await page.close();
    });

    it(`fill mode at ${String(width)} px: WCAG 2.1 AA clean before and after errors, keyboard submit focuses the first error`, async () => {
      const { page, errors } = await open('?mode=fill&lang=de', width);
      expect(await axe(page)).toEqual([]);
      await noHorizontalScroll(page);
      const submit = page.locator('repair-form').locator('button[type=submit]');
      await submit.focus();
      await page.keyboard.press('Enter');
      const active = await page.evaluate(() => document.querySelector('repair-form')?.shadowRoot?.activeElement?.id);
      expect(active).toBe('f-identity');
      expect(await page.locator('repair-form').locator('[role=alert]').textContent()).toBe('Bitte korrigieren Sie die markierten Felder.');
      expect(await axe(page)).toEqual([]);
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
      await page.close();
    });
  }

  it('fill mode works with the keyboard only', async () => {
    const { page } = await open('?mode=fill', 1280);
    const host = page.locator('repair-form');
    await host.locator('#f-identity').focus();
    await page.keyboard.type('Example Repairs');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1 Example Street');
    await page.keyboard.press('Tab');
    await page.keyboard.type('+370 600 00000');
    await page.keyboard.press('Tab');
    await page.keyboard.type('repairs@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Kettle');
    expect(await host.locator('#f-good').inputValue()).toBe('Kettle');
    await host.locator('#f-replacement-yes').focus();
    await page.keyboard.press('Space');
    expect(await host.locator('#f-replacementCost').count()).toBe(1);
    await host.locator('#f-service-add').focus();
    await page.keyboard.press('Enter');
    const active = await page.evaluate(() => document.querySelector('repair-form')?.shadowRoot?.activeElement?.id);
    expect(active).toBe('f-service-0-description');
    await page.close();
  });
});

describe('every language at 320 px', () => {
  it('view and fill mode fit without horizontal scrolling in all 24 languages', async () => {
    const { LANGUAGES } = await import('../src/index.js');
    for (const lang of LANGUAGES) {
      for (const mode of ['view', 'fill']) {
        const { page, errors } = await open(`?mode=${mode}&lang=${lang}`, 320);
        const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(scroll, `${lang} ${mode}`).toBeLessThanOrEqual(client);
        expect(errors, `${lang} ${mode}`).toEqual([]);
        await page.close();
      }
    }
  }, 120_000);
});

describe('standalone HTML document in Chromium', () => {
  for (const width of [1280, 320]) {
    it(`at ${String(width)} px: its CSP allows its own style only, WCAG 2.1 AA clean, no horizontal scroll`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto(`${base}/document.html`);
      expect(errors).toEqual([]);
      expect(await page.locator('th').first().evaluate((th) => getComputedStyle(th).backgroundColor)).toBe('rgb(242, 242, 242)');
      expect(await page.locator('h1').textContent()).toBe('EUROPOS TAISYMO INFORMACIJOS FORMA');
      expect(await axe(page)).toEqual([]);
      await noHorizontalScroll(page);
      await page.close();
    });
  }
});
