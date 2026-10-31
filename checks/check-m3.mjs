#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 3 "NACK detective": your ACK rules + the engine's real answers to broken messages + your fixed copies.
import fs from 'node:fs'; import path from 'node:path';
import { check, attempt, skip, finish, needStack, send, read, KIT, engine } from './lib.mjs';
const R = await import('../labs/lab3/ack-rules.mjs');
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 3 check (synthetic data only)\n');
const eq = (p, ack, code) => { const r = R.ackFor(p); return r && r.ack === ack && (code ? r.code === code : !r.code); };
await attempt('ackFor: ok -> AA; required-missing -> AE 101; data-type -> AE 102; bad-code -> AE 103', () => eq({ kind: 'ok' }, 'AA') && eq({ kind: 'required-missing' }, 'AE', '101') && eq({ kind: 'data-type' }, 'AE', '102') && eq({ kind: 'bad-code' }, 'AE', '103'));
await attempt('ackFor: unsupported-type -> AR 200; unsupported-event -> AR 201; unknown-key -> AE 204; server-down -> AE 207', () => eq({ kind: 'unsupported-type' }, 'AR', '200') && eq({ kind: 'unsupported-event' }, 'AR', '201') && eq({ kind: 'unknown-key' }, 'AE', '204') && eq({ kind: 'server-down' }, 'AE', '207'));
await attempt('errSegment builds ERR||PID^1^3|101^Required field missing^HL70357|E||||...', () => R.errSegment('101', 'PID^1^3', 'PID-3 is empty') === 'ERR||PID^1^3|101^Required field missing^HL70357|E||||PID-3 is empty');
await attempt('errSegment escapes | and ^ in the diagnostic', () => R.errSegment('102', 'OBX^1^5', 'value a|b^c').endsWith('value a\\F\\b\\S\\c'));
await attempt('shouldCallServer: never for mapping/table/routing errors', () => R.shouldCallServer({ kind: 'ok' }) === true && R.shouldCallServer({ kind: 'required-missing' }) === false && R.shouldCallServer({ kind: 'bad-code' }) === false && R.shouldCallServer({ kind: 'unsupported-type' }) === false);
// Server down: run the engine logic in-process against a port where nothing listens (does not touch your HAPI).
await attempt('HAPI unreachable -> AE with ERR 207 (sender should retry)', async () => { const E = await engine(); const { fhirClient } = await import(path.join(KIT, 'engine/lib/fhir.mjs')); const ack = await E.handleMessage(read('engine/samples/adt-a01.hl7'), { fhir: fhirClient('http://127.0.0.1:9/fhir', { timeoutMs: 3000 }) }); const a = E.parse(ack); return { ok: a.get('MSA-1') === 'AE' && a.get('ERR-3.1') === '207', detail: 'got ' + a.get('MSA-1') + ' ' + a.get('ERR-3.1') }; });
if (await needStack('Lab 3 live')){
  const expect = { 'adt-a01-missing-mrn.hl7': ['AE', '101', 'PID^1^3'], 'oru-r01-bad-value.hl7': ['AE', '102', 'OBX^1^5'], 'adt-a01-bad-gender.hl7': ['AE', '103', 'PID^1^8'], 'orm-o02-unsupported.hl7': ['AR', '200', 'MSH^1^9'] };
  for (const [f, [ack, code, loc]] of Object.entries(expect)) await attempt(`broken/${f} -> ${ack} + ERR|${loc}|${code}`, async () => { const r = await send(read('labs/lab3/broken/' + f)); return { ok: r.code === ack && r.err?.code === code && r.err?.loc === loc, detail: `got ${r.code} ${r.err ? r.err.loc + ' ' + r.err.code : '(no ERR)'}` }; });
  for (const f of ['adt-a01-missing-mrn.hl7', 'oru-r01-bad-value.hl7', 'adt-a01-bad-gender.hl7']){
    const p = path.join(KIT, 'labs/lab3/fixed', f); if (!fs.existsSync(p)) { skip(`fixed/${f} returns AA`, 'copy it from broken/ into labs/lab3/fixed/ and fix it'); continue; }
    const txt = fs.readFileSync(p, 'utf8'); const pid3 = ((txt.split(/\r|\n/).find(l => l.startsWith('PID')) || '').split('|')[3] || '').split('^')[0]; if (pid3 && !/^SYN-/.test(pid3)) { check(`fixed/${f} uses a SYN- MRN`, false, 'synthetic data only: PID-3 must start with SYN-'); continue; }
    await attempt(`fixed/${f} returns AA`, async () => { const r = await send(txt); return { ok: r.code === 'AA', detail: 'got ' + r.code + (r.err ? ' ' + r.err.loc + ' ' + r.err.code : '') }; });
  }
}
finish('check-m3');
