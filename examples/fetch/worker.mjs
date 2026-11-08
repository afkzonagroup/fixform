// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Example: the same handler in a Fetch API runtime (Deno, Bun, edge workers).
// `deliver` posts the rendered message to your e-mail provider's raw-message API.

import { createRepairFormHandler } from '@afkzona/fixform/server';

const handler = createRepairFormHandler({
  allowedOrigins: ['https://repairs.example.com'],
  from: 'Example Repairs <repairs@example.com>',
  // Shared secret for your own back office, from the environment. Without it the handler refuses to start.
  token: process.env.FIXFORM_TOKEN,
  deliver: async (message) => {
    // Replace with your provider. Fixform itself never sends e-mail.
    // Do not log message.envelopeTo or the message: they contain personal data.
    console.log(`would send ${String(message.raw.length)} bytes`);
  },
});

export default {
  fetch: (request) => handler(request),
};
