// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Clinic agents (intake, referral, eligibility, prior-auth drafter, refill, discharge follow-up): built in Module 5 of the
// AckHarbor(TM) Healthcare Agents Course. The free kit keeps the local mock payer (X12 270 builder and 271 responder) and the
// sample-form loader, so the stack is ready for your own agents. Synthetic data only; nothing ever leaves 127.0.0.1.
import fs from 'node:fs'; import { notIncluded, courseOnly } from '../lib/course-only.mjs';
export const COURSE_ONLY = true;
const pad = n => String(n).padStart(2, '0'); const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// Local mock payer: Coverage -> X12 270, and a rule-based 271 reply. Reading the 271 is Lab 5 (readEligibility).
export function build270(p, cov, { date = new Date(), ctl = String(Date.now()).slice(-9) } = {}){
  const d = ymd(date), t = pad(date.getHours()) + pad(date.getMinutes()); const n = p.name[0];
  return [`ISA*00*          *00*          *ZZ*ACKHARBOR      *ZZ*SANDBOXPAYER   *${d.slice(2)}*${t}*^*00501*${ctl}*0*T*:~`, `GS*HS*ACKHARBOR*SANDBOXPAYER*${d}*${t}*1*X*005010X279A1~`, 'ST*270*0001*005010X279A1~', `BHT*0022*13*${ctl}*${d}*${t}~`,
    'HL*1**20*1~', `NM1*PR*2*${(cov.payor?.[0]?.display || 'PAYER').toUpperCase()}*****PI*${cov.payor?.[0]?.identifier?.value || 'SYNPAYER1'}~`, 'HL*2*1*21*1~', 'NM1*1P*2*ACKHARBOR SANDBOX CLINIC*****XX*0000000000~',
    'HL*3*2*22*0~', `TRN*1*${ctl}*9ACKHARBOR~`, `NM1*IL*1*${n.family}*${(n.given || [])[0] || ''}****MI*${cov.subscriberId}~`, `DMG*D8*${(p.birthDate || '').replace(/-/g, '')}~`, `DTP*291*D8*${d}~`, 'EQ*30~', 'SE*13*0001~', 'GE*1*1~', `IEA*1*${ctl}~`].join('\n');
}
export function mockPayer271(x270){ // rule-based: synthetic member ids starting SYN-MBR are active; everything else is "not found"
  const seg = x270.split(/~\n?/).map(s => s.split('*')); const il = seg.find(s => s[0] === 'NM1' && s[1] === 'IL'); const isa = seg.find(s => s[0] === 'ISA'); const ctl = isa[13]; const member = il?.[9] || '';
  const ok = /^SYN-MBR-\d+$/.test(member); const d = seg.find(s => s[0] === 'DTP')?.[3] || '';
  const body = ok ? ['EB*1*IND*30**GOLD PPO (SYNTHETIC)~', 'EB*B*IND*98***27*25~', 'EB*C*IND*30***23*500~', 'EB*G*IND*30***23*1200~'] : ['AAA*Y**75*C~'];
  return [`ISA*00*          *00*          *ZZ*SANDBOXPAYER   *ZZ*ACKHARBOR      *${d.slice(2)}*1200*^*00501*${ctl}*0*T*:~`, `GS*HB*SANDBOXPAYER*ACKHARBOR*${d}*1200*1*X*005010X279A1~`, 'ST*271*0001*005010X279A1~', `BHT*0022*11*${ctl}*${d}*1200~`, 'HL*1**20*1~', 'NM1*PR*2*SANDBOX HEALTH PLAN*****PI*SYNPAYER1~', 'HL*2*1*21*1~', 'NM1*1P*2*ACKHARBOR SANDBOX CLINIC*****XX*0000000000~', 'HL*3*2*22*0~',
    `NM1*IL*1*${il[3]}*${il[4]}****MI*${member}~`, ...body, `SE*${10 + body.length}*0001~`, 'GE*1*1~', `IEA*1*${ctl}~`].join('\n');
}
export function parse271(){ courseOnly('Reading an X12 271 (parse271)', 'Module 5'); }

export async function intakeAgent(){ return notIncluded('The intake agent', 'Module 5'); }
export async function referralAgent(){ return notIncluded('The referral agent', 'Module 5'); }
export async function eligibilityAgent(){ return notIncluded('The eligibility agent', 'Module 5'); }
export async function priorAuthAgent(){ return notIncluded('The prior authorization drafter', 'Module 5'); }
export async function refillAgent(){ return notIncluded('The refill agent', 'Module 5'); }
export async function dischargeAgent(){ return notIncluded('The discharge follow-up agent', 'Module 5'); }
export const loadForm = f => JSON.parse(fs.readFileSync(f, 'utf8'));
