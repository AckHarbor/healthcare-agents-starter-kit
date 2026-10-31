// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// HL7 v2 -> FHIR R4 mappings for the AckHarbor(TM) Harbor Engine prototype. Synthetic data only.
// Each mapper returns a FHIR transaction Bundle (conditional create/update keyed on identifiers so re-sends are idempotent).
import { Hl7Error, tsToFhir } from './hl7.mjs';
import { randomUUID } from 'node:crypto';

export const SYS = { // made-up identifier systems for the local sandbox EMR
  mrn: 'urn:ackharbor:sandbox:mrn', member: 'urn:ackharbor:sandbox:member-id', referral: 'urn:ackharbor:sandbox:referral', rx: 'urn:ackharbor:sandbox:rx', claim: 'urn:ackharbor:sandbox:preauth', visit: 'urn:ackharbor:sandbox:visit', placer: 'urn:ackharbor:sandbox:placer-order',
  filler: 'urn:ackharbor:sandbox:filler-order', appt: 'urn:ackharbor:sandbox:appointment', staff: 'urn:ackharbor:sandbox:staff', slot: 'urn:ackharbor:sandbox:slot' };
const uuid = () => 'urn:uuid:' + randomUUID();
const need = (v, loc, label) => { if (!v) throw new Hl7Error(label + ' is required but empty', { code: '101', loc }); return v; };
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || v === null || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) ? undefined : v));
const codeSys = s => ({ LN: 'http://loinc.org', LOINC: 'http://loinc.org', SCT: 'http://snomed.info/sct', SNM: 'http://snomed.info/sct' }[String(s).toUpperCase()] || (s ? 'urn:ackharbor:sandbox:code:' + s : undefined));
const cwe = (msg, p, seg) => { const code = msg.get(p + '.1', seg), display = msg.get(p + '.2', seg), sys = msg.get(p + '.3', seg); return clean({ coding: code ? [{ system: codeSys(sys), code, display }] : [], text: display || code }); };
const condUrl = (type, sys, val) => `${type}?identifier=${encodeURIComponent(sys + '|' + val)}`;

export function patientFromPid(msg){
  const mrn = need(msg.get('PID-3.1'), 'PID^1^3', 'Patient identifier PID-3');
  const family = need(msg.get('PID-5.1'), 'PID^1^5', 'Patient name PID-5'); const given = [msg.get('PID-5.2'), msg.get('PID-5.3')].filter(Boolean);
  const sexRaw = msg.get('PID-8'); const gender = { M: 'male', F: 'female', O: 'other', U: 'unknown', A: 'other', N: 'unknown', '': undefined }[sexRaw.toUpperCase()];
  if (sexRaw && !gender) throw new Hl7Error('PID-8 sex code "' + sexRaw + '" is not in HL7 table 0001', { code: '103', loc: 'PID^1^8' });
  const dobRaw = msg.get('PID-7'); const birthDate = dobRaw ? tsToFhir(dobRaw, { dateOnly: true }) : undefined;
  if (dobRaw && !birthDate) throw new Hl7Error('PID-7 birth date "' + dobRaw + '" is not a valid HL7 date', { code: '102', loc: 'PID^1^7' });
  return { mrn, resource: clean({ resourceType: 'Patient', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic', display: 'Synthetic test data' }] },
    identifier: [{ use: 'usual', system: SYS.mrn, value: mrn, type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] } }],
    name: [{ use: 'official', family, given }], gender, birthDate,
    address: msg.get('PID-11.1') ? [{ line: [msg.get('PID-11.1'), msg.get('PID-11.2')].filter(Boolean), city: msg.get('PID-11.3'), state: msg.get('PID-11.4'), postalCode: msg.get('PID-11.5'), country: msg.get('PID-11.6') }] : [],
    telecom: msg.get('PID-13.1') ? [{ system: 'phone', value: msg.get('PID-13.1'), use: 'home' }] : [] }) };
}
// Patient entry: conditional update (ADT is the source of truth) or conditional create (orders/results must not overwrite demographics)
function patientEntry(msg, mode){
  const p = patientFromPid(msg); const fullUrl = uuid();
  const request = mode === 'update' ? { method: 'PUT', url: condUrl('Patient', SYS.mrn, p.mrn) } : { method: 'POST', url: 'Patient', ifNoneExist: 'identifier=' + encodeURIComponent(SYS.mrn + '|' + p.mrn) };
  return { entry: { fullUrl, resource: p.resource, request }, ref: fullUrl, mrn: p.mrn };
}

