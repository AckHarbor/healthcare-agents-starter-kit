// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 6 "Guardrails" - complete the TODOs, then run: node checks/check-m6.mjs
// This lab costs $0 and sends nothing off your computer: the check uses a MOCK model. A real free-tier model is optional.
// Education only: these guardrails are a teaching pattern, not a compliance program, and not legal or regulatory advice.
const TODO = m => { const e = new Error(m); e.code = 'TODO'; throw e; };
export const DOCTOR_NOTE = 'This is general information, not medical advice or a diagnosis. Please talk to your doctor or care team about what these results mean for you.';

// 1) Output check: true if the text diagnoses, names a condition, or suggests treatment.
//    Must catch at least: "diagnos...", "you have", "you may have", "consistent with", "indicates that you", "diabetes",
//    "infection", "disease", "treatment", "medication", "you should take". Must NOT flag plain range wording such as
//    "Glucose is above the lab's usual range (70-99 mg/dL)."
export function containsDiagnosis(text){
  TODO('containsDiagnosis');
}

// 2) Every patient-facing explanation ends with the doctor note exactly once.
export function withDoctorNote(text){
  TODO('withDoctorNote');
}

// 3) Input check BEFORE anything is sent to a model: true only for synthetic payloads.
//    Synthetic = contains a SYN- identifier (or urn:ackharbor:sandbox), every MRN/member-like id is SYN-prefixed,
//    no SSN-like number (123-45-6789), no phone outside 555-01xx, no email outside example.com/.org/.net.
export function isSyntheticPayload(text){
  TODO('isSyntheticPayload');
}

// 4) The decision: use the AI draft only when everything is OK; otherwise fall back to the rules text.
//    ai = { enabled, ask(prompt) -> Promise<{ ok, text } | { ok:false, reason }> }  (the engine's createAi() shape)
//    Return { text, source: 'AI-assisted' | 'rules', reason? }.
//    Fall back to rules when: the AI is off; the payload is not synthetic (do NOT call ai.ask at all); ask() fails or
//    is rate-limited; the AI text contains a diagnosis. Always run the final text through withDoctorNote().
export async function explainSafely(ai, prompt, rulesText){
  TODO('explainSafely');
}
