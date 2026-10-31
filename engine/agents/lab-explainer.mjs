// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab result plain-language explainer (rule-based). Describes each result against its reference range only.
// It never diagnoses, never suggests treatment, and always ends with a "talk to your doctor" note.
export const NOTE = 'This is general information, not medical advice or a diagnosis. Please talk to your doctor or care team about what these results mean for you.';
const FRIENDLY = { '2345-7': 'Glucose (blood sugar)', '2160-0': 'Creatinine (a kidney function marker)', '718-7': 'Hemoglobin', '2093-3': 'Total cholesterol', '4548-4': 'Hemoglobin A1c' };
export function explainObservation(o){
  const code = o.code?.coding?.[0]?.code; const name = FRIENDLY[code] || o.code?.text || code || 'This test';
  const v = o.valueQuantity; const rr = o.referenceRange?.[0];
  if (!v) return `${name}: ${o.valueString ?? 'no value reported'}.`;
  const val = `${v.value} ${v.unit || ''}`.trim(); const lo = rr?.low?.value, hi = rr?.high?.value; const range = rr?.text || (lo != null && hi != null ? `${lo}-${hi}` : '');
  let where = 'there is no reference range to compare it with';
  if (lo != null && v.value < lo) where = `this is below the lab's usual range (${range})`;
  else if (hi != null && v.value > hi) where = `this is above the lab's usual range (${range})`;
  else if (lo != null || hi != null) where = `this is within the lab's usual range (${range})`;
  return `${name}: ${val}; ${where}.`;
}
export function explainReport(report, observations){
  const lines = observations.map(explainObservation); const out = lines.some(l => /above|below/.test(l));
  return { summary: `${report.code?.text || 'Lab report'} (${report.status}): ${observations.length} result(s)` + (out ? ', some outside the usual range.' : ', all within the usual range.'), lines, note: NOTE };
}
export async function explainReportById(fhir, id){
  const r = await fhir.get('DiagnosticReport/' + id); const obs = await Promise.all((r.result || []).map(x => fhir.get(x.reference))); return explainReport(r, obs);
}
