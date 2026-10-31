#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 6 "Guardrails": your guardrails against a fixed synthetic prompt set, using a MOCK model ($0, nothing leaves the computer).
import fs from 'node:fs'; import path from 'node:path';
import { check, attempt, finish, read, KIT } from './lib.mjs';
const G = await import('../labs/lab6/guardrails.mjs');
console.log('AckHarbor(TM) Healthcare Agents Course - Lab 6 check (mock model, synthetic data only)\n');
await attempt('containsDiagnosis flags diagnosis / condition / treatment wording', () => ['This is consistent with diabetes.', 'You may have an infection.', 'Your results indicate that you need treatment.', 'You should take medication.', 'The diagnosis is clear.'].every(G.containsDiagnosis));
await attempt('containsDiagnosis allows plain range wording', () => !G.containsDiagnosis("Glucose (blood sugar): 182 mg/dL; this is above the lab's usual range (70-99).") && !G.containsDiagnosis('Creatinine: 0.9 mg/dL; this is within the usual range.'));
await attempt('withDoctorNote adds the note exactly once', () => { const a = G.withDoctorNote('Glucose is above range.'); const b = G.withDoctorNote(a); return a.endsWith(G.DOCTOR_NOTE) && b.split(G.DOCTOR_NOTE).length === 2; });
await attempt('isSyntheticPayload: SYN- data passes; SSN, real-looking MRN, real email, real phone fail', () => G.isSyntheticPayload('Patient SYN-100001, phone 555-0100, a@example.com') && !G.isSyntheticPayload('Patient SYN-100001 SSN 123-45-6789') && !G.isSyntheticPayload('MRN 10028471 glucose 182') && !G.isSyntheticPayload('SYN-100001 jordan@mailbox.invalid') && !G.isSyntheticPayload('SYN-100001 call 973-555-2368'));
const set = JSON.parse(read('labs/lab6/prompt-set.json')).cases; const RULES = "Glucose (blood sugar): 182 mg/dL; this is above the lab's usual range (70-99).";
for (const c of set){
  await attempt(`prompt set "${c.id}" -> ${c.expect}${c.mustNotCall ? ' (model never called)' : ''}`, async () => {
    let calls = 0; const ai = { enabled: true, ask: async () => { calls++; if (c.mock === '__429__') return { ok: false, reason: 'rate-limited' }; return { ok: true, text: c.mock, model: 'mock' }; } };
    const r = await G.explainSafely(ai, c.prompt, RULES);
    const ok = r.source === c.expect && r.text.endsWith(G.DOCTOR_NOTE) && !G.containsDiagnosis(r.text.replace(G.DOCTOR_NOTE, '')) && (!c.mustNotCall || calls === 0);
    return { ok, detail: `source ${r.source}, model calls ${calls}${r.reason ? ', ' + r.reason : ''}` }; });
}
await attempt('kill switch: AI off -> rules, model never called', async () => { let calls = 0; const r = await G.explainSafely({ enabled: false, ask: async () => { calls++; return { ok: true, text: 'x' }; } }, 'SYN-100001 glucose 182', RULES); return { ok: r.source === 'rules' && calls === 0, detail: r.source }; });
// The engine's own AI layer must be OFF by default and must not need a key to run.
await attempt('engine AI layer is OFF by default (no AH_AI=1)', async () => { const { createAi } = await import(path.join(KIT, 'engine/lib/ai.mjs')); return createAi({ env: {} }).enabled === false; });
await attempt('no API key is stored in the kit files', () => { const hits = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })){ const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); } else if (/\.(mjs|js|json|md|sh|txt|env)$/.test(e.name) && /AIza[0-9A-Za-z_-]{20,}/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(KIT, p)); } }; walk(KIT); return { ok: !hits.length, detail: hits.length ? 'key-like text in: ' + hits.join(', ') : 'clean' }; });
finish('check-m6');
