#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Capstone rubric (automated part). A person still reviews your README and 2-minute recording.
// Checks: manifest, README sections, synthetic-only data, a good message ACKed AA, a deliberate bad message NACKed as declared,
// agent log entries with approval/would-send, and no key material.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { check, attempt, skip, finish, needStack, send, KIT } from './lib.mjs';
console.log('AckHarbor(TM) Healthcare Agents Course - capstone check (synthetic data only)\n');
const dir = path.join(KIT, 'capstone'); let man = {};
await attempt('capstone/capstone.json is valid and filled in', () => { man = JSON.parse(fs.readFileSync(path.join(dir, 'capstone.json'), 'utf8')); const need = ['title', 'agentName', 'author', 'goodMessage', 'badMessage', 'badExpect', 'run', 'fhirResources', 'humanApproval', 'recording'].filter(k => !man[k] || (Array.isArray(man[k]) && !man[k].length)); return { ok: !need.length && man.author !== 'Your name', detail: need.length ? 'missing: ' + need.join(', ') : man.author === 'Your name' ? 'set "author"' : man.title }; });
await attempt('README has every section (Problem, Design, FHIR resources, HL7 messages, Safety, How to run, Test results)', () => { const t = fs.readFileSync(path.join(dir, 'README.md'), 'utf8'); const miss = ['Problem', 'Design', 'FHIR resources', 'HL7 messages', 'Safety', 'How to run', 'Test results'].filter(s => !new RegExp('^##\\s+' + s, 'mi').test(t)); return { ok: !miss.length && !/<your agent's name>/.test(t), detail: miss.length ? 'missing: ' + miss.join(', ') : /<your agent's name>/.test(t) ? "replace <your agent's name> in the title" : 'ok' }; });
const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })){ const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|js|json|md|hl7|txt|csv)$/.test(e.name)) files.push(p); } }; walk(dir);
await attempt('synthetic data only (IDs SYN-, no SSN, phones 555-01xx, example emails)', () => { const bad = []; for (const f of files){ const t = fs.readFileSync(f, 'utf8');
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(t)) bad.push(path.basename(f) + ': SSN-like');
  for (const m of t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []) if (!/@([\w-]+\.)*example\.(com|org|net)$/i.test(m)) bad.push(path.basename(f) + ': email ' + m);
  for (const p of t.match(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g) || []) if (!/555[-. ]01\d\d$/.test(p)) bad.push(path.basename(f) + ': phone');
  if (f.endsWith('.hl7')) for (const line of t.split(/\r|\n/)) if (line.startsWith('PID')){ const id = line.split('|')[3]?.split('^')[0]; if (id && !/^SYN-/.test(id)) bad.push(path.basename(f) + ': PID-3 ' + id); } }
  return { ok: !bad.length, detail: bad.slice(0, 5).join('; ') || files.length + ' files scanned' }; });
await attempt('no API keys or tokens in capstone files', () => { const hit = files.find(f => /AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}/.test(fs.readFileSync(f, 'utf8'))); return { ok: !hit, detail: hit ? path.basename(hit) : 'clean' }; });
if (await needStack('Capstone live')){
  await attempt('good message is ACKed AA', async () => { const r = await send(fs.readFileSync(path.join(KIT, man.goodMessage), 'utf8')); return { ok: r.code === 'AA', detail: 'got ' + r.code + ' ' + (r.text || '').slice(0, 80) }; });
  await attempt('deliberate bad message gets the NACK you declared', async () => { const r = await send(fs.readFileSync(path.join(KIT, man.badMessage), 'utf8')); return { ok: r.code === man.badExpect.ack && (!man.badExpect.code || r.err?.code === man.badExpect.code), detail: `got ${r.code} ${r.err?.code || ''}, declared ${man.badExpect.ack} ${man.badExpect.code || ''}` }; });
  const log = process.env.AH_AGENT_LOG || '/tmp/ackharbor-agent-log.jsonl'; const mine = (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return {}; } }).filter(r => r.agent === man.agentName);
  check(`agent log has entries from "${man.agentName}" (run: ${man.run})`, mine.length > 0 && mine.some(r => r.kind !== 'started'), mine.length + ' entries');
  check('agent logs a would-send or needs-approval step (a person decides)', mine.some(r => ['would-send', 'needs-approval', 'queued'].includes(r.kind)), [...new Set(mine.map(r => r.kind))].join(', ') || 'none');
}
if (finish('check-capstone')) console.log('Completion code (paste into the course): CAP-' + crypto.createHash('sha256').update(JSON.stringify(man) + new Date().toISOString().slice(0, 10)).digest('hex').slice(0, 12).toUpperCase());
