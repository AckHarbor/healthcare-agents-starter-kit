// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Rule-based clinic agents for the local demo (synthetic data only; nothing is ever sent outside 127.0.0.1).
// intake, referral, eligibility (X12 270/271 with a local mock payer), prior-auth drafter, refill, discharge follow-up.
import fs from 'node:fs'; import { randomUUID } from 'node:crypto';
import { escape, hl7Now, newControlId, parse } from '../lib/hl7.mjs'; import { SYS } from '../lib/map.mjs'; import { sendMllp } from '../lib/engine.mjs';
import { agentLog } from '../lib/agentlog.mjs'; import { findPatient, findPractitioner, patientName, localIso, PRACTITIONERS } from '../lib/scheduling.mjs';
import { scheduleAgent } from './scheduling.mjs';
const tag = { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] };
const ackRes = ack => { const a = parse(ack); return { ack, code: a.get('MSA-1'), text: a.get('MSA-3') }; };
const pad = n => String(n).padStart(2, '0'); const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// 1) Patient intake: form -> ADT^A04 (PID + PV1 + IN1) through the engine -> Patient + Encounter + Coverage; home meds recorded.
export async function intakeAgent(fhir, form, { send = sendMllp } = {}){
  for (const k of ['mrn', 'family', 'given', 'birthDate']) if (!form[k]) return { ok: false, say: `Intake form is missing "${k}".` };
  if (!/^SYN-\d{6}$/.test(form.mrn)) return { ok: false, say: 'Demo MRNs must look like SYN-123456 (synthetic data only).' };
  const visit = 'SYN-V-' + Date.now().toString().slice(-6); const now = hl7Now(); const i = form.insurance || {}; const a = form.address || {};
  const pv1 = Array(20).fill(''); pv1[0] = 'PV1'; pv1[1] = '1'; pv1[2] = 'O'; pv1[3] = 'CLINIC^1^^ACKHARBOR_CLINIC'; pv1[7] = 'D9001^RIVERA^ALEX^^^DR'; pv1[19] = visit;
  const in1 = Array(37).fill(''); Object.assign(in1, { 0: 'IN1', 1: '1', 2: `${escape(i.planId)}^${escape(i.planName)}`, 3: escape(i.payerId), 4: escape(i.payerName), 12: (i.effective || '').replace(/-/g, ''), 17: { self: '18', spouse: '01', child: '19' }[i.relationship || 'self'] || '18', 36: escape(i.memberId) });
  const msg = [`MSH|^~\\&|ACKHARBOR_INTAKE|ACKHARBOR|ACKHARBOR_ENGINE|ACKHARBOR|${now}||ADT^A04^ADT_A01|${newControlId('A04')}|P|2.5.1`, `EVN|A04|${now}`,
    `PID|1||${escape(form.mrn)}^^^ACKHARBOR^MR||${escape(form.family)}^${escape(form.given)}||${form.birthDate.replace(/-/g, '')}|${escape(form.sex || 'U')}|||${escape(a.line)}^^${escape(a.city)}^${escape(a.state)}^${escape(a.zip)}^USA||${escape(form.phone)}`,
    pv1.join('|'), ...(i.memberId ? [in1.join('|')] : [])].join('\r') + '\r';
  const res = ackRes(await send(msg)); if (res.code !== 'AA') return { ok: false, say: 'Intake A04 was not accepted: ' + res.text, ...res };
  const p = await findPatient(fhir, form.mrn); let meds = 0;
  for (const m of form.medications || []){ // home medication list (recorded, active)
    await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: 'MedicationRequest', ifNoneExist: `identifier=${SYS.rx}|${form.mrn}-${m.code}` }, resource: { resourceType: 'MedicationRequest', meta: tag, identifier: [{ system: SYS.rx, value: `${form.mrn}-${m.code}` }], status: 'active', intent: 'order', reportedBoolean: true, subject: { reference: 'Patient/' + p.id }, medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: m.code, display: m.name }], text: m.name }, dosageInstruction: [{ text: m.sig }], note: [{ text: 'Home medication from intake form' }] } }] }); meds++; }
  const say = `Registered ${form.given} ${form.family} (${form.mrn}) via ADT^A04 (ACK ${res.code}): Patient/${p.id}, visit ${visit}, Coverage ${i.memberId || 'none'}, ${meds} home medication(s).`;
  agentLog('intake', 'registered', { mrn: form.mrn, say }); return { ok: true, say, ...res, patient: p, a04: msg };
}

