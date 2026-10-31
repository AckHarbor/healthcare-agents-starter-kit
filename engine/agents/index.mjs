// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Extra CLI commands for agents.mjs
import fs from 'node:fs'; import path from 'node:path';
import * as C from './clinic.mjs'; import { explainReportById } from './lab-explainer.mjs'; import { explainAck } from '../lib/support.mjs'; import { handleMessage } from '../lib/engine.mjs'; import { parse } from '../lib/hl7.mjs'; import { findPatient } from '../lib/scheduling.mjs';
const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
import { aiExplainAck, aiExplainReport } from './ai-tasks.mjs';
export function commands(fhir, args, ai){
  const text = args.join(' ');
  return {
    intake: () => C.intakeAgent(fhir, C.loadForm(args[0] || path.join(DIR, 'samples/intake-form.json'))),
    refer: () => C.referralAgent(fhir, text),
    eligibility: async () => { const r = await C.eligibilityAgent(fhir, args[0]); return { ...r, print: process.env.AH_SHOW_X12 ? r.x270 + '\n\n' + r.x271 : undefined }; },
    priorauth: () => C.priorAuthAgent(fhir, args[0]),
    refill: () => C.refillAgent(fhir, text),
    discharge: () => C.dischargeAgent(fhir, fs.readFileSync(args[0] || path.join(DIR, 'samples/adt-a03.hl7'), 'utf8')),
    'explain-lab': async () => { const p = await findPatient(fhir, args[0]); const [dr] = p ? await fhir.search(`DiagnosticReport?subject=Patient/${p.id}&_sort=-_lastUpdated&_count=1`, 1) : []; if (!dr) return { ok: false, say: 'No lab report for ' + args[0] };
      const obs = await Promise.all((dr.result || []).map(x => fhir.get(x.reference))); const e = await aiExplainReport(ai, dr, obs);
      return { ok: true, say: (e.source === 'rules' ? '' : `[${e.source}] `) + e.summary + (e.aiNote ? ` (${e.aiNote})` : ''), print: e.lines.map(l => '- ' + l).join('\n') + '\n' + e.note }; },
    // 8) interface support agent: run a message through the engine logic (dry: against the same local server) and explain the ACK
    'explain-ack': async () => { const raw = fs.readFileSync(args[0], 'utf8'); const ack = parse(raw).type.code === 'ACK' ? raw : await handleMessage(raw, { fhir }); const e = await aiExplainAck(ai, ack); return { ok: true, say: (e.source === 'rules' ? '' : `[${e.source}] `) + e.text + (e.aiNote ? `\n(AI not used: ${e.aiNote})` : '') }; },
  };
}
