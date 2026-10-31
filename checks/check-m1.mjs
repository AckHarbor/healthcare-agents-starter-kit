#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 1 "First light": HAPI answers, the engine ACKs the sample admit with AA, and exactly one Patient exists for SYN-100001.
import { check, attempt, finish, needStack, send, sample, fhirSearch, FHIR_BASE } from './lib.mjs';
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 1 check (synthetic data only)\n');
if (await needStack('Lab 1')){
  check('FHIR server answers /metadata', true, FHIR_BASE + '/metadata');
  await attempt('ADT^A01 sample gets MSA|AA|SYNA01000001', async () => { const r = await send(sample('adt-a01.hl7')); return { ok: r.code === 'AA' && r.control === 'SYNA01000001', detail: 'got MSA|' + r.code + '|' + r.control }; });
  await attempt('Patient?identifier=...mrn|SYN-100001 returns exactly 1 Patient', async () => { const p = await fhirSearch('Patient?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:mrn|SYN-100001')); return { ok: p.length === 1, detail: p.length + ' found' }; });
  await attempt('Encounter SYN-V-500001 exists and is in-progress or finished', async () => { const e = await fhirSearch('Encounter?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:visit|SYN-V-500001')); return { ok: e.length === 1 && ['in-progress', 'finished'].includes(e[0].status), detail: e.length ? e[0].status : 'none' }; });
  await attempt('Patient carries the synthetic tag', async () => { const [p] = await fhirSearch('Patient?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:mrn|SYN-100001')); return { ok: !!p?.meta?.tag?.some(t => t.code === 'synthetic'), detail: '' }; });
}
finish('check-m1');