// 2) Referral: ServiceRequest (referral) + book the specialist's soonest slot (Appointment.basedOn the referral) + SIU^S12.
export async function referralAgent(fhir, text, opts = {}){
  const mrn = (text.match(/\bSYN-\d{6}\b/i) || [])[0]?.toUpperCase(); const spec = (text.match(/\bto\s+(cardiology|family practice)\b/i) || [])[1] || 'cardiology';
  const reason = (text.match(/\bfor\s+(.+)$/i) || [])[1] || 'Specialist evaluation';
  const patient = mrn && await findPatient(fhir, mrn); if (!patient) return { ok: false, say: 'Need a known patient MRN (SYN-......).' };
  const to = await findPractitioner(fhir, { specialty: spec }); if (!to) return { ok: false, say: 'No ' + spec + ' schedule. Run: node agents.mjs seed' };
  const ref = 'SYN-REF-' + randomUUID().slice(0, 6).toUpperCase();
  const r = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: 'ServiceRequest' }, resource: { resourceType: 'ServiceRequest', meta: tag, identifier: [{ system: SYS.referral, value: ref }], status: 'active', intent: 'order',
    category: [{ coding: [{ system: 'http://snomed.info/sct', code: '3457005', display: 'Patient referral' }] }], code: { coding: [{ system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to service' }], text: 'Referral to ' + to.specialty[1] },
    subject: { reference: 'Patient/' + patient.id }, requester: { display: 'Dr. Alex Rivera' }, performerType: { coding: [{ system: 'http://snomed.info/sct', code: to.specialty[0], display: to.specialty[1] }], text: to.specialty[1] }, performer: [{ reference: 'Practitioner/' + to.practitioner.id, display: to.label }],
    reasonCode: [{ text: reason }], authoredOn: localIso(new Date()) } }] });
  const srRef = r.entry[0].response.location.replace(/\/_history.*/, '');
  const now = new Date(); const b = await scheduleAgent(fhir, { mrn, key: to.key, from: now, to: new Date(now.getTime() + 14 * 86400000), reason: 'Referral: ' + reason, basedOn: srRef, apptType: 'FOLLOWUP' }, { ...opts, agent: 'referral' });
  const say = `Referral ${ref} (${srRef}) to ${to.label} for "${reason}". ` + b.say; agentLog('referral', 'referred', { mrn, referral: srRef, say }); return { ...b, say, referral: srRef };
}

