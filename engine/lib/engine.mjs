// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// AckHarbor(TM) Harbor Engine prototype: route inbound HL7 v2 messages to FHIR R4 on a local server and answer with an ACK.
// Routes: ADT^A01/A04 -> Patient + Encounter (+ Coverage from IN1); ADT^A03 -> Encounter finished; ORM^O01 -> ServiceRequest; ORU^R01 -> Observation(s) + DiagnosticReport;
// SIU^S12/S14/S15 -> confirms the Appointment the scheduling agent booked exists in the EMR with the matching status.
import net from 'node:net'; import fs from 'node:fs';
import { parse, buildAck, frame, deframer, Hl7Error } from './hl7.mjs';
import { mapAdtA01, mapAdtA03, mapOrmO01, mapOruR01, SYS } from './map.mjs';
import { fhirClient, FhirError } from './fhir.mjs';

const ROUTES = {
  'ADT^A01': async (msg) => mapAdtA01(msg),
  'ADT^A04': async (msg) => mapAdtA01(msg, { event: 'A04' }),
  'ADT^A03': async (msg, fhir) => { const v = msg.get('PV1-19.1'); const [e] = v ? await fhir.search(`Encounter?identifier=${encodeURIComponent(SYS.visit + '|' + v)}`) : []; return mapAdtA03(msg, e); },
  'ORM^O01': async (msg) => mapOrmO01(msg),
  'ORU^R01': async (msg, fhir) => {
    const basedOn = {};
    for (const obr of msg.all('OBR')){ const p = msg.get('OBR-2.1', obr); if (!p) continue;
      const hits = await fhir.search(`ServiceRequest?identifier=${encodeURIComponent(SYS.placer + '|' + p)}&_elements=id`); if (hits[0]) basedOn[p] = 'ServiceRequest/' + hits[0].id; }
    return mapOruR01(msg, { basedOn });
  },
};
const SIU_STATUS = { S12: ['booked'], S13: ['booked'], S14: ['booked'], S15: ['cancelled'], S17: ['cancelled', 'entered-in-error'] };

export async function handleMessage(text, { fhir = fhirClient(), log = null } = {}){
  let msg = null; const t0 = Date.now();
  const done = (ack, opts) => { const out = buildAck(msg, ack, opts); if (log) log({ at: new Date().toISOString(), type: msg ? msg.type.code + '^' + msg.type.event : '?', control: msg?.controlId, ack, text: opts.text || opts.err?.message, ackText: out, ms: Date.now() - t0 }); return out; };
  try {
    msg = parse(text);
    if (!msg.controlId) throw new Hl7Error('MSH-10 message control ID is required', { code: '101', loc: 'MSH^1^10', ackCode: 'AR' });
    const key = msg.type.code + '^' + msg.type.event;
    if (msg.type.code === 'SIU') return done('AA', { text: await confirmSiu(msg, fhir) });
    const route = ROUTES[key];
    if (!route) throw new Hl7Error(`Message type ${key} is not routed by this engine`, { code: ROUTES[msg.type.code + '^A01'] || msg.type.code === 'ADT' ? '201' : '200', loc: 'MSH^1^9', ackCode: 'AR' });
    const { bundle, summary } = await route(msg, fhir);
    const resp = await fhir.transaction(bundle);
    const where = (resp.entry || []).map(e => (e.response?.location || '').replace(/\/_history\/.*/, '')).filter(Boolean);
    return done('AA', { text: `Accepted: ${summary} -> ${where.join(', ')}` });
  } catch (e) {
    if (e instanceof Hl7Error) return done(e.ackCode || 'AE', { err: e });
    if (e instanceof FhirError) return done('AE', { err: new Hl7Error(e.message, { code: e.status === 0 ? '207' : (e.status === 400 || e.status === 422 ? '102' : '207') }) });
    return done('AE', { err: new Hl7Error('Engine error: ' + e.message, { code: '207' }) });
  }
}

async function confirmSiu(msg, fhir){
  const ev = msg.type.event; const want = SIU_STATUS[ev]; if (!want) throw new Hl7Error('SIU event ' + ev + ' is not supported', { code: '201', loc: 'MSH^1^9^2', ackCode: 'AR' });
  if (!msg.seg('SCH')) throw new Hl7Error('SCH segment missing', { code: '100', loc: 'SCH' });
  const id = msg.get('SCH-1.1') || msg.get('SCH-2.1'); if (!id) throw new Hl7Error('Placer appointment ID SCH-1 is required', { code: '101', loc: 'SCH^1^1' });
  const hits = await fhir.search(`Appointment?identifier=${encodeURIComponent(SYS.appt + '|' + id)}`);
  if (!hits.length) throw new Hl7Error(`Appointment ${id} not found in the EMR`, { code: '204', loc: 'SCH^1^1' });
  const a = hits[0]; if (!want.includes(a.status)) throw new Hl7Error(`Appointment ${id} is ${a.status}, expected ${want.join('/')} for SIU^${ev}`, { code: '207', loc: 'SCH^1^25' });
  const mrn = msg.get('PID-3.1'); const pref = a.participant?.find(p => p.actor?.reference?.startsWith('Patient/'))?.actor?.reference;
  if (mrn && pref){ const p = await fhir.get(pref); if (!p.identifier?.some(i => i.system === SYS.mrn && i.value === mrn)) throw new Hl7Error(`PID-3 ${mrn} does not match the Appointment's patient`, { code: '204', loc: 'PID^1^3' }); }
  return `Accepted: SIU ${ev} for Appointment/${a.id} (${a.status}, ${a.start})`;
}

export function startMllpServer({ port = +(process.env.AH_MLLP_PORT || 2575), host = '127.0.0.1', fhir = fhirClient(), logFile = process.env.AH_ENGINE_LOG ?? '/tmp/ackharbor-engine-acks.jsonl' } = {}){
  const log = rec => { if (logFile) fs.appendFileSync(logFile, JSON.stringify(rec) + '\n'); if (!process.env.AH_QUIET) console.log(`[engine] ${rec.type} ${rec.control || ''} -> ${rec.ack} ${rec.text || ''}`); };
  const server = net.createServer(sock => {
    let chain = Promise.resolve(); // one message at a time per connection, ACKs in order
    sock.on('data', deframer(body => { chain = chain.then(async () => { const ack = await handleMessage(body, { fhir, log }); if (!sock.destroyed) sock.write(frame(ack)); }); }));
    sock.on('error', () => {});
  });
  return new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, () => res(server)); });
}

// MLLP client: send one message, resolve with the ACK text
export function sendMllp(text, { port = +(process.env.AH_MLLP_PORT || 2575), host = '127.0.0.1', timeoutMs = 20000 } = {}){
  return new Promise((res, rej) => {
    const s = net.connect(port, host); const t = setTimeout(() => { s.destroy(); rej(new Error('no ACK within ' + timeoutMs + ' ms')); }, timeoutMs);
    s.on('data', deframer(ack => { clearTimeout(t); s.end(); res(ack); }));
    s.on('error', e => { clearTimeout(t); rej(e); });
    s.on('connect', () => s.write(frame(String(text).replace(/\r\n|\n/g, '\r').trim() + '\r')));
  });
}
