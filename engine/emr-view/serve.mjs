#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Read-only view of AckHarbor(TM) Demo EMR, the practice EMR for the Harbor Engine demo. Serves index.html, proxies GET-only to the
// local FHIR server, and exposes read-only agent/engine logs. Binds 127.0.0.1. Env: AH_VIEW_PORT (8091), AH_FHIR_BASE.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fhirClient } from '../lib/fhir.mjs'; import { readAgentLog } from '../lib/agentlog.mjs'; import { explainReportById } from '../agents/lab-explainer.mjs'; import { explainAck } from '../lib/support.mjs';
const DIR = path.dirname(new URL(import.meta.url).pathname); const fhir = fhirClient(); const PORT = +(process.env.AH_VIEW_PORT || 8091);
const ENGINE_LOG = process.env.AH_ENGINE_LOG || '/tmp/ackharbor-engine-acks.jsonl';
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'read-only view' });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/index.html'){ res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" }); return res.end(fs.readFileSync(path.join(DIR, 'index.html'))); }
    if (u.pathname.startsWith('/fhir/')){ const r = await fetch(fhir.base + u.pathname.slice(5) + u.search, { headers: { Accept: 'application/fhir+json', 'Cache-Control': 'no-cache' } }); res.writeHead(r.status, { 'Content-Type': 'application/fhir+json' }); return res.end(Buffer.from(await r.arrayBuffer())); }
    if (u.pathname === '/api/agent-log') return json(res, 200, readAgentLog(300));
    if (u.pathname === '/api/engine-log'){ let rows = []; try { rows = fs.readFileSync(ENGINE_LOG, 'utf8').trim().split('\n').filter(Boolean).slice(-200).map(l => JSON.parse(l)).reverse(); } catch {} return json(res, 200, rows.map(r => ({ ...r, explain: r.ackText && r.ack !== 'AA' ? explainAck(r.ackText) : undefined, ackText: undefined }))); }
    const m = u.pathname.match(/^\/api\/explain\/([A-Za-z0-9.-]+)$/); if (m){ const e = await explainReportById(fhir, m[1]); const ai = readAgentLog(500).find(r => r.ai && r.report === 'DiagnosticReport/' + m[1]); return json(res, 200, { ...e, ai: ai ? { summary: ai.say, model: ai.model, at: ai.at } : null }); }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 502, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`AckHarbor(TM) Demo EMR view: http://127.0.0.1:${PORT}/  (FHIR ${fhir.base})`));
