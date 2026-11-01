#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 4 "Book it": your booking pieces, then the same pieces live on the local Demo EMR (a real booking and a race).
import path from 'node:path';
import { check, attempt, finish, needStack, send, sample, fhirSearch, KIT } from './lib.mjs';
const B = await import('../labs/lab4/booking.mjs');
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 4 check (synthetic data only)\n');
const thu = new Date(2026, 9, 29, 10, 15); // Thursday 29 Oct 2026, 10:15 local
const same = (d, y, m, day, h, mi) => d instanceof Date && d.getFullYear() === y && d.getMonth() === m && d.getDate() === day && d.getHours() === h && d.getMinutes() === mi;
await attempt('parseWhen("monday morning") on a Thursday -> next Monday 00:00-12:00', () => { const w = B.parseWhen('book SYN-100001 with Dr. Rivera monday morning', thu); return same(w.from, 2026, 10, 2, 0, 0) && same(w.to, 2026, 10, 2, 12, 0); });
await attempt('parseWhen("thursday afternoon") on a Thursday -> NEXT Thursday 12:00-23:59', () => { const w = B.parseWhen('thursday afternoon', thu); return same(w.from, 2026, 10, 5, 12, 0) && same(w.to, 2026, 10, 5, 23, 59); });
await attempt('parseWhen("2026-11-03") -> that whole day; "tomorrow" -> Friday', () => { const a = B.parseWhen('on 2026-11-03', thu), b = B.parseWhen('tomorrow', thu); return same(a.from, 2026, 10, 3, 0, 0) && same(a.to, 2026, 10, 3, 23, 59) && b.from.getDate() === 30; });
await attempt('parseWhen with no day -> now .. now + 14 days', () => { const w = B.parseWhen('book SYN-100001 with Dr. Lee', thu); return w.from.getTime() === thu.getTime() && Math.round((w.to - w.from) / 86400000) === 14; });
const S = (id, start, status = 'free') => ({ resourceType: 'Slot', id, status, start, end: start, meta: { versionId: '3' } });
await attempt('pickSlots: free only, not in the past, soonest first', () => { const r = B.pickSlots([S('c', '2026-10-30T10:00:00-04:00'), S('a', '2026-10-29T09:00:00-04:00'), S('b', '2026-10-29T13:00:00-04:00'), S('x', '2026-10-29T14:00:00-04:00', 'busy')], thu); return r.map(s => s.id).join(',') === 'b,c'; });
await attempt('bookingBundle: POST Appointment + PUT Slot busy with If-Match W/"3"', () => { const b = B.bookingBundle(S('s1', '2026-10-30T10:00:00-04:00'), { resourceType: 'Appointment', status: 'booked' }); const [a, s] = b.entry || []; return b.type === 'transaction' && a?.request?.method === 'POST' && a.resource.slot?.[0]?.reference === 'Slot/s1' && s?.request?.method === 'PUT' && s.request.url === 'Slot/s1' && s.request.ifMatch === 'W/"3"' && s.resource.status === 'busy'; });
if (await needStack('Lab 4 live')){
  const E = p => import(path.join(KIT, 'engine', p)); const { fhirClient } = await E('lib/fhir.mjs'); const L = await E('lib/scheduling.mjs');
  const fhir = fhirClient(); process.env.AH_QUIET = '1';
  await send(sample('adt-a01.hl7')); await L.seed(fhir);
  const patient = await L.findPatient(fhir, 'SYN-100001'), prac = await L.findPractitioner(fhir, { key: 'D9002' }); const now = new Date();
  const appt = (s, reason) => ({ resourceType: 'Appointment', status: 'booked', description: reason, start: s.start, end: s.end,
    participant: [{ actor: { reference: 'Patient/' + patient.id }, status: 'accepted' }, { actor: { reference: 'Practitioner/' + prac.practitioner.id }, status: 'accepted' }] });
  const next = async () => B.pickSlots(await L.freeSlots(fhir, prac.schedule, now, new Date(now.getTime() + 7 * 86400000)), now)[0];
  await attempt('your bookingBundle books a free Slot on the local EMR; the Slot is now busy', async () => {
    const s = await next(); if (!s) return { ok: false, detail: 'no free Slot: run node engine/agents.mjs seed' };
    await fhir.transaction(B.bookingBundle(s, appt(s, 'Lab 4 booking'))); const after = await fhir.get('Slot/' + s.id); return { ok: after.status === 'busy', detail: 'Slot/' + s.id + ' ' + after.status }; });
  await attempt('race: two bookings of the same Slot at the same moment -> exactly one wins, the other gets 409/412', async () => {
    const s = await next(); if (!s) return { ok: false, detail: 'no free Slot: run node engine/agents.mjs seed' };
    const r = await Promise.allSettled(['A', 'B'].map(x => fhir.transaction(B.bookingBundle(s, appt(s, 'Race test ' + x)))));
    const won = r.filter(x => x.status === 'fulfilled').length, lost = r.filter(x => x.status === 'rejected' && [409, 412].includes(x.reason?.status)).length;
    return { ok: won === 1 && lost === 1, detail: `${won} booked, ${lost} rejected with 409/412` }; });
  await attempt('SIU for an appointment the EMR never saw -> AE 204', async () => { const r = await send('MSH|^~\\&|ACKHARBOR_SCHED|ACKHARBOR|ACKHARBOR_ENGINE|ACKHARBOR|20261031090000||SIU^S12^SIU_S12|SYNSIU0000404|P|2.5.1\rSCH|SYN-APT-NOTREAL^ACKHARBOR\rPID|1||SYN-100001^^^ACKHARBOR^MR||SAMPLE^AVERY\r'); return { ok: r.code === 'AE' && r.err?.code === '204', detail: 'got ' + r.code + ' ' + (r.err?.code || '') }; });
}
finish('check-m4');