// 4) Eligibility: Coverage -> X12 270 -> local mock payer -> 271 -> CoverageEligibilityResponse. Synthetic, never leaves the box.
export function build270(p, cov, { date = new Date(), ctl = String(Date.now()).slice(-9) } = {}){
  const d = ymd(date), t = pad(date.getHours()) + pad(date.getMinutes()); const n = p.name[0];
  return [`ISA*00*          *00*          *ZZ*ACKHARBOR      *ZZ*SANDBOXPAYER   *${d.slice(2)}*${t}*^*00501*${ctl}*0*T*:~`, `GS*HS*ACKHARBOR*SANDBOXPAYER*${d}*${t}*1*X*005010X279A1~`, 'ST*270*0001*005010X279A1~', `BHT*0022*13*${ctl}*${d}*${t}~`,
    'HL*1**20*1~', `NM1*PR*2*${(cov.payor?.[0]?.display || 'PAYER').toUpperCase()}*****PI*${cov.payor?.[0]?.identifier?.value || 'SYNPAYER1'}~`, 'HL*2*1*21*1~', 'NM1*1P*2*ACKHARBOR SANDBOX CLINIC*****XX*0000000000~',
    'HL*3*2*22*0~', `TRN*1*${ctl}*9ACKHARBOR~`, `NM1*IL*1*${n.family}*${(n.given || [])[0] || ''}****MI*${cov.subscriberId}~`, `DMG*D8*${(p.birthDate || '').replace(/-/g, '')}~`, `DTP*291*D8*${d}~`, 'EQ*30~', 'SE*13*0001~', 'GE*1*1~', `IEA*1*${ctl}~`].join('\n');
}
export function mockPayer271(x270){ // rule-based: synthetic member ids starting SYN-MBR are active; everything else is "not found"
  const seg = x270.split(/~\n?/).map(s => s.split('*')); const il = seg.find(s => s[0] === 'NM1' && s[1] === 'IL'); const isa = seg.find(s => s[0] === 'ISA'); const ctl = isa[13]; const member = il?.[9] || '';
  const ok = /^SYN-MBR-\d+$/.test(member); const d = seg.find(s => s[0] === 'DTP')?.[3] || '';
  const body = ok ? ['EB*1*IND*30**GOLD PPO (SYNTHETIC)~', 'EB*B*IND*98***27*25~', 'EB*C*IND*30***23*500~', 'EB*G*IND*30***23*1200~'] : ['AAA*Y**75*C~'];
  return [`ISA*00*          *00*          *ZZ*SANDBOXPAYER   *ZZ*ACKHARBOR      *${d.slice(2)}*1200*^*00501*${ctl}*0*T*:~`, `GS*HB*SANDBOXPAYER*ACKHARBOR*${d}*1200*1*X*005010X279A1~`, 'ST*271*0001*005010X279A1~', `BHT*0022*11*${ctl}*${d}*1200~`, 'HL*1**20*1~', 'NM1*PR*2*SANDBOX HEALTH PLAN*****PI*SYNPAYER1~', 'HL*2*1*21*1~', 'NM1*1P*2*ACKHARBOR SANDBOX CLINIC*****XX*0000000000~', 'HL*3*2*22*0~',
    `NM1*IL*1*${il[3]}*${il[4]}****MI*${member}~`, ...body, `SE*${10 + body.length}*0001~`, 'GE*1*1~', `IEA*1*${ctl}~`].join('\n');
}
export function parse271(x){
  const seg = x.split(/~\n?/).map(s => s.split('*')); const aaa = seg.find(s => s[0] === 'AAA'); const eb = seg.filter(s => s[0] === 'EB');
  const benefits = eb.map(s => ({ code: s[1], label: { '1': 'Active coverage', B: 'Co-payment', C: 'Deductible', G: 'Out-of-pocket max' }[s[1]] || s[1], amount: s[7] ? +s[7] : undefined, plan: s[5] || undefined }));
  return { active: eb.some(s => s[0] === 'EB' && s[1] === '1') && !aaa, reject: aaa ? { code: aaa[3], text: { '72': 'Invalid member id', '75': 'Subscriber/insured not found' }[aaa[3]] || 'Rejected' } : null, benefits };
}
export async function eligibilityAgent(fhir, mrn){
  const p = await findPatient(fhir, mrn); if (!p) return { ok: false, say: 'Unknown patient ' + mrn };
  const [cov] = await fhir.search(`Coverage?beneficiary=Patient/${p.id}&status=active`); if (!cov) return { ok: false, say: `${mrn} has no active Coverage on file. Run intake first.` };
  const x270 = build270(p, cov); const x271 = mockPayer271(x270); const r = parse271(x271);
  const resp = { resourceType: 'CoverageEligibilityResponse', meta: tag, status: 'active', purpose: ['benefits'], patient: { reference: 'Patient/' + p.id }, created: localIso(new Date()), request: { display: 'X12 270 (synthetic, local mock payer)' }, outcome: r.active ? 'complete' : 'error',
    disposition: r.active ? 'Active coverage (mock payer)' : 'Not eligible: ' + r.reject?.text, insurer: { display: cov.payor?.[0]?.display },
    insurance: [{ coverage: { reference: 'Coverage/' + cov.id }, inforce: r.active, item: r.active ? [{ category: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory', code: '30', display: 'Health Benefit Plan Coverage' }], text: 'Health benefit plan' },
      benefit: r.benefits.filter(b => b.amount != null).map(b => ({ type: { text: b.label }, allowedMoney: { value: b.amount, currency: 'USD' } })) }] : [] }],
    ...(r.active ? {} : { error: [{ code: { text: r.reject?.text } }] }) };
  const saved = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: 'CoverageEligibilityResponse' }, resource: resp }] });
  const say = r.active ? `${mrn}: coverage ACTIVE with ${cov.payor?.[0]?.display} (${r.benefits.filter(b => b.amount != null).map(b => b.label + ' $' + b.amount).join(', ')}). Saved ${saved.entry[0].response.location.replace(/\/_history.*/, '')}.` : `${mrn}: NOT eligible (${r.reject?.text}).`;
  agentLog('eligibility', 'checked', { mrn, say, detail: '270 sent to local mock payer:\n' + x270 + '\n\n271 received:\n' + x271 }); return { ok: r.active, say, x270, x271, parsed: r };
}

