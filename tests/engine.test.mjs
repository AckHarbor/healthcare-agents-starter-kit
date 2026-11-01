// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// AckHarbor(TM) Harbor Engine prototype tests (interface-engine/). Synthetic data only.
// Unit tests always run. Live tests run when a local FHIR server answers at AH_FHIR_BASE (default http://127.0.0.1:8090/fhir);
// start it with interface-engine/scripts/start-hapi.sh. Nothing here leaves 127.0.0.1.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { parse, buildAck, tsToFhir } from '../engine/lib/hl7.mjs';
import { mapAdtA01 } from '../engine/lib/map.mjs';
import { handleMessage, startMllpServer, sendMllp } from '../engine/lib/engine.mjs';
import { fhirClient } from '../engine/lib/fhir.mjs';
import { explainAck } from '../engine/lib/support.mjs';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../engine/samples');
const sample = f => fs.readFileSync(path.join(D, f), 'utf8');
const BASE = process.env.AH_FHIR_BASE || 'http://127.0.0.1:8090/fhir';
const live = await fetch(BASE + '/metadata', { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false);
const ackOf = a => parse(a).get('MSA-1');

test('A01 maps PID -> Patient and PV1 -> Encounter referencing the Patient', () => {
  const { bundle } = mapAdtA01(parse(sample('adt-a01.hl7')));
  const [p, e] = bundle.entry; assert.equal(bundle.type, 'transaction');
  assert.equal(p.resource.resourceType, 'Patient'); assert.equal(p.resource.name[0].family, 'SAMPLE'); assert.equal(p.resource.birthDate, '1985-02-14'); assert.equal(p.resource.gender, 'female');
  assert.equal(e.resource.resourceType, 'Encounter'); assert.equal(e.resource.subject.reference, p.fullUrl); assert.equal(e.resource.class.code, 'IMP');
  assert.equal(e.resource.period.start, '2026-10-31T08:00:00-04:00'); assert.match(e.request.url, /^Encounter\?identifier=/);
});
test('missing PID-3 -> AE with ERR at PID^1^3 code 101 (no server call)', async () => {
  let called = 0; const a = await handleMessage(sample('adt-a01-missing-mrn.hl7'), { fhir: { transaction: async () => { called++; } } });
  assert.equal(ackOf(a), 'AE'); assert.equal(called, 0); const m = parse(a);
  assert.equal(m.get('ERR-2'), 'PID^1^3'); assert.equal(m.get('ERR-3.1'), '101'); assert.equal(m.get('MSA-2'), 'SYNA01000002');
  assert.match(explainAck(a), /patient identifier \/ MRN \(PID-3\)/);
});
test('FHIR server down -> AE with ERR code 207', async () => {
  const a = await handleMessage(sample('adt-a01.hl7'), { fhir: fhirClient('http://127.0.0.1:9/fhir', { timeoutMs: 2000 }) });
  assert.equal(ackOf(a), 'AE'); assert.equal(parse(a).get('ERR-3.1'), '207');
});
test('unsupported message type -> AR', async () => {
  const a = await handleMessage('MSH|^~\\&|X|Y|Z|W|20261031||MDM^T02|SYN1|P|2.5.1\rPID|1||SYN-1||TEST^ONE', { fhir: {} });
  assert.equal(ackOf(a), 'AR'); assert.equal(parse(a).get('ERR-3.1'), '200');
});
test('ACK structure and timestamps', () => {
  const m = parse(sample('adt-a01.hl7')); const a = parse(buildAck(m, 'AA', { text: 'ok' }));
  assert.equal(a.get('MSH-9.1'), 'ACK'); assert.equal(a.get('MSH-9.2'), 'A01'); assert.equal(a.get('MSH-5'), 'DEMOEHR'); assert.equal(a.get('MSA-2'), 'SYNA01000001');
  assert.equal(tsToFhir('19850214', { dateOnly: true }), '1985-02-14'); assert.equal(tsToFhir('202610310800-0400'), '2026-10-31T08:00:00-04:00');
});

test('live: A01 over MLLP returns AA; Patient + Encounter retrievable by GET', { skip: !live && 'local FHIR server not running' }, async () => {
  const fhir = fhirClient(BASE); const srv = await startMllpServer({ port: 0, fhir, logFile: '' }); process.env.AH_QUIET = '1';
  try {
    const a = await sendMllp(sample('adt-a01.hl7'), { port: srv.address().port }); assert.equal(ackOf(a), 'AA', a);
    const p = await fhir.search('Patient?identifier=urn:ackharbor:sandbox:mrn%7CSYN-100001'); assert.equal(p.length, 1);
    const e = await fhir.search('Encounter?identifier=urn:ackharbor:sandbox:visit%7CSYN-V-500001'); assert.equal(e.length, 1);
    assert.equal(e[0].subject.reference, 'Patient/' + p[0].id);
    const again = await sendMllp(sample('adt-a01.hl7'), { port: srv.address().port }); assert.equal(ackOf(again), 'AA'); // idempotent re-send
    assert.equal((await fhir.search('Patient?identifier=urn:ackharbor:sandbox:mrn%7CSYN-100001')).length, 1);
  } finally { srv.close(); }
});

// ---- Milestone 2: scheduling agent + SIU; Milestone 3: lab flow ----
import { parseRequest, seed, findPractitioner, freeSlots } from '../engine/lib/scheduling.mjs';
import { scheduleAgent, rescheduleAgent, reminderAgent } from '../engine/agents/scheduling.mjs';
import { mapOrmO01, mapOruR01 } from '../engine/lib/map.mjs';
import { explainReport, NOTE } from '../engine/agents/lab-explainer.mjs';

test('free kit: booking, request parsing and the scheduling agents say clearly they are built in the course', async () => {
  assert.throws(() => parseRequest('book SYN-100001 with Dr. Rivera'), e => e.code === 'COURSE_ONLY' && /Module 4/.test(e.message));
  for (const f of [scheduleAgent, rescheduleAgent, reminderAgent]){ const r = await f(); assert.equal(r.ok, false); assert.equal(r.courseOnly, true); assert.match(r.say, /Module 4/); }
});
test('ORM^O01 -> ServiceRequest; ORU^R01 -> Observations + DiagnosticReport linked to Patient', () => {
  const o = mapOrmO01(parse(sample('orm-o01.hl7'))).bundle.entry; assert.equal(o[1].resource.resourceType, 'ServiceRequest'); assert.equal(o[1].resource.subject.reference, o[0].fullUrl); assert.equal(o[1].resource.code.coding[0].code, '2345-7'); assert.equal(o[1].resource.requester.display, 'Dr. ALEX RIVERA');
  const r = mapOruR01(parse(sample('oru-r01.hl7')), { basedOn: { 'SYN-ORD-7001': 'ServiceRequest/1' } }).bundle.entry;
  const obs = r.filter(e => e.resource.resourceType === 'Observation'), dr = r.find(e => e.resource.resourceType === 'DiagnosticReport');
  assert.equal(obs.length, 2); assert.equal(obs[0].resource.valueQuantity.value, 182); assert.equal(obs[0].resource.interpretation[0].coding[0].code, 'H');
  assert.deepEqual(dr.resource.result.map(x => x.reference), obs.map(x => x.fullUrl)); assert.equal(dr.resource.subject.reference, r[0].fullUrl); assert.equal(dr.resource.basedOn[0].reference, 'ServiceRequest/1');
});
test('ORU with non-numeric NM value -> AE 102 at OBX^1^5', async () => {
  const a = await handleMessage(sample('oru-r01-bad-value.hl7'), { fhir: { search: async () => [] } }); assert.equal(ackOf(a), 'AE'); assert.equal(parse(a).get('ERR-2'), 'OBX^1^5'); assert.equal(parse(a).get('ERR-3.1'), '102');
});
test('lab explainer: range wording, no diagnosis, always the talk-to-your-doctor note', () => {
  const e = explainReport({ code: { text: 'Panel' }, status: 'final' }, [{ code: { coding: [{ code: '2345-7' }] }, valueQuantity: { value: 182, unit: 'mg/dL' }, referenceRange: [{ low: { value: 70 }, high: { value: 99 }, text: '70-99' }] }]);
  assert.match(e.lines[0], /above the lab's usual range/); assert.equal(e.note, NOTE); assert.doesNotMatch(JSON.stringify(e), /diabet|disease|you have/i);
});

test('live: seed is idempotent and leaves free Slots; SIU for an unknown appointment -> AE 204; lab ORM/ORU AA', { skip: !live && 'local FHIR server not running' }, async () => {
  const fhir = fhirClient(BASE); process.env.AH_QUIET = '1'; process.env.AH_AGENT_LOG = '/tmp/ah-test-agent-log.jsonl';
  const srv = await startMllpServer({ port: 0, fhir, logFile: '' }); const port = srv.address().port; const send = m => sendMllp(m, { port });
  try {
    assert.equal(ackOf(await send(sample('adt-a01.hl7'))), 'AA');
    await seed(fhir, { days: 7 }); const prac = await findPractitioner(fhir, { name: 'Lee' }); const start = new Date(Date.now() + 86400000), end = new Date(start.getTime() + 6 * 86400000);
    const before = (await freeSlots(fhir, prac.schedule, start, end, 500)).length; await seed(fhir, { days: 7 }); // idempotent
    assert.equal((await freeSlots(fhir, prac.schedule, start, end, 500)).length, before);
    const na = await send('MSH|^~\\&|ACKHARBOR_SCHED|ACKHARBOR|ACKHARBOR_ENGINE|ACKHARBOR|20261031090000||SIU^S12^SIU_S12|SYNSIU0000405|P|2.5.1\rSCH|SYN-APT-NOPE^ACKHARBOR\rPID|1||SYN-100001^^^ACKHARBOR^MR||SAMPLE^AVERY\r');
    assert.equal(ackOf(na), 'AE'); assert.equal(parse(na).get('ERR-3.1'), '204');
    assert.equal(ackOf(await send(sample('orm-o01.hl7'))), 'AA'); assert.equal(ackOf(await send(sample('oru-r01.hl7'))), 'AA');
    const [dr] = await fhir.search('DiagnosticReport?identifier=urn:ackharbor:sandbox:filler-order%7CSYN-LAB-9001'); assert.equal(dr.result.length, 2); assert.match(dr.basedOn[0].reference, /^ServiceRequest\//);
    const p = (await fhir.search('Patient?identifier=urn:ackharbor:sandbox:mrn%7CSYN-100001'))[0]; assert.equal(dr.subject.reference, 'Patient/' + p.id);
  } finally { srv.close(); }
});

// ---- Clinic agents: intake, referral, eligibility, prior auth, refill, discharge, support ----
import * as C from '../engine/agents/clinic.mjs';
test('X12 270 -> mock payer 271 (active member EB*1; unknown member AAA 75); reading the 271 is built in the course', () => {
  const p = { name: [{ family: 'EXAMPLE', given: ['JORDAN'] }], birthDate: '1979-07-04' };
  const x = C.build270(p, { subscriberId: 'SYN-MBR-55501', payor: [{ display: 'Sandbox Health Plan' }] }, { date: new Date(2026, 9, 31, 9, 0), ctl: '000000001' });
  assert.match(x, /^ISA\*/); assert.match(x, /ST\*270\*0001\*005010X279A1~/); assert.match(x, /NM1\*IL\*1\*EXAMPLE\*JORDAN\*{4}MI\*SYN-MBR-55501~/); assert.match(x, /EQ\*30~/);
  assert.match(C.mockPayer271(x), /EB\*1\*IND\*30\*\*GOLD PPO \(SYNTHETIC\)~/); assert.match(C.mockPayer271(x.replace('SYN-MBR-55501', 'XYZ123')), /AAA\*Y\*\*75\*C~/);
  assert.throws(() => C.parse271('ST*271~'), e => e.code === 'COURSE_ONLY');
});
test('A01 with IN1 -> Coverage; A03 without prior Encounter -> AE 204', async () => {
  const { bundle } = mapAdtA01(parse(sample('adt-a01.hl7'))); const c = bundle.entry.find(e => e.resource.resourceType === 'Coverage');
  assert.equal(c.resource.subscriberId, 'SYN-MBR-55500'); assert.equal(c.resource.beneficiary.reference, bundle.entry[0].fullUrl); assert.equal(c.resource.relationship.coding[0].code, 'self');
  const a = await handleMessage(sample('adt-a03.hl7'), { fhir: { search: async () => [] } }); assert.equal(ackOf(a), 'AE'); assert.equal(parse(a).get('ERR-3.1'), '204');
});
test('free kit: the six clinic agents say clearly they are built in the course', async () => {
  for (const f of [C.intakeAgent, C.referralAgent, C.eligibilityAgent, C.priorAuthAgent, C.refillAgent, C.dischargeAgent]){ const r = await f(); assert.equal(r.ok, false); assert.equal(r.courseOnly, true); assert.match(r.say, /Module 5/); }
});
