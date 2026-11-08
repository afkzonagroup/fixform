/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adapter from the Fetch API handler to Node.js `http` and Express.
 *
 * Express 4 and 5 request and response objects are Node.js `IncomingMessage`
 * and `ServerResponse` objects, so the same listener works as an Express
 * route handler. Do not put a body parser (such as `express.json()`) in
 * front of it: the handler reads and limits the body itself.
 *
 * @packageDocumentation
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { RepairFormHandler } from './index.js';

export interface NodeAdapterOptions {
  /**
   * Returns the client address used for rate limiting. Default: the socket's
   * remote address. Behind a reverse proxy, return the address your proxy
   * sets, and only if you trust that proxy.
   */
  readonly clientAddress?: (req: IncomingMessage) => string | undefined;
}

/** Wraps a Fetch API handler as a Node.js request listener / Express route handler. */
export function toNodeListener(handler: RepairFormHandler, options: NodeAdapterOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) for (const v of value) headers.append(name, v);
      }
      const method = req.method ?? 'GET';
      const hasBody = method !== 'GET' && method !== 'HEAD';
      // The host part is fixed: the handler never uses the URL, and the Host header is not trusted.
      const request = new Request(new URL(req.url ?? '/', 'http://localhost'), {
        method,
        headers,
        ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
      } as RequestInit);
      const response = await handler(request, { clientAddress: options.clientAddress ? options.clientAddress(req) : req.socket.remoteAddress });
      res.statusCode = response.status;
      response.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });
      const payload = Buffer.from(await response.arrayBuffer());
      // A rejected request may leave an unread body: close the connection after the response
      // is written instead of reading the rest.
      if (!req.complete) {
        res.setHeader('Connection', 'close');
        res.on('finish', () => req.destroy());
      }
      res.end(payload);
    })().catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      res.end('{"error":"internal_error"}');
    });
  };
}
