// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Writes data/repair-form.schema.json from the schema object in the library.
// Run: npm run schema:write. A test checks that the file is up to date.

import { writeFileSync } from 'node:fs';

const { REPAIR_FORM_SCHEMA } = await import('../dist/core/schema.js');
writeFileSync(new URL('../data/repair-form.schema.json', import.meta.url), `${JSON.stringify(REPAIR_FORM_SCHEMA, null, 2)}\n`);
console.log('wrote data/repair-form.schema.json');
