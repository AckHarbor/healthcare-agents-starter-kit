#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Runs every lab check in order and prints one line per lab.
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); let bad = 0;
for (const c of ['check-m1', 'check-m2', 'check-m3', 'check-m4', 'check-m5', 'check-m6', 'check-capstone']){
  const r = spawnSync(process.execPath, [path.join(here, c + '.mjs')], { encoding: 'utf8', env: { ...process.env, AH_QUIET: '1' } });
  const last = (r.stdout || '').trim().split('\n').pop(); if (r.status !== 0) bad++; console.log((r.status === 0 ? 'PASS ' : 'NOT YET ') + c + '  ' + last);
}
process.exitCode = bad ? 1 : 0;
