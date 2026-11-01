// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Scheduling building blocks: seed Practitioners/Schedules/free Slots, find patients, practitioners and free Slots, and build SIU messages.
// Booking and request parsing are built in Module 4 of the AckHarbor(TM) Healthcare Agents Course (labs/lab4/booking.mjs).
import { randomUUID } from 'node:crypto';
import { SYS } from './map.mjs'; import { courseOnly } from './course-only.mjs'; import { escape, hl7Now, newControlId, fhirToTs } from './hl7.mjs';

export const PRACTITIONERS = [ // synthetic staff
  { key: 'D9001', family: 'RIVERA', given: 'ALEX', specialty: ['419772000', 'Family practice'], label: 'Dr. Alex Rivera' },
  { key: 'D9002', family: 'LEE', given: 'MORGAN', specialty: ['394579002', 'Cardiology'], label: 'Dr. Morgan Lee' },
];
const tag = { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] };
const pad = n => String(n).padStart(2, '0');
export function localIso(d){ const o = -d.getTimezoneOffset(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${o >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; }
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Idempotent: conditional creates keyed on identifiers; existing (possibly busy) slots are never reset.
export async function seed(fhir, { days = 7, from = new Date() } = {}){
  const entries = [];
  for (const p of PRACTITIONERS){
    const pu = 'urn:uuid:' + randomUUID(), su = 'urn:uuid:' + randomUUID();
    entries.push({ fullUrl: pu, request: { method: 'POST', url: 'Practitioner', ifNoneExist: `identifier=${SYS.staff}|${p.key}` }, resource: { resourceType: 'Practitioner', meta: tag, identifier: [{ system: SYS.staff, value: p.key }], name: [{ family: p.family[0] + p.family.slice(1).toLowerCase(), given: [p.given[0] + p.given.slice(1).toLowerCase()], prefix: ['Dr.'] }] } });
    entries.push({ fullUrl: su, request: { method: 'POST', url: 'Schedule', ifNoneExist: `identifier=${SYS.staff}|SCHED-${p.key}` }, resource: { resourceType: 'Schedule', meta: tag, identifier: [{ system: SYS.staff, value: 'SCHED-' + p.key }], active: true, specialty: [{ coding: [{ system: 'http://snomed.info/sct', code: p.specialty[0], display: p.specialty[1] }] }], actor: [{ reference: pu, display: p.label }], comment: p.label + ' clinic (synthetic)' } });
    for (let d = 0; d < days; d++){
      const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d); if (day.getDay() === 0) continue; // closed Sundays
      for (const [h0, h1] of [[9, 12], [13, 16]]) for (let m = h0 * 60; m < h1 * 60; m += 30){
        const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60), e = new Date(s.getTime() + 30 * 60000);
        const id = `${p.key}-${dayKey(s).replace(/-/g, '')}-${pad(s.getHours())}${pad(s.getMinutes())}`;
        entries.push({ request: { method: 'POST', url: 'Slot', ifNoneExist: `identifier=${SYS.slot}|${id}` }, resource: { resourceType: 'Slot', meta: tag, identifier: [{ system: SYS.slot, value: id }], schedule: { reference: su }, status: 'free', start: localIso(s), end: localIso(e) } });
      }
    }
  }
  const r = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: entries });
  const created = (r.entry || []).filter(e => String(e.response?.status).startsWith('201')).length;
  return { entries: entries.length, created };
}

export async function findPractitioner(fhir, { key, name, specialty } = {}){
  const p = PRACTITIONERS.find(x => (key && x.key === key) || (name && new RegExp('\\b' + name + '\\b', 'i').test(x.family + ' ' + x.given + ' ' + x.label)) || (specialty && new RegExp(specialty, 'i').test(x.specialty[1]))) || (!key && !name && !specialty ? PRACTITIONERS[0] : null);
  if (!p) return null;
  const [pr] = await fhir.search(`Practitioner?identifier=${encodeURIComponent(SYS.staff + '|' + p.key)}`); const [sc] = await fhir.search(`Schedule?identifier=${encodeURIComponent(SYS.staff + '|SCHED-' + p.key)}`);
  return pr && sc ? { ...p, practitioner: pr, schedule: sc } : null;
}
export async function findPatient(fhir, mrn){ const [p] = await fhir.search(`Patient?identifier=${encodeURIComponent(SYS.mrn + '|' + mrn)}`); return p || null; }

// free slots in [from, to), soonest first
export async function freeSlots(fhir, schedule, from, to, max = 50){
  return fhir.search(`Slot?schedule=Schedule/${schedule.id}&status=free&start=ge${encodeURIComponent(localIso(from))}&start=lt${encodeURIComponent(localIso(to))}&_sort=start&_count=${max}`, max);
}

// Booking a Slot safely is built in Module 4 (Lab 4 "Book it").
export async function book(){ courseOnly('Booking a Slot (book)', 'Module 4'); }
export const patientName = p => [p.name?.[0]?.given?.join(' '), p.name?.[0]?.family].filter(Boolean).join(' ');

// SIU^S12 (new) / S14 (modified) / S15 (cancelled)
export function buildSiu(event, { appt, patient, prac, reason }){
  const mrn = patient.identifier.find(i => i.system === SYS.mrn)?.value || ''; const n = patient.name?.[0] || {};
  const mins = appt.minutesDuration || 30; const st = { S12: 'Booked', S14: 'Booked', S15: 'Cancelled' }[event];
  const sch = ['SCH', `${appt.apptId}^ACKHARBOR`, '', '', '', '', escape(reason || appt.description), `^${escape(reason || appt.description)}`, `${appt.appointmentType?.coding?.[0]?.code || 'ROUTINE'}^^HL70276`, String(mins), 'MIN', `^^${mins}^${fhirToTs(appt.start)}^${fhirToTs(appt.end)}`];
  while (sch.length < 25) sch.push(''); sch.push(st);
  return ['MSH|^~\\&|ACKHARBOR_SCHED|ACKHARBOR|ACKHARBOR_ENGINE|ACKHARBOR|' + hl7Now() + '||SIU^' + event + '^SIU_S12|' + newControlId('SIU') + '|P|2.5.1',
    sch.join('|'), `PID|1||${escape(mrn)}^^^ACKHARBOR^MR||${escape(n.family)}^${escape((n.given || [])[0])}||${(patient.birthDate || '').replace(/-/g, '')}|${{ male: 'M', female: 'F', other: 'O', unknown: 'U' }[patient.gender] || ''}`,
    'RGS|1|A', `AIP|1|A|${prac.key}^${prac.family}^${prac.given}^^^DR|ATND|||${fhirToTs(appt.start)}|||${mins}|MIN`].join('\r') + '\r';
}

// Turning a front-desk request into who/when is built in Module 4 (Lab 4 parseWhen).
export function parseRequest(){ courseOnly('The booking request parser (parseRequest)', 'Module 4'); }
