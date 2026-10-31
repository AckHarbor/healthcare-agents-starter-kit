#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Send an HL7 v2 file over MLLP and print the ACK. Usage: node send.mjs samples/adt-a01.hl7 [--explain]
import fs from 'node:fs'; import { sendMllp } from './lib/engine.mjs'; import { parse } from './lib/hl7.mjs'; import { explainAck } from './lib/support.mjs';
const file = process.argv[2]; if (!file){ console.error('usage: node send.mjs <file.hl7> [--explain]'); process.exit(2); }
const ack = await sendMllp(fs.readFileSync(file, 'utf8'));
console.log(ack.replace(/\r/g, '\n').trim()); const code = parse(ack).get('MSA-1');
if (process.argv.includes('--explain') || code !== 'AA') console.log('\n' + explainAck(ack));
process.exitCode = code === 'AA' ? 0 : 1;
