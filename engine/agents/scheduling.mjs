// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Scheduling agent + reminder/reschedule agent (rule-based). Books into the local EMR, then emits SIU through the engine.
import { parseRequest, findPatient, findPractitioner, freeSlots, book, buildSiu, patientName, localIso, PRACTITIONERS } from '../lib/scheduling.mjs';
import { sendMllp } from '../lib/engine.mjs'; import { parse } from '../lib/hl7.mjs'; import { agentLog } from '../lib/agentlog.mjs'; import { SYS } from '../lib/map.mjs'; import { aiBookingIntent } from './ai-tasks.mjs'; import { AI_LABEL } from '../lib/ai.mjs';

export async function emit(siu, { send = sendMllp } = {}){ const ack = await send(siu); const a = parse(ack); return { ack, code: a.get('MSA-1'), text: a.get('MSA-3') }; }

export async function scheduleAgent(fhir, request, opts = {}){
  const q = typeof request === 'string' ? (opts.ai?.enabled ? await aiBookingIntent(opts.ai, request) : parseRequest(request)) : request;
  const aiMeta = q.source === AI_LABEL ? { ai: true, aiLabel: AI_LABEL, model: q.model, intent: { action: q.action, mrn: q.mrn, doctor: q.name, specialty: q.specialty, from: q.from && localIso(q.from), to: q.to && localIso(q.to), reason: q.reason } } : {};
  if (q.action && q.action !== 'book'){ // AI may only trigger demo slot booking; everything else waits for a person
    const say = `Understood a "${q.action}" request for ${q.mrn || 'an unknown patient'}. That change needs human approval; nothing was changed. ${q.action === 'reschedule' ? 'A staff member can run: node agents.mjs reschedule <SYN-APT-id>' : 'A staff member must review it.'}`;
    agentLog(opts.agent || 'scheduling', 'needs-approval', { ...aiMeta, say }); return { ok: false, needsApproval: true, say, intent: q };
  }
  if (!q.mrn) return { ok: false, say: 'Which patient? Give the MRN (e.g. SYN-100001).' };
  const patient = await findPatient(fhir, q.mrn); if (!patient) return { ok: false, say: `No patient ${q.mrn} in the EMR. Send their ADT first (or run the intake agent).` };
  const prac = await findPractitioner(fhir, { name: q.name, specialty: q.specialty, key: q.key }); if (!prac) return { ok: false, say: 'No matching practitioner/schedule. Run: node agents.mjs seed' };
  const slots = await freeSlots(fhir, prac.schedule, q.from, q.to);
  if (!slots.length) return { ok: false, say: `${prac.label} has no free slot between ${localIso(q.from)} and ${localIso(q.to)}.` };
  const appt = await book(fhir, { patient, prac, slots, reason: q.reason, basedOn: q.basedOn, apptType: q.apptType });
  if (!appt) return { ok: false, say: 'Every matching slot was taken while booking; try another time.' };
  const siu = buildSiu('S12', { appt, patient, prac, reason: q.reason }); const res = await emit(siu, opts);
  const say = `Booked ${patientName(patient)} (${q.mrn}) with ${prac.label} on ${new Date(appt.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} - Appointment/${appt.id} (${appt.apptId}), Slot/${appt.slot.id} now busy. SIU^S12 ACK: ${res.code}.`;
  agentLog(opts.agent || 'scheduling', 'booked', { ...aiMeta, mrn: q.mrn, appointment: 'Appointment/' + appt.id, slot: 'Slot/' + appt.slot.id, start: appt.start, ack: res.code, say });
  return { ok: res.code === 'AA', say: (aiMeta.ai ? `[${AI_LABEL}] ` : '') + say, appt, patient, prac, siu, intent: q, ...res };
}

