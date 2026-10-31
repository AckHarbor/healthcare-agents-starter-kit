#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 2 "Map it": your mapping rules (labs/lab2/mappers.mjs) + idempotent ADT and the order -> result chain on the local EMR.
import { check, attempt, skip, finish, needStack, send, sample, fhirSearch } from './lib.mjs';
const M = await import('../labs/lab2/mappers.mjs');
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 2 check (synthetic data only)\n');
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { if (e.code === 'TODO') throw e; return e.code === code; } };
await attempt('hl7DateToFhir: 19850214 -> 1985-02-14, 198502 -> 1985-02, empty -> undefined', () => M.hl7DateToFhir('19850214') === '1985-02-14' && M.hl7DateToFhir('198502') === '1985-02' && M.hl7DateToFhir('') === undefined);
await attempt('hl7DateToFhir: "14/02/1985" throws code 102', () => throwsCode(() => M.hl7DateToFhir('14/02/1985'), '102'));
await attempt('mapGender: M/F/U/A and empty', () => M.mapGender('M') === 'male' && M.mapGender('f') === 'female' && M.mapGender('U') === 'unknown' && M.mapGender('A') === 'other' && M.mapGender('') === undefined);
await attempt('mapGender: "X" throws code 103', () => throwsCode(() => M.mapGender('X'), '103'));
await attempt('mapPatientClass: I -> IMP, E -> EMER, O -> AMB, P -> PRENC', () => { const c = M.mapPatientClass('E'); return c.code === 'EMER' && /v3-ActCode$/.test(c.system) && M.mapPatientClass('I').code === 'IMP' && M.mapPatientClass('O').code === 'AMB' && M.mapPatientClass('P').code === 'PRENC'; });
await attempt('mapPatientClass: "Z" throws code 103', () => throwsCode(() => M.mapPatientClass('Z'), '103'));
await attempt('obxValue: NM 182 mg/dL -> valueQuantity 182 (UCUM)', () => { const v = M.obxValue('NM', '182', 'mg/dL'); return v.valueQuantity?.value === 182 && v.valueQuantity.unit === 'mg/dL' && v.valueQuantity.system === 'http://unitsofmeasure.org'; });
await attempt('obxValue: NM "high" throws 102; ST "positive" -> valueString', () => throwsCode(() => M.obxValue('NM', 'high', 'mg/dL'), '102') && M.obxValue('ST', 'positive').valueString === 'positive');
await attempt('interpretation: H -> High, LL -> Critical low, empty -> undefined', () => M.interpretation('H')?.display === 'High' && M.interpretation('LL')?.code === 'LL' && M.interpretation('') === undefined);
if (await needStack('Lab 2 live')){
  const mrnQ = 'Patient?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:mrn|SYN-100001');
  await attempt('Re-sending the A01 twice still leaves exactly 1 Patient (idempotent)', async () => { const a = await send(sample('adt-a01.hl7')); const b = await send(sample('adt-a01.hl7')); const p = await fhirSearch(mrnQ); return { ok: a.code === 'AA' && b.code === 'AA' && p.length === 1, detail: `ACKs ${a.code}/${b.code}, ${p.length} Patient(s)` }; });
  await attempt('ORM^O01 -> ServiceRequest SYN-ORD-7001 (AA)', async () => { const r = await send(sample('orm-o01.hl7')); const sr = await fhirSearch('ServiceRequest?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:placer-order|SYN-ORD-7001')); return { ok: r.code === 'AA' && sr.length === 1, detail: r.code + ', ' + sr.length + ' ServiceRequest' }; });
  await attempt('ORU^R01 -> DiagnosticReport SYN-LAB-9001 basedOn the ServiceRequest', async () => { const r = await send(sample('oru-r01.hl7')); const [dr] = await fhirSearch('DiagnosticReport?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:filler-order|SYN-LAB-9001')); return { ok: r.code === 'AA' && /^ServiceRequest\//.test(dr?.basedOn?.[0]?.reference || '') && dr.result?.length === 2, detail: r.code + (dr ? ', basedOn ' + (dr.basedOn?.[0]?.reference || 'missing') + ', ' + (dr.result || []).length + ' results' : ', no report') }; });
  await attempt('Glucose 182 mg/dL is flagged H', async () => { const [o] = await fhirSearch('Observation?identifier=' + encodeURIComponent('urn:ackharbor:sandbox:filler-order|SYN-LAB-9001-1')); return { ok: o?.valueQuantity?.value === 182 && o.interpretation?.[0]?.coding?.[0]?.code === 'H', detail: o ? o.valueQuantity?.value + ' ' + (o.interpretation?.[0]?.coding?.[0]?.code || 'no flag') : 'not found' }; });
}
finish('check-m2');
