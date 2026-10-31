// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Agent activity log (JSONL, local file). "would-send" entries are messages an agent WOULD send; nothing is ever sent.
import fs from 'node:fs';
export const LOG_FILE = () => process.env.AH_AGENT_LOG || '/tmp/ackharbor-agent-log.jsonl';
export function agentLog(agent, kind, data){ const rec = { at: new Date().toISOString(), agent, kind, ...data }; try { fs.appendFileSync(LOG_FILE(), JSON.stringify(rec) + '\n'); } catch {} return rec; }
export function readAgentLog(limit = 200){ try { return fs.readFileSync(LOG_FILE(), 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map(l => JSON.parse(l)).reverse(); } catch { return []; } }