// Move an appointment to the next free slot after `after` (same practitioner): old Slot free, new Slot busy, Appointment updated, all atomically.
export async function rescheduleAgent(fhir, { apptId, after = null, reason = 'Patient asked to reschedule' }, opts = {}){
  const [a] = await fhir.search(`Appointment?identifier=${encodeURIComponent(SYS.appt + '|' + apptId)}`); if (!a) return { ok: false, say: `No appointment ${apptId}.` };
  const pref = a.participant.find(p => p.actor.reference.startsWith('Practitioner/')).actor.reference; const pr = await fhir.get(pref);
  const key = pr.identifier.find(i => i.system === SYS.staff).value; const prac = await findPractitioner(fhir, { key }); const patient = await fhir.get(a.participant.find(p => p.actor.reference.startsWith('Patient/')).actor.reference);
  const from = after ? new Date(after) : new Date(new Date(a.end).getTime()); const to = new Date(from.getTime() + 14 * 86400000);
  const slots = (await freeSlots(fhir, prac.schedule, from, to)).filter(s => s.start !== a.start); if (!slots.length) return { ok: false, say: 'No free slot to move to.' };
  const oldSlot = await fhir.get(a.slot[0].reference);
  for (const ns of slots){
    const upd = { ...a, start: ns.start, end: ns.end, slot: [{ reference: 'Slot/' + ns.id }], comment: reason }; 
    try {
      await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [
        { request: { method: 'PUT', url: 'Appointment/' + a.id, ifMatch: `W/"${a.meta.versionId}"` }, resource: upd },
        { request: { method: 'PUT', url: 'Slot/' + ns.id, ifMatch: `W/"${ns.meta.versionId}"` }, resource: { ...ns, status: 'busy' } },
        { request: { method: 'PUT', url: 'Slot/' + oldSlot.id, ifMatch: `W/"${oldSlot.meta.versionId}"` }, resource: { ...oldSlot, status: 'free' } } ] });
      const appt = { ...upd, apptId }; const res = await emit(buildSiu('S14', { appt, patient, prac, reason }), opts);
      const when = new Date(ns.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const msg = `Hi ${patient.name[0].given[0]}, your visit with ${prac.label} has moved to ${when}. Reply C to confirm. (AckHarbor sandbox demo message)`;
      agentLog('reminder', 'would-send', { channel: 'sms (not sent)', to: 'synthetic patient ' + patient.identifier[0].value, text: msg });
      agentLog('reminder', 'rescheduled', { appointment: 'Appointment/' + a.id, from: a.start, to: ns.start, ack: res.code });
      return { ok: res.code === 'AA', say: `Moved ${apptId} from ${a.start} to ${ns.start}. SIU^S14 ACK: ${res.code}. Would-send reminder logged (not sent).`, ...res, wouldSend: msg };
    } catch (e) { if (e.status === 409 || e.status === 412) continue; throw e; }
  }
  return { ok: false, say: 'All candidate slots were taken; try again.' };
}

// Reminders for booked appointments in the next `hours`: composes the text and logs it as would-send only.
export async function reminderAgent(fhir, { hours = 48, now = new Date() } = {}){
  const appts = await fhir.search(`Appointment?status=booked&date=ge${encodeURIComponent(localIso(now))}&date=lt${encodeURIComponent(localIso(new Date(now.getTime() + hours * 3600000)))}&_sort=date`);
  const out = [];
  for (const a of appts){
    const p = a.participant.find(x => x.actor.reference.startsWith('Patient/')); const d = a.participant.find(x => x.actor.reference.startsWith('Practitioner/'));
    const text = `Reminder: ${p.actor.display}, you have a visit with ${d.actor.display} on ${new Date(a.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Reply R to reschedule. (AckHarbor sandbox demo message)`;
    out.push(agentLog('reminder', 'would-send', { channel: 'sms (not sent)', appointment: 'Appointment/' + a.id, text }));
  }
  return { ok: true, say: `${out.length} reminder(s) composed and logged as would-send. Nothing was sent.`, reminders: out };
}
