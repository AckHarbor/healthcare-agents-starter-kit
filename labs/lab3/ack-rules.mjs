// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 3 "NACK detective" - complete the TODOs, then run: node checks/check-m3.mjs
const TODO = m => { const e = new Error(m); e.code = 'TODO'; throw e; };

// Decide the ACK for a problem the engine found. Return { ack: 'AA'|'AE'|'AR', code?: '<HL7 table 0357 code>' }.
// problem.kind is one of:
//   'ok'                 -> AA (no code)
//   'required-missing'   -> AE 101      'data-type'      -> AE 102      'bad-code' -> AE 103
//   'unsupported-type'   -> AR 200      'unsupported-event' -> AR 201
//   'unknown-key'        -> AE 204 (the record the message points to does not exist)
//   'server-down'        -> AE 207 (the sender should keep the message and retry)
export function ackFor(problem){
  TODO('ackFor');
}

// Build an HL7 v2.5.1 ERR segment: ERR||<loc>|<code>^<text>^HL70357|E||||<diagnostic>
// Example: errSegment('101', 'PID^1^3', 'Patient identifier PID-3 is required but empty')
//   -> 'ERR||PID^1^3|101^Required field missing^HL70357|E||||Patient identifier PID-3 is required but empty'
// Texts: 101 Required field missing, 102 Data type error, 103 Table value not found, 200 Unsupported message type,
//        201 Unsupported event code, 204 Unknown key identifier, 207 Application internal error.
// Remember to escape | ^ ~ \ & inside the diagnostic text (\F\ \S\ \R\ \E\ \T\).
export function errSegment(code, loc, diagnostic){
  TODO('errSegment');
}

// Should the engine call the FHIR server at all for this problem? (validate before you post)
export function shouldCallServer(problem){
  TODO('shouldCallServer');
}
