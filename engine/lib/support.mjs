// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Interface support agent (rule-based, no AI service): explains an ACK/NACK in plain English and suggests the fix.
import { parse } from './hl7.mjs';
const FIELD = {
  'MSH-9': 'message type (MSH-9)', 'MSH-10': 'message control ID (MSH-10)', 'PID-3': 'patient identifier / MRN (PID-3)', 'PID-5': 'patient name (PID-5)',
  'PID-7': 'date of birth (PID-7)', 'PID-8': 'administrative sex (PID-8)', 'PV1-2': 'patient class (PV1-2)', 'PV1-19': 'visit number (PV1-19)',
  'OBR-2': 'placer order number (OBR-2)', 'OBR-3': 'filler order number (OBR-3)', 'OBR-4': 'ordered test code (OBR-4)', 'ORC-1': 'order control code (ORC-1)',
  'OBX-3': 'result code (OBX-3)', 'OBX-5': 'result value (OBX-5)', 'SCH-1': 'placer appointment ID (SCH-1)', 'SCH-25': 'appointment status (SCH-25)' };
const FIX = {
  '100': f => `The message is missing a segment or has them out of order${f ? ' (' + f + ')' : ''}. Check the sending system's message template includes it in the standard order.`,
  '101': f => `A required field is empty: ${f}. In the sender (or an engine transformer), populate ${f.replace(/.*\((.*)\)/, '$1')} before routing.`,
  '102': f => `A value has the wrong format in ${f}. Example fixes: dates as YYYYMMDD, numbers only when OBX-2 = NM (use ST for text like "positive").`,
  '103': f => `${f} holds a code the engine does not recognize. Add a code-table lookup in the channel to translate the sender's local code to the standard HL7 table value.`,
  '200': f => `The engine has no route for this message type. Either add a channel/route for it or filter it out at the sender.`,
  '201': f => `The message type is known but this trigger event is not routed. Add the event to the channel filter or stop sending it.`,
  '204': f => `The engine could not find the record this message points to (${f}). Send the creating message first (for example the booking before the SIU), or correct the identifier.`,
  '207': f => `The destination (local FHIR server) refused or was unreachable. Check it is running (curl http://127.0.0.1:8090/fhir/metadata), then resend from the error queue.`,
};
export function explainAck(ackText){
  const a = parse(ackText); const code = a.get('MSA-1'); const ctl = a.get('MSA-2');
  if (code === 'AA' || code === 'CA') return `Plain English: message ${ctl} was accepted. ${a.get('MSA-3')}`;
  const errs = a.all('ERR'); if (!errs.length) return `Plain English: message ${ctl} was ${code === 'AR' ? 'rejected' : 'not processed'} (${code}): ${a.get('MSA-3')}`;
  return errs.map(e => {
    const seg = a.get('ERR-2.1', e), fld = a.get('ERR-2.3', e); const key = seg && fld ? `${seg}-${fld}` : seg; const f = FIELD[key] || key || 'the message';
    const ec = a.get('ERR-3.1', e); const why = a.get('ERR-8', e) || a.get('MSA-3');
    return `Plain English: message ${ctl} was ${code === 'AR' ? 'rejected (AR: the engine will not accept this kind of message)' : 'not processed (AE: content or destination problem)'}.\n` +
      `Problem: ${why}\nError code: ${ec} ${a.get('ERR-3.2', e)} at ${a.get('ERR-2', e) || 'n/a'}\nSuggested fix: ${(FIX[ec] || (() => 'Review the message against the channel spec.'))(f)}`;
  }).join('\n\n');
}