const CLASS = { I: ['IMP', 'inpatient encounter'], O: ['AMB', 'ambulatory'], E: ['EMER', 'emergency'], P: ['PRENC', 'pre-admission'], R: ['IMP', 'inpatient encounter'], B: ['AMB', 'ambulatory'] };
export function mapAdtA01(msg, { event = 'A01' } = {}){
  if (!msg.seg('PID')) throw new Hl7Error('PID segment missing', { code: '100', loc: 'PID' });
  if (!msg.seg('PV1')) throw new Hl7Error('PV1 segment missing', { code: '100', loc: 'PV1' });
  const pt = patientEntry(msg, 'update');
  const cls = msg.get('PV1-2'); if (!CLASS[need(cls, 'PV1^1^2', 'Patient class PV1-2').toUpperCase()]) throw new Hl7Error('PV1-2 patient class "' + cls + '" is not in HL7 table 0004', { code: '103', loc: 'PV1^1^2' });
  const visit = need(msg.get('PV1-19.1'), 'PV1^1^19', 'Visit number PV1-19');
  const [code, display] = CLASS[cls.toUpperCase()];
  const loc = [msg.get('PV1-3.1'), msg.get('PV1-3.2'), msg.get('PV1-3.3')].filter(Boolean).join('-'); const fac = msg.get('PV1-3.4');
  const att = [msg.get('PV1-7.3'), msg.get('PV1-7.2')].filter(Boolean).join(' ');
  const start = tsToFhir(msg.get('PV1-44') || msg.get('EVN-2'));
  const enc = clean({ resourceType: 'Encounter', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] },
    identifier: [{ system: SYS.visit, value: visit }], status: event === 'A04' ? 'arrived' : 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code, display },
    subject: { reference: pt.ref }, period: { start },
    participant: att ? [{ type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND', display: 'attender' }] }], individual: { display: 'Dr. ' + att, identifier: msg.get('PV1-7.1') ? { system: SYS.staff, value: msg.get('PV1-7.1') } : undefined } }] : [],
    location: loc ? [{ location: { display: loc + (fac ? ' (' + fac + ')' : '') }, status: 'active' }] : [],
    reasonCode: msg.get('PV2-3.2') || msg.get('PV2-3.1') ? [cwe(msg, 'PV2-3')] : [] });
  const cov = coverageEntries(msg, pt.ref);
  return { summary: `Patient ${pt.mrn} + Encounter ${visit}` + (cov.length ? ` + ${cov.length} Coverage` : ''), bundle: { resourceType: 'Bundle', type: 'transaction', entry: [pt.entry, { fullUrl: uuid(), resource: enc, request: { method: 'PUT', url: condUrl('Encounter', SYS.visit, visit) } }, ...cov] } };
}

// IN1 -> Coverage (conditional update on IN1-36 member id)
const REL = { '01': 'spouse', '18': 'self', '19': 'child', SEL: 'self', SPO: 'spouse', CHD: 'child' };
export function coverageEntries(msg, patientRef){
  return msg.all('IN1').map((in1, i) => {
    const member = need(msg.get('IN1-36', in1), `IN1^${i + 1}^36`, 'Policy/member number IN1-36');
    const rel = REL[(msg.get('IN1-17.1', in1) || '18').toUpperCase()] || 'other';
    return { fullUrl: uuid(), request: { method: 'PUT', url: condUrl('Coverage', SYS.member, member) }, resource: clean({ resourceType: 'Coverage', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] },
      identifier: [{ system: SYS.member, value: member }], status: 'active', subscriberId: member, beneficiary: { reference: patientRef },
      relationship: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship', code: rel }] },
      payor: [{ display: msg.get('IN1-4.1', in1) || 'Sandbox payer', identifier: msg.get('IN1-3.1', in1) ? { system: 'urn:ackharbor:sandbox:payer', value: msg.get('IN1-3.1', in1) } : undefined }],
      class: msg.get('IN1-2.1', in1) ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'plan' }] }, value: msg.get('IN1-2.1', in1), name: msg.get('IN1-2.2', in1) || msg.get('IN1-8', in1) }] : [],
      period: { start: tsToFhir(msg.get('IN1-12', in1), { dateOnly: true }) || undefined } }) };
  });
}