// 5) Prior authorization drafter: referral + coverage -> draft letter + FHIR Claim (use=preauthorization, status=draft). Never submitted.
export async function priorAuthAgent(fhir, mrn){
  const p = await findPatient(fhir, mrn); if (!p) return { ok: false, say: 'Unknown patient ' + mrn };
  const [sr] = await fhir.search(`ServiceRequest?subject=Patient/${p.id}&category=3457005&status=active&_sort=-_lastUpdated&_count=1`, 1); if (!sr) return { ok: false, say: 'No active referral to draft a prior auth for. Run the referral agent first.' };
  const [cov] = await fhir.search(`Coverage?beneficiary=Patient/${p.id}&status=active`); if (!cov) return { ok: false, say: 'No active Coverage on file.' };
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const letter = `DRAFT - NOT SUBMITTED - SYNTHETIC DEMO\n${today}\nTo: ${cov.payor?.[0]?.display} Utilization Review\nRe: Prior authorization request for ${patientName(p)} (DOB ${p.birthDate}), member ${cov.subscriberId}\n\nService: ${sr.code?.text} (${sr.performerType?.text}) with ${sr.performer?.[0]?.display || 'specialist'}\nReason for referral: ${sr.reasonCode?.[0]?.text}\nOrdering clinician: ${sr.requester?.display}\n\n[Clinician to add: relevant history, prior treatments tried, and why this service is needed now.]\n\nThis draft was prepared by the AckHarbor sandbox prior-auth agent for clinician review. It contains synthetic data only and has not been sent.`;
  const claim = { resourceType: 'Claim', meta: tag, identifier: [{ system: SYS.claim, value: 'SYN-PA-' + randomUUID().slice(0, 6).toUpperCase() }], status: 'draft', use: 'preauthorization', type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
    patient: { reference: 'Patient/' + p.id }, created: localIso(new Date()), insurer: { display: cov.payor?.[0]?.display }, provider: { display: 'AckHarbor Sandbox Clinic' }, priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
    referral: { reference: 'ServiceRequest/' + sr.id }, insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/' + cov.id } }],
    item: [{ sequence: 1, productOrService: { coding: [{ system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to service' }], text: sr.code?.text } }],
    extension: [{ url: 'urn:ackharbor:sandbox:draft-letter', valueString: letter }] };
  const r = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: 'Claim' }, resource: claim }] });
  const loc = r.entry[0].response.location.replace(/\/_history.*/, ''); const say = `Prior auth DRAFT ${loc} for ${mrn} (${sr.code?.text}). Clinician review needed; nothing was submitted.`;
  agentLog('prior-auth', 'would-send', { mrn, channel: 'payer portal (not submitted)', say, text: say, detail: letter }); return { ok: true, say, letter, print: letter };
}

