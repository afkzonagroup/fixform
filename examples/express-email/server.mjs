// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Example: a repairer's staff page fills in the European Repair Information
// Form; the server creates the form, renders the e-mail that provides it to
// the consumer (the durable medium) and "sends" it by writing the .eml file
// to ./outbox. Replace `deliver` with your own mail transport.
//
// Run: npm run example   then open http://localhost:3000 and sign in as "staff"
// with the password printed at start-up (or set FIXFORM_STAFF_PASSWORD).
// The HTTP Basic sign-in stands in for your own staff login: replace it.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { createRepairFormHandler } from '@afkzona/fixform/server';
import { toNodeListener } from '@afkzona/fixform/node';

const port = Number(process.env.PORT ?? 3000);
const origin = process.env.FIXFORM_ORIGIN ?? `http://localhost:${String(port)}`;
const outbox = new URL('./outbox/', import.meta.url).pathname;
mkdirSync(outbox, { recursive: true, mode: 0o700 });

// Staff sign-in for the example. The handler sends e-mail to an address from the request,
// so it must never be reachable without an access check.
const staffPassword = process.env.FIXFORM_STAFF_PASSWORD ?? randomBytes(18).toString('base64url');
const expectedAuth = Buffer.from(`Basic ${Buffer.from(`staff:${staffPassword}`).toString('base64')}`);
const isStaff = (value) => {
  if (typeof value !== 'string') return false;
  const given = Buffer.from(value);
  return given.length === expectedAuth.length && timingSafeEqual(given, expectedAuth);
};

const handler = createRepairFormHandler({
  allowedOrigins: [origin],
  from: process.env.FIXFORM_FROM ?? 'Example Repairs <repairs@example.com>',
  authorize: (request) => isStaff(request.headers.get('authorization')),
  deliver: async (message) => {
    // Render only: write the message instead of sending it. Hand message.raw to your SMTP client or e-mail API.
    writeFileSync(join(outbox, `${message.attachmentName.replace(/\.html$/u, '')}.eml`), message.raw, { mode: 0o600 });
  },
  onProvided: async (record) => {
    // Keep the record as evidence of what was provided.
    writeFileSync(join(outbox, `${record.id}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  },
});

const securityHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set(securityHeaders);
  next();
});
app.use((req, res, next) => {
  if (isStaff(req.headers.authorization)) {
    next();
    return;
  }
  res.set('WWW-Authenticate', 'Basic realm="Fixform example", charset="UTF-8"').status(401).end();
});
// No body parser in front of the handler: it reads and limits the body itself.
app.post('/repair-forms', toNodeListener(handler));
app.use('/fixform', express.static(new URL('../../dist/', import.meta.url).pathname, { index: false, dotfiles: 'deny' }));
app.use(express.static(new URL('./public/', import.meta.url).pathname, { dotfiles: 'deny' }));

app.listen(port, '127.0.0.1', () => {
  console.log(`Fixform example on ${origin} (outbox: ${outbox})`);
  if (process.env.FIXFORM_STAFF_PASSWORD === undefined) console.log(`Sign in as "staff" with this run's password: ${staffPassword}`);
});
