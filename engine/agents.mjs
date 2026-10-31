#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// AckHarbor(TM) Harbor Engine demo agents (rule-based, local, synthetic data only). Usage: node agents.mjs <agent> [args]
//   seed                                   Practitioners, Schedules, free Slots (next 7 days, closed Sundays)
//   schedule "book SYN-100001 with Dr. Rivera tomorrow morning for follow-up"
//   remind [hours]                         compose reminders (logged as would-send, never sent)
//   reschedule <SYN-APT-...>               move to next free slot + SIU^S14
//   intake [form.json] · refer "SYN-100001 to cardiology for chest pain" · eligibility SYN-100002 · priorauth SYN-100001
//   refill "SYN-100002 lisinopril" · discharge [samples/adt-a03.hl7] · explain-lab SYN-100001 · explain-ack <file.hl7>
import { fhirClient } from './lib/fhir.mjs'; import { seed } from './lib/scheduling.mjs';
import * as S from './agents/scheduling.mjs'; import { createAi, FREE_TIER_NOTICE } from './lib/ai.mjs';
const fhir = fhirClient(); const [cmd, ...args] = process.argv.slice(2); const ai = createAi();
if (ai.enabled) console.error('AI layer ON. ' + FREE_TIER_NOTICE);
const AG = {
  seed: async () => { const r = await seed(fhir); return { say: `Seeded: ${r.created} new resources (${r.entries} checked).` }; },
  schedule: async () => S.scheduleAgent(fhir, args.join(' '), { ai }),
  remind: async () => S.reminderAgent(fhir, { hours: +(args[0] || 48) }),
  reschedule: async () => S.rescheduleAgent(fhir, { apptId: args[0] }),
};
const extra = await import('./agents/index.mjs').then(m => m.commands(fhir, args, ai)).catch(e => { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return {}; });
Object.assign(AG, extra);
if (!AG[cmd]){ console.log('agents: ' + Object.keys(AG).join(', ')); process.exit(cmd && cmd !== 'help' ? 2 : 0); }
try { const r = await AG[cmd](); console.log(r.say); if (r.ack && process.env.AH_SHOW_ACK !== '0') console.log(r.ack.replace(/\r/g, '\n').trim()); if (r.print) console.log(r.print); process.exitCode = r.ok === false ? 1 : 0; }
catch (e) { console.error('Agent error: ' + e.message); process.exitCode = 1; }
