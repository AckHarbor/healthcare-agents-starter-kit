// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Shared helpers for the AckHarbor(TM) Healthcare Agents Course lab checks. Local only (127.0.0.1), synthetic data only.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINE = path.join(KIT, 'engine');
export const FHIR_BASE = (process.env.AH_FHIR_BASE || 'http://127.0.0.1:8090/fhir').replace(/\/$/, '');
const results = [];
export function check(name, ok, detail = ''){ results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  - ' + detail : '')); return !!ok; }
export function skip(name, why){ results.push({ name, ok: null, detail: why }); console.log('SKIP ' + name + '  - ' + why); }
export async function attempt(name, fn){ try { const r = await fn(); return check(name, r === undefined ? true : r.ok ?? r, r && r.detail || ''); } catch (e) { return check(name, false, e.code === 'TODO' ? 'not done yet: ' + e.message : e.message); } }
export function finish(label){
  const failed = results.filter(r => r.ok === false).length, passed = results.filter(r => r.ok === true).length, skipped = results.filter(r => r.ok === null).length;
  console.log(`\n${label}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(failed || skipped ? `${label} NOT YET: fix the FAIL/SKIP lines above and run me again.` : `${label} PASS`);
  process.exitCode = failed || skipped ? 1 : 0; return !failed && !skipped;
}
export async function fhirUp(){ try { const r = await fetch(FHIR_BASE + '/metadata', { signal: AbortSignal.timeout(5000) }); return r.ok; } catch { return false; } }
export async function fhirSearch(q){ const r = await fetch(FHIR_BASE + '/' + q, { headers: { Accept: 'application/fhir+json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('FHIR GET ' + q.split('?')[0] + ' HTTP ' + r.status); const b = await r.json(); return (b.entry || []).map(e => e.resource); }
export const sample = f => fs.readFileSync(path.join(ENGINE, 'samples', f), 'utf8');
export const read = f => fs.readFileSync(path.isAbsolute(f) ? f : path.join(KIT, f), 'utf8');
export async function engine(){ return { ...(await import(path.join(ENGINE, 'lib/engine.mjs'))), ...(await import(path.join(ENGINE, 'lib/hl7.mjs'))) }; }
export async function send(text){ const E = await engine(); const ack = await E.sendMllp(text, { timeoutMs: 15000 }); const a = E.parse(ack); return { ack, code: a.get('MSA-1'), control: a.get('MSA-2'), text: a.get('MSA-3'), err: a.seg('ERR') ? { loc: a.get('ERR-2'), code: a.get('ERR-3.1') } : null }; }
export async function needStack(label){
  if (!(await fhirUp())) { skip(label + ': local FHIR server', `no answer at ${FHIR_BASE}/metadata. Start HAPI (see README step 2) and wait ~40 s`); return false; }
  try { await send('MSH|^~\\&|DEMOEHR|PENFORD_MC|ACKHARBOR_ENGINE|ACKHARBOR|20261031080000||ADT^A08^ADT_A01|SYNPING0001|P|2.5.1\rPID|1||SYN-999999^^^PENFORD^MR||PING^TEST\r'); }
  catch (e) { skip(label + ': engine on MLLP 127.0.0.1:' + (process.env.AH_MLLP_PORT || 2575), 'not reachable (' + e.message + '). Start it: cd engine && node server.mjs'); return false; }
  return true;
}
export class Todo extends Error { constructor(m){ super(m); this.code = 'TODO'; } }
