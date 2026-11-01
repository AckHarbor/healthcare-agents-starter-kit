// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Scheduling agent, reminder agent and reschedule agent: built in Module 4 of the AckHarbor(TM) Healthcare Agents Course.
// The free kit keeps emit() (send an SIU through the engine and read the ACK) so you can wire your own agent to it.
import { sendMllp } from '../lib/engine.mjs'; import { parse } from '../lib/hl7.mjs'; import { notIncluded } from '../lib/course-only.mjs';
export const COURSE_ONLY = true;
export async function emit(siu, { send = sendMllp } = {}){ const ack = await send(siu); const a = parse(ack); return { ack, code: a.get('MSA-1'), text: a.get('MSA-3') }; }
export async function scheduleAgent(){ return notIncluded('The scheduling agent', 'Module 4'); }
export async function rescheduleAgent(){ return notIncluded('The reschedule agent', 'Module 4'); }
export async function reminderAgent(){ return notIncluded('The reminder agent', 'Module 4'); }
