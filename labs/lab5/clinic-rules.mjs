// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 5 "Clinic in a box" - complete the TODOs, then run: node checks/check-m5.mjs
// The rule every function here follows: the agent drafts, a person decides. Nothing clinical or financial goes live on its own.
const TODO = m => { const e = new Error(m); e.code = 'TODO'; throw e; };

// Refill: from the patient's ACTIVE MedicationRequest build a NEW MedicationRequest for clinician review.
//   status 'draft', intent 'order', same subject / medicationCodeableConcept / dosageInstruction,
//   priorPrescription: { reference: 'MedicationRequest/<active.id>' }, and a note that says it is queued for clinician approval.
//   Never copy the id, never status 'active'.
export function refillDraft(active){
  TODO('refillDraft');
}

// Eligibility: read an X12 271 (segments end with ~, elements split by *).
// Return { active: boolean, reject: null | { code } }.
//   active = there is an EB segment with EB01 = '1' (active coverage) AND no AAA segment.
//   AAA*Y**75*C~ -> reject code '75' (subscriber/insured not found).
export function readEligibility(x271){
  TODO('readEligibility');
}

// Discharge follow-up window: from the START of the day after discharge, for 7 days.
// dischargeIso '2026-10-31T15:00:00-04:00' -> { from: Sun 1 Nov 2026 00:00 local, to: Sun 8 Nov 2026 00:00 local }
export function followUpWindow(dischargeIso){
  TODO('followUpWindow');
}

// Prior authorization: a Claim that is a DRAFT request, never a submission.
// Return { resourceType: 'Claim', status: 'draft', use: 'preauthorization', patient, insurance: [{ sequence: 1, focal: true, coverage }], referral }.
export function priorAuthDraft({ patientRef, coverageRef, referralRef }){
  TODO('priorAuthDraft');
}

// Which agent actions may run without a human? Return true only for demo scheduling and would-send notices.
// action: 'book-slot' | 'log-would-send' | 'activate-refill' | 'submit-prior-auth' | 'send-sms' | 'change-coverage'
export function canRunWithoutHuman(action){
  TODO('canRunWithoutHuman');
}
