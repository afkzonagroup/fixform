// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
// Removes the build output so deleted sources never linger in dist/.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
