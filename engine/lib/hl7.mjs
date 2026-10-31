// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Minimal HL7 v2 toolkit for the AckHarbor(TM) Harbor Engine prototype: parse, escape, ACK, MLLP framing.
// No dependencies. Educational/prototype use with synthetic data only.
export const VT = 0x0b, FS = 0x1c, CR = 0x0d;

export function parse(text){
  const raw = String(text).replace(/\r\n|\n/g, '\r').replace(/^\uFEFF/, '').trim();
  if (!raw.startsWith('MSH')) throw new Hl7Error('Message does not start with MSH', { code: '100', loc: 'MSH^1' });
  const fs = raw[3], enc = raw.slice(4, 8); const [cs, rs, esc, ss] = enc;
  const segs = raw.split('\r').filter(Boolean).map(line => {
    const f = line.split(fs); const name = f[0];
    // MSH-1 is the field separator itself, so MSH fields are shifted by one.
    const fields = name === 'MSH' ? ['MSH', fs, ...f.slice(1)] : f;
    return { name, fields };
  });
  const msg = { raw, segs, sep: { fs, cs, rs, esc, ss } };
  msg.all = name => segs.filter(s => s.name === name);
  msg.seg = name => segs.find(s => s.name === name);
  // get('PID-5.2') or get('PID-5.2', segObj); first repetition only
  msg.get = (path, seg) => {
    const m = /^([A-Z0-9]{3})-(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(path); if (!m) throw new Error('bad path ' + path);
    const s = seg || msg.seg(m[1]); if (!s) return '';
    let v = s.fields[+m[2]] ?? ''; if (+m[2] !== 2 || m[1] !== 'MSH') v = v.split(rs)[0];
    if (m[3]) v = (v.split(cs)[+m[3] - 1] ?? ''); if (m[4]) v = (v.split(ss)[+m[4] - 1] ?? '');
    return unescape(v, msg.sep);
  };
  msg.type = { code: msg.get('MSH-9.1'), event: msg.get('MSH-9.2') };
  msg.controlId = msg.get('MSH-10');
  return msg;
}

export function unescape(v, { fs = '|', cs = '^', rs = '~', esc = '\\', ss = '&' } = {}){
  if (!v || !v.includes(esc)) return v;
  const map = { F: fs, S: cs, R: rs, E: esc, T: ss };
  return v.replace(new RegExp('\\' + esc + '([FSRET])\\' + esc, 'g'), (_, k) => map[k]).replace(new RegExp('\\' + esc + '\\.br\\' + esc, 'g'), '\n');
}
export function escape(v){
  return String(v ?? '').replace(/\\/g, '\\E\\').replace(/\|/g, '\\F\\').replace(/\^/g, '\\S\\').replace(/~/g, '\\R\\').replace(/&/g, '\\T\\').replace(/[\r\n]+/g, ' ');
}

export class Hl7Error extends Error {
  // code: HL7 table 0357 (100 segment sequence, 101 required field missing, 102 data type, 103 table value not found,
  // 200 unsupported message type, 201 unsupported event, 204 unknown key identifier, 207 application internal error)
  constructor(message, { code = '207', loc = '', ackCode = 'AE' } = {}){ super(message); this.code = code; this.loc = loc; this.ackCode = ackCode; }
}
const ERR_TEXT = { '100': 'Segment sequence error', '101': 'Required field missing', '102': 'Data type error', '103': 'Table value not found', '200': 'Unsupported message type', '201': 'Unsupported event code', '204': 'Unknown key identifier', '207': 'Application internal error' };

export function hl7Now(d = new Date()){
  const p = n => String(n).padStart(2, '0'); const off = -d.getTimezoneOffset(); const s = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
}
let seq = 0; export const newControlId = (prefix = 'AH') => prefix + Date.now().toString(36).toUpperCase() + (++seq).toString(36).toUpperCase();

// Builds an HL7 v2.5.1 ACK for msg. ack = 'AA' | 'AE' | 'AR'. err = Hl7Error (optional).
export function buildAck(msg, ack, { text = '', err = null, app = 'ACKHARBOR_ENGINE', fac = 'ACKHARBOR' } = {}){
  const g = p => { try { return escape(msg ? msg.get(p) : ''); } catch { return ''; } };
  const trig = msg ? escape(msg.type.event) : '';
  const msh = ['MSH', '^~\\&', app, fac, g('MSH-3'), g('MSH-4'), hl7Now(), '', `ACK^${trig}^ACK`, newControlId('ACK'), g('MSH-11') || 'P', '2.5.1'].join('|');
  const msa = ['MSA', ack, g('MSH-10'), escape(text || (err ? err.message : ''))].join('|');
  const out = [msh, msa];
  if (err) out.push(['ERR', '', (err.loc || '').replace(/[|~\\&\r\n]/g, ''), `${err.code}^${ERR_TEXT[err.code] || 'Error'}^HL70357`, ack === 'AR' ? 'E' : 'E', '', '', '', escape(err.message)].join('|'));
  return out.join('\r') + '\r';
}

// MLLP framing
export const frame = s => Buffer.concat([Buffer.from([VT]), Buffer.from(s, 'utf8'), Buffer.from([FS, CR])]);
export function deframer(onMessage){
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;){
      const start = buf.indexOf(VT); if (start < 0){ buf = Buffer.alloc(0); return; }
      const end = buf.indexOf(FS, start); if (end < 0 || end + 1 >= buf.length) { buf = buf.slice(start); return; }
      const body = buf.slice(start + 1, end).toString('utf8'); buf = buf.slice(end + (buf[end + 1] === CR ? 2 : 1)); onMessage(body);
    }
  };
}

// HL7 TS (YYYY[MM[DD[HHMM[SS[.S]]]]][+/-ZZZZ]) -> FHIR date / dateTime. Missing offset = engine's local zone.
export function tsToFhir(ts, { dateOnly = false } = {}){
  const m = /^(\d{4})(\d{2})?(\d{2})?(?:(\d{2})(\d{2})(\d{2})?(?:\.\d+)?)?([+-]\d{4})?$/.exec(String(ts || '').trim());
  if (!m) return null; const [, Y, M, D, h, mi, s, z] = m;
  if (dateOnly || !h) return [Y, M, D].filter(Boolean).join('-');
  let off = z; if (!off){ const d = new Date(+Y, +M - 1, +D, +h, +mi, +(s || 0)); const o = -d.getTimezoneOffset(); off = (o >= 0 ? '+' : '-') + String(Math.floor(Math.abs(o) / 60)).padStart(2, '0') + String(Math.abs(o) % 60).padStart(2, '0'); }
  return `${Y}-${M}-${D}T${h}:${mi}:${s || '00'}${off.slice(0, 3)}:${off.slice(3)}`;
}
export function fhirToTs(iso){ // '2026-10-31T09:00:00-04:00' -> '202610310900-0400'
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?/.exec(iso || ''); if (!m) return '';
  const z = !m[7] ? '' : m[7] === 'Z' ? '+0000' : m[7].replace(':', ''); return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6] || '00'}${z}`;
}