// 7) Refill: patient asks for a refill -> new MedicationRequest status=draft, priorPrescription -> queued for clinician approval.
export async function refillAgent(fhir, text){
  const mrn = (text.match(/\bSYN-\d{6}\b/i) || [])[0]?.toUpperCase(); const p = mrn && await findPatient(fhir, mrn); if (!p) return { ok: false, say: 'Need a known patient MRN.' };
  const meds = await fhir.search(`MedicationRequest?subject=Patient/${p.id}&status=active`); const word = text.replace(/\bSYN-\d{6}\b/i, '').replace(/\b(refill|please|my|for|of|the)\b/gi, ' ').trim().split(/\s+/).filter(w => w.length > 2);
  const med = meds.find(m => word.some(w => new RegExp(w, 'i').test(m.medicationCodeableConcept?.text || ''))) || (meds.length === 1 ? meds[0] : null);
  if (!med) return { ok: false, say: meds.length ? `Which one? Active meds: ${meds.map(m => m.medicationCodeableConcept.text).join('; ')}` : 'No active medication on file to refill.' };
  const [queued] = await fhir.search(`MedicationRequest?subject=Patient/${p.id}&status=draft`).then(x => x.filter(q => q.priorPrescription?.reference === 'MedicationRequest/' + med.id));
  if (queued) return { ok: true, say: `A refill for ${med.medicationCodeableConcept.text} is already waiting for clinician approval (MedicationRequest/${queued.id}).` };
  const rx = { resourceType: 'MedicationRequest', meta: tag, status: 'draft', intent: 'order', subject: { reference: 'Patient/' + p.id }, medicationCodeableConcept: med.medicationCodeableConcept, dosageInstruction: med.dosageInstruction, priorPrescription: { reference: 'MedicationRequest/' + med.id }, authoredOn: localIso(new Date()),
    dispenseRequest: { numberOfRepeatsAllowed: 0, quantity: { value: 30, unit: 'tablet' }, expectedSupplyDuration: { value: 30, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' } },
    note: [{ text: 'Refill requested via the AckHarbor sandbox refill agent. QUEUED FOR CLINICIAN APPROVAL: not active and not sent to any pharmacy until a clinician reviews and signs.' }] };
  const r = await fhir.transaction({ resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'POST', url: 'MedicationRequest' }, resource: rx }] });
  const loc = r.entry[0].response.location.replace(/\/_history.*/, ''); const say = `Refill for ${med.medicationCodeableConcept.text} queued for clinician approval as ${loc} (status draft).`;
  agentLog('refill', 'queued', { mrn, say }); return { ok: true, say };
}

// 9) Discharge follow-up: ADT^A03 through the engine -> Encounter finished; book follow-up with the attending within 7 days; instructions logged as would-send.
export async function dischargeAgent(fhir, a03Text, { send = sendMllp } = {}){
  const res = ackRes(await send(a03Text)); if (res.code !== 'AA') return { ok: false, say: 'Discharge A03 was not accepted: ' + res.text, ...res };
  const m = parse(a03Text); const mrn = m.get('PID-3.1'); const visit = m.get('PV1-19.1'); const doc = m.get('PV1-7.1');
  const [enc] = await fhir.search(`Encounter?identifier=${encodeURIComponent(SYS.visit + '|' + visit)}`);
  const from = new Date(Math.max(Date.now(), new Date(enc.period.end).getTime()) + 86400000); from.setHours(0, 0, 0, 0);
  const key = PRACTITIONERS.some(p => p.key === doc) ? doc : PRACTITIONERS[0].key;
  const b = await scheduleAgent(fhir, { mrn, key, from, to: new Date(from.getTime() + 7 * 86400000), reason: 'Post-discharge follow-up', apptType: 'FOLLOWUP' }, { send, agent: 'discharge' });
  const p = await findPatient(fhir, mrn);
  const text = `Hi ${p.name[0].given[0]}, you were discharged on ${new Date(enc.period.end).toLocaleDateString('en-US')}. ${b.ok ? `Your follow-up visit is ${new Date(b.appt.start).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} with ${b.prac.label}.` : 'Please call the clinic to book your follow-up.'} Take your medicines as listed on your discharge papers, and call the clinic or 911 if you feel worse. (AckHarbor sandbox demo message)`;
  agentLog('discharge', 'would-send', { mrn, channel: 'sms (not sent)', text });
  return { ok: b.ok, say: `A03 ACK ${res.code}: Encounter ${visit} finished. ${b.say} Discharge instructions logged as would-send (not sent).`, ack: res.ack, followup: b, instructions: text };
}

export const loadForm = f => JSON.parse(fs.readFileSync(f, 'utf8'));
