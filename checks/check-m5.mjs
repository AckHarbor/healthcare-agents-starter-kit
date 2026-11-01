#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 5 "Clinic in a box": your clinic rules, then the same rules against the local mock payer and the local Demo EMR.
import path from 'node:path'; import fs from 'node:fs';
import { check, attempt, finish, needStack, send, sample, fhirSearch, KIT } from './lib.mjs';
const C = await import('../labs/lab5/clinic-rules.mjs');
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 5 check (synthetic data only)\n');
const active = { resourceType: 'MedicationRequest', id: '42', meta: { versionId: '1' }, status: 'active', intent: 'order', subject: { reference: 'Patient/7' }, medicationCodeableConcept: { text: 'Lisinopril 10 MG Oral Tablet' }, dosageInstruction: [{ text: 'Take 1 tablet by mouth once daily' }] };
await attempt('refillDraft: status draft, priorPrescription -> the active order, no copied id', () => { const r = C.refillDraft(active); return r.status === 'draft' && r.intent === 'order' && r.priorPrescription?.reference === 'MedicationRequest/42' && !r.id && r.subject?.reference === 'Patient/7' && /approv/i.test(JSON.stringify(r.note || '')); });
await attempt('readEligibility: EB*1 -> active; AAA*Y**75*C -> not active, reject 75', () => { const a = C.readEligibility('ST*271*0001~EB*1*IND*30**GOLD PPO (SYNTHETIC)~SE*3*0001~'), b = C.readEligibility('ST*271*0001~AAA*Y**75*C~SE*3*0001~'); return a.active === true && a.reject === null && b.active === false && b.reject?.code === '75'; });
await attempt('followUpWindow: discharge Sat 31 Oct 15:00 -> Sun 1 Nov 00:00 .. Sun 8 Nov 00:00', () => { const w = C.followUpWindow(new Date(2026, 9, 31, 15, 0).toISOString()); return w.from.getDate() === 1 && w.from.getMonth() === 10 && w.from.getHours() === 0 && Math.round((w.to - w.from) / 86400000) === 7; });
await attempt('priorAuthDraft: Claim draft, use preauthorization, focal coverage', () => { const c = C.priorAuthDraft({ patientRef: 'Patient/7', coverageRef: 'Coverage/9', referralRef: 'ServiceRequest/5' }); return c.resourceType === 'Claim' && c.status === 'draft' && c.use === 'preauthorization' && c.insurance?.[0]?.focal === true && c.insurance[0].coverage?.reference === 'Coverage/9'; });
await attempt('canRunWithoutHuman: only book-slot and log-would-send', () => ['book-slot', 'log-would-send'].every(C.canRunWithoutHuman) && !['activate-refill', 'submit-prior-auth', 'send-sms', 'change-coverage'].some(C.canRunWithoutHuman));
const P = await import(path.join(KIT, 'engine', 'agents/clinic.mjs'));
const synth = (member) => [{ resourceType: 'Patient', name: [{ family: 'SAMPLE', given: ['AVERY'] }], birthDate: '1985-02-14' }, { subscriberId: member, payor: [{ display: 'Sandbox Health Plan', identifier: { value: 'SYNPAYER1' } }] }];
await attempt('your readEligibility reads the local mock payer: SYN-MBR-55501 active; unknown member -> reject 75', () => {
  const ok = C.readEligibility(P.mockPayer271(P.build270(...synth('SYN-MBR-55501')))), bad = C.readEligibility(P.mockPayer271(P.build270(...synth('XYZ123'))));
  return ok.active === true && !ok.reject && bad.active === false && bad.reject?.code === '75'; });
if (await needStack('Lab 5 live')){
  const E = p => import(path.join(KIT, 'engine', p)); const { fhirClient } = await E('lib/fhir.mjs'); const L = await E('lib/scheduling.mjs');
  const fhir = fhirClient(); process.env.AH_QUIET = '1'; await send(sample('adt-a01.hl7'));
  const create = async r => { const b = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: r.resourceType }, resource: r }] }); return fhir.get(b.entry[0].response.location.replace(/\/_history.*/, '')); };
  await attempt('your refillDraft is stored by the local EMR as a draft MedicationRequest for clinician review', async () => {
    const p = await L.findPatient(fhir, 'SYN-100001'); const tag = { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] };
    const act = await create({ resourceType: 'MedicationRequest', meta: tag, status: 'active', intent: 'order', subject: { reference: 'Patient/' + p.id }, medicationCodeableConcept: { text: 'Lisinopril 10 MG Oral Tablet' }, dosageInstruction: [{ text: 'Take 1 tablet by mouth once daily' }] });
    const d = await create({ ...C.refillDraft(act), meta: tag }); return { ok: d.status === 'draft' && d.priorPrescription?.reference === 'MedicationRequest/' + act.id, detail: 'MedicationRequest/' + d.id + ' ' + d.status }; });
  await attempt('A03 for a visit the EMR never saw -> AE 204', async () => { const r = await send(sample('adt-a03.hl7').replace(/SYN-V-500001/g, 'SYN-V-599999').replace('SYNA03000001', 'SYNA03000999')); return { ok: r.code === 'AE' && r.err?.code === '204', detail: 'got ' + r.code + ' ' + (r.err?.code || '') }; });
}
finish('check-m5');
