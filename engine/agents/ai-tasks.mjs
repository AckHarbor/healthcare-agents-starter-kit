// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// The three AI-assisted tasks. Each returns the rule-based answer when the AI is off, blocked, fails or fails a check.
import { parseRequest, PRACTITIONERS } from '../lib/scheduling.mjs'; import { explainAck } from '../lib/support.mjs'; import { explainReport, NOTE } from './lab-explainer.mjs';
import { parse } from '../lib/hl7.mjs'; import { hasDiagnosis, AI_LABEL } from '../lib/ai.mjs'; import { agentLog } from '../lib/agentlog.mjs';
const pad = n => String(n).padStart(2, '0'); const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstJson = s => { const m = String(s).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; };

// (a) free text -> structured booking intent. Only "book" may write (demo slot booking); anything else needs a human.
export async function aiBookingIntent(ai, text, now = new Date()){
  const rules = { ...parseRequest(text, now), action: 'book', source: 'rules' };
  if (!ai?.enabled) return rules;
  const docs = PRACTITIONERS.map(p => `${p.label} (${p.specialty[1]})`).join('; ');
  const r = await ai.ask(`Today is ${ymd(now)} (${now.toLocaleDateString('en-US', { weekday: 'long' })}). Doctors: ${docs}. Clinic hours 09:00-16:00, closed Sundays.\nRequest: """${text}"""\nReturn JSON: {"action":"book|reschedule|cancel|other","mrn":"SYN-######" or null,"doctor":"family name or null","specialty":"Cardiology|Family practice|null","date":"YYYY-MM-DD or null","part":"morning|afternoon|any","reason":"short visit reason"}`,
    { system: 'You convert clinic scheduling requests into JSON. Only use facts in the request. Never invent an MRN. Output JSON only.', json: true });
  if (!r.ok) return { ...rules, aiNote: r.reason };
  let j; try { j = firstJson(r.text); } catch { j = null; }
  // validation: MRN must be copied from the request, doctor/specialty must be real, date within 60 days
  const ok = j && ['book', 'reschedule', 'cancel', 'other'].includes(j.action) && (!j.mrn || (/^SYN-\d{6}$/.test(j.mrn) && text.toUpperCase().includes(j.mrn)))
    && (!j.doctor || PRACTITIONERS.some(p => new RegExp('^' + j.doctor + '$', 'i').test(p.family))) && (!j.date || (/^\d{4}-\d{2}-\d{2}$/.test(j.date) && Math.abs(new Date(j.date + 'T12:00:00') - now) < 60 * 86400000));
  if (!ok) return { ...rules, aiNote: 'AI answer failed validation; used rules' };
  let from, to;
  if (j.date){ from = new Date(j.date + 'T00:00:00'); to = new Date(j.date + 'T23:59:00'); } else { from = new Date(now); to = new Date(now.getTime() + 14 * 86400000); }
  if (j.part === 'morning') to.setHours(12, 0); if (j.part === 'afternoon') from.setHours(12, 0); if (from < now) from = new Date(now);
  return { action: j.action, mrn: j.mrn || null, name: j.doctor || undefined, specialty: j.specialty && j.specialty !== 'null' ? j.specialty : undefined, from, to, reason: (j.reason || 'Office visit').slice(0, 80), source: AI_LABEL, model: r.model };
}

// (b) NACK explanation. Only the ACK's MSA/ERR fields are sent (no PID data).
export async function aiExplainAck(ai, ackText){
  const rules = explainAck(ackText); if (!ai?.enabled) return { text: rules, source: 'rules' };
  const a = parse(ackText); if (a.get('MSA-1') === 'AA') return { text: rules, source: 'rules' };
  const facts = a.all('ERR').map(e => `ERR location ${a.get('ERR-2', e)}; code ${a.get('ERR-3.1', e)} ${a.get('ERR-3.2', e)}; message: ${a.get('ERR-8', e)}`).join('\n');
  const r = await ai.ask(`A sandbox interface engine returned ${a.get('MSA-1')} for message ${a.get('MSA-2')}.\n${facts}\nRule-based notes:\n${rules}\nExplain in 3 short plain-English sentences for an interface analyst: what went wrong, where, and the mapping/transformer fix. No patient details.`,
    { system: 'You are an HL7 v2 interface support assistant. Be concise and specific. Do not invent fields.' });
  if (!r.ok) return { text: rules, source: 'rules', aiNote: r.reason };
  agentLog('interface-support', 'explained', { ai: true, aiLabel: AI_LABEL, model: r.model, control: a.get('MSA-2'), say: r.text });
  return { text: r.text + '\n\n(Rule-based detail)\n' + rules, source: AI_LABEL, model: r.model };
}

// (c) lab plain-language summary. Never diagnoses; anything that looks like a diagnosis is discarded for the rules text.
export async function aiExplainReport(ai, report, observations){
  const rules = explainReport(report, observations); if (!ai?.enabled) return { ...rules, source: 'rules' };
  const lines = observations.map(o => `${o.code?.text || o.code?.coding?.[0]?.display}: ${o.valueQuantity ? o.valueQuantity.value + ' ' + (o.valueQuantity.unit || '') : o.valueString} (lab range ${o.referenceRange?.[0]?.text || 'n/a'}${o.interpretation ? ', flag ' + o.interpretation[0].coding[0].code : ''})`).join('\n');
  const id = report.identifier?.find(i => /filler/.test(i.system))?.value || ('SYN-report-' + report.id);
  const r = await ai.ask(`Synthetic lab report ${id} (urn:ackharbor:sandbox demo data):\n${lines}\nWrite 2-4 short sentences in plain language for a patient: what each test measures in general terms and whether each value is inside, above or below the lab's range. Do NOT diagnose, name conditions or diseases, or suggest treatment or medicines. End by saying to talk to their doctor.`,
    { system: 'You explain lab values against reference ranges in plain language. You never diagnose or recommend treatment.', resources: [report, ...observations] });
  if (!r.ok) return { ...rules, source: 'rules', aiNote: r.reason };
  if (hasDiagnosis(r.text)) return { ...rules, source: 'rules', aiNote: 'AI summary removed by the no-diagnosis filter' };
  const out = { summary: r.text.replace(/\s+/g, ' ').trim(), lines: rules.lines, note: NOTE, source: AI_LABEL, model: r.model };
  agentLog('lab-explainer', 'explained', { ai: true, aiLabel: AI_LABEL, model: r.model, report: 'DiagnosticReport/' + report.id, say: out.summary + ' ' + NOTE });
  return out;
}