// ADT^A03 discharge: update the existing Encounter (found by PV1-19) to finished. Needs the current resource, so it takes it as input.
export function mapAdtA03(msg, existing){
  const visit = need(msg.get('PV1-19.1'), 'PV1^1^19', 'Visit number PV1-19');
  if (!existing) throw new Hl7Error(`No Encounter with visit number ${visit}; send the A01 first`, { code: '204', loc: 'PV1^1^19' });
  const end = tsToFhir(msg.get('PV1-45') || msg.get('EVN-2')); if (!end) throw new Hl7Error('Discharge date/time PV1-45 is required', { code: '101', loc: 'PV1^1^45' });
  const disp = msg.get('PV1-36');
  const enc = { ...existing, status: 'finished', period: { ...(existing.period || {}), end }, ...(disp ? { hospitalization: { ...(existing.hospitalization || {}), dischargeDisposition: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition', code: { '01': 'home', '02': 'other-hcf', '03': 'snf', '07': 'aadvice', '20': 'exp' }[disp] || 'oth', display: disp }] } } } : {}) };
  return { summary: `Encounter ${visit} finished`, bundle: { resourceType: 'Bundle', type: 'transaction', entry: [{ request: { method: 'PUT', url: 'Encounter/' + existing.id, ifMatch: `W/"${existing.meta.versionId}"` }, resource: enc }] } };
}

const SR_STATUS = { NW: 'active', SC: 'active', XO: 'active', CA: 'revoked', OC: 'revoked', DC: 'revoked', HD: 'on-hold', CM: 'completed' };
export function mapOrmO01(msg){
  if (!msg.seg('PID')) throw new Hl7Error('PID segment missing', { code: '100', loc: 'PID' });
  const obrs = msg.all('OBR'); if (!obrs.length) throw new Hl7Error('OBR segment missing', { code: '100', loc: 'OBR' });
  const pt = patientEntry(msg, 'create'); const orcs = msg.all('ORC'); const entries = [pt.entry]; const ids = [];
  obrs.forEach((obr, i) => {
    const orc = orcs[i] || orcs[0]; const n = i + 1;
    const placer = need(msg.get('OBR-2.1', obr) || (orc && msg.get('ORC-2.1', orc)), `OBR^${n}^2`, 'Placer order number OBR-2/ORC-2');
    const ctl = orc ? msg.get('ORC-1', orc) : 'NW'; const status = SR_STATUS[ctl || 'NW']; if (!status) throw new Hl7Error('ORC-1 order control "' + ctl + '" is not supported', { code: '103', loc: `ORC^${n}^1` });
    const code = cwe(msg, 'OBR-4', obr); if (!code.coding) throw new Hl7Error('Universal service ID OBR-4 is required', { code: '101', loc: `OBR^${n}^4` });
    const reqBy = orc ? [msg.get('ORC-12.3', orc), msg.get('ORC-12.2', orc)].filter(Boolean).join(' ') : '';
    const sr = clean({ resourceType: 'ServiceRequest', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] },
      identifier: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'PLAC' }] }, system: SYS.placer, value: placer }],
      status, intent: 'order', priority: { S: 'stat', A: 'asap', R: 'routine' }[msg.get('OBR-5', obr) || msg.get('ORC-7.6', orc) || 'R'] || 'routine',
      category: [{ coding: [{ system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure' }] }],
      code, subject: { reference: pt.ref }, authoredOn: tsToFhir(orc ? msg.get('ORC-9', orc) : '') || undefined,
      requester: reqBy ? { display: 'Dr. ' + reqBy } : undefined });
    entries.push({ fullUrl: uuid(), resource: sr, request: { method: 'PUT', url: condUrl('ServiceRequest', SYS.placer, placer) } }); ids.push(placer);
  });
  return { summary: `ServiceRequest ${ids.join(', ')} for Patient ${pt.mrn}`, bundle: { resourceType: 'Bundle', type: 'transaction', entry: entries } };
}

const OBS_STATUS = { F: 'final', C: 'corrected', P: 'preliminary', R: 'registered', I: 'registered', X: 'cancelled', D: 'entered-in-error', W: 'entered-in-error' };
const DR_STATUS = { F: 'final', C: 'corrected', P: 'preliminary', R: 'registered', I: 'registered', X: 'cancelled', A: 'partial' };
const INTERP = { H: 'High', L: 'Low', N: 'Normal', HH: 'Critical high', LL: 'Critical low', A: 'Abnormal', AA: 'Critical abnormal' };
// lookup(placer) -> 'ServiceRequest/id' | null, supplied by the engine (search before building the bundle)
export function mapOruR01(msg, { basedOn = {} } = {}){
  if (!msg.seg('PID')) throw new Hl7Error('PID segment missing', { code: '100', loc: 'PID' });
  const pt = patientEntry(msg, 'create'); const entries = [pt.entry]; const reports = [];
  // group OBX under their preceding OBR
  const groups = []; for (const s of msg.segs){ if (s.name === 'OBR') groups.push({ obr: s, obx: [] }); else if (s.name === 'OBX' && groups.length) groups[groups.length - 1].obx.push(s); }
  if (!groups.length) throw new Hl7Error('OBR segment missing', { code: '100', loc: 'OBR' });
  groups.forEach((g, gi) => {
    const n = gi + 1; const placer = msg.get('OBR-2.1', g.obr); const filler = need(msg.get('OBR-3.1', g.obr), `OBR^${n}^3`, 'Filler order number OBR-3');
    if (!g.obx.length) throw new Hl7Error('No OBX results under OBR ' + n, { code: '100', loc: `OBX` });
    const code = cwe(msg, 'OBR-4', g.obr); const when = tsToFhir(msg.get('OBR-7', g.obr)) || undefined; const issued = tsToFhir(msg.get('OBR-22', g.obr)); const rs = msg.get('OBR-25', g.obr) || 'F';
    const obsRefs = [];
    g.obx.forEach((obx, oi) => {
      const setId = msg.get('OBX-1', obx) || String(oi + 1); const vt = msg.get('OBX-2', obx); const raw = msg.get('OBX-5', obx);
      const oc = cwe(msg, 'OBX-3', obx); if (!oc.coding) throw new Hl7Error('Observation identifier OBX-3 is required', { code: '101', loc: `OBX^${oi + 1}^3` });
      let value = {};
      if (vt === 'NM'){ const num = Number(raw); if (raw === '' || !Number.isFinite(num)) throw new Hl7Error(`OBX-5 value "${raw}" is not numeric (OBX-2 = NM)`, { code: '102', loc: `OBX^${oi + 1}^5` });
        const unit = msg.get('OBX-6.1', obx); value = { valueQuantity: clean({ value: num, unit: msg.get('OBX-6.2', obx) || unit, system: unit ? 'http://unitsofmeasure.org' : undefined, code: unit }) }; }
      else if (raw) value = { valueString: raw };
      const flag = msg.get('OBX-8', obx).toUpperCase(); const st = OBS_STATUS[msg.get('OBX-11', obx) || rs] || 'final';
      const range = msg.get('OBX-7', obx); const rm = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(range); const unit = msg.get('OBX-6.1', obx);
      const full = uuid(); obsRefs.push({ reference: full });
      entries.push({ fullUrl: full, request: { method: 'PUT', url: condUrl('Observation', SYS.filler, filler + '-' + setId) }, resource: clean({ resourceType: 'Observation', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] },
        identifier: [{ system: SYS.filler, value: filler + '-' + setId }], status: st,
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
        code: oc, subject: { reference: pt.ref }, effectiveDateTime: when, issued: issued ? new Date(issued).toISOString() : undefined, ...value,
        interpretation: INTERP[flag] ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: flag, display: INTERP[flag] }] }] : [],
        referenceRange: range ? [rm ? clean({ low: { value: +rm[1], unit, system: unit ? 'http://unitsofmeasure.org' : undefined, code: unit }, high: { value: +rm[2], unit, system: unit ? 'http://unitsofmeasure.org' : undefined, code: unit }, text: range }) : { text: range }] : [] }) });
    });
    const sr = placer && basedOn[placer];
    entries.push({ fullUrl: uuid(), request: { method: 'PUT', url: condUrl('DiagnosticReport', SYS.filler, filler) }, resource: clean({ resourceType: 'DiagnosticReport', meta: { tag: [{ system: 'urn:ackharbor:sandbox', code: 'synthetic' }] },
      identifier: [{ system: SYS.filler, value: filler }, ...(placer ? [{ system: SYS.placer, value: placer }] : [])],
      basedOn: sr ? [{ reference: sr }] : [], status: DR_STATUS[rs] || 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      code, subject: { reference: pt.ref }, effectiveDateTime: when, issued: issued ? new Date(issued).toISOString() : undefined, result: obsRefs }) });
    reports.push(filler + ' (' + g.obx.length + ' results)');
  });
  return { summary: `DiagnosticReport ${reports.join(', ')} for Patient ${pt.mrn}`, bundle: { resourceType: 'Bundle', type: 'transaction', entry: entries } };
}
