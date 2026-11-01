// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 2 "Map it" - complete the TODOs, then run: node checks/check-m2.mjs
// These are the small, reusable mapping rules every HL7 v2 -> FHIR R4 channel needs.
// Write your own version of each rule, then run the check.
const TODO = m => { const e = new Error(m); e.code = 'TODO'; throw e; };
export class MapError extends Error { constructor(msg, code, loc){ super(msg); this.code = code; this.loc = loc; } } // code = HL7 table 0357 (101, 102, 103)

// PID-7 / any HL7 DT or TS -> FHIR date. '19850214' -> '1985-02-14', '198502' -> '1985-02', '' -> undefined.
// Anything that is not 4, 6 or 8+ digits is invalid: throw new MapError(..., '102', 'PID^1^7').
export function hl7DateToFhir(ts){
  TODO('hl7DateToFhir');
}

// PID-8 administrative sex (HL7 table 0001) -> Patient.gender. M male, F female, O other, U unknown, A other, N unknown.
// '' -> undefined. Anything else: throw new MapError(..., '103', 'PID^1^8').
export function mapGender(code){
  TODO('mapGender');
}

// PV1-2 patient class (HL7 table 0004) -> Encounter.class coding (system http://terminology.hl7.org/CodeSystem/v3-ActCode).
// I -> IMP 'inpatient encounter', O -> AMB 'ambulatory', E -> EMER 'emergency', P -> PRENC 'pre-admission'.
// Return { system, code, display }. Unknown: throw new MapError(..., '103', 'PV1^1^2').
export function mapPatientClass(pv1_2){
  TODO('mapPatientClass');
}

// OBX-2 value type + OBX-5 value + OBX-6 units -> the Observation value[x] part.
// NM -> { valueQuantity: { value: <number>, unit, system: 'http://unitsofmeasure.org', code: unit } } (omit unit/system/code when no unit).
// NM with a non-numeric value ('high') -> throw new MapError(..., '102', 'OBX^1^5').
// Any other type (ST, TX, CWE...) -> { valueString: value }.
export function obxValue(type, value, unit){
  TODO('obxValue');
}

// OBX-8 abnormal flag -> Observation.interpretation coding (system http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation).
// H High, L Low, N Normal, A Abnormal, HH Critical high, LL Critical low. '' -> undefined.
export function interpretation(flag){
  TODO('interpretation');
}
