// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Optional AI layer for the AckHarbor(TM) Harbor Engine demo agents. OFF by default.
// Turn on with AH_AI=1 plus a free-tier Gemini key in AH_GEMINI_API_KEY (read from the environment only;
// never printed, logged or stored). Every call goes through three safety steps:
//   1. synthetic-data guard: the payload must carry a synthetic marker (SYN- id or urn:ackharbor:sandbox), every
//      identifier-like token must be SYN-prefixed, no SSN/email/real-looking phone, and any FHIR resource passed in
//      must carry the urn:ackharbor:sandbox|synthetic tag. Otherwise the call is blocked before anything leaves the box.
//   2. output checks per use (intent validation, no-diagnosis filter) - a failed check means "use the rules".
//   3. deterministic rules stay the fallback when AI is off, blocked, fails, times out or is rate-limited.
export const FREE_TIER_NOTICE = 'AI-assisted by Google Gemini (free tier). Free-tier inputs may be used by Google to improve its products and may be reviewed by people, so only synthetic demo data is ever sent. Rate limits apply; rules take over when the AI is off, fails or is rate-limited.';
export const AI_LABEL = 'AI-assisted';
const DEFAULT_MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']; // fast free-tier models first

export class AiBlocked extends Error { constructor(m){ super(m); this.name = 'AiBlocked'; } }
export const aiEnabled = (env = process.env) => env.AH_AI === '1' && !!env.AH_GEMINI_API_KEY;

const SYN_MARK = /\bSYN[-A-Z0-9]*\d|urn:ackharbor:sandbox/;
export function assertSynthetic(text, resources = []){
  const t = String(text ?? '');
  for (const r of resources) if (!r?.meta?.tag?.some(g => g.system === 'urn:ackharbor:sandbox' && g.code === 'synthetic')) throw new AiBlocked(`blocked: ${r?.resourceType || 'resource'}/${r?.id || '?'} is not tagged synthetic`);
  if (!SYN_MARK.test(t)) throw new AiBlocked('blocked: payload has no synthetic marker (SYN- identifier or urn:ackharbor:sandbox)');
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(t)) throw new AiBlocked('blocked: SSN-like number in payload');
  const emails = t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []; const badMail = emails.find(e => !/@([\w-]+\.)*(example\.(com|org|net)|test|invalid)$/i.test(e)); if (badMail) throw new AiBlocked('blocked: non-example email address in payload');
  const phones = t.match(/(?:\+?1[-. ]?)?\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b|\b\d{3}[-. ]\d{4}\b/g) || []; if (phones.some(p => !/555[-. ]01\d\d$/.test(p))) throw new AiBlocked('blocked: phone number outside the 555-01xx fictional range');
  const ids = t.match(/[A-Za-z0-9][A-Za-z0-9-]*\d{5,}[A-Za-z0-9-]*/g) || [];
  const bad = ids.find(x => !/^SYN/i.test(x) && !/^\d{8,14}$/.test(x)); // HL7 timestamps (all digits) are allowed
  if (bad) throw new AiBlocked('blocked: identifier-like value that is not SYN-prefixed');
  return true;
}

// Diagnosis / treatment language is never allowed in AI output shown to patients.
const DIAG = /\b(diagnos\w*|you (have|may have|might have|probably have|likely have)|indicat\w* (that )?(you|a|an)\b|consistent with|suggest\w* (that )?you|diabet\w*|prediabet\w*|hyperglyc\w*|hypoglyc\w*|disease|disorder|syndrome|infection|cancer|tumou?r|kidney (failure|damage)|renal (failure|impairment)|treatment|medication|prescri\w*|dosage|you should take)\b/i;
export const hasDiagnosis = s => DIAG.test(String(s || ''));

// Real Gemini call (generateContent). Key goes in a header, never in the URL, never in errors.
export function geminiGenerate({ models = (process.env.AH_AI_MODEL ? [process.env.AH_AI_MODEL] : DEFAULT_MODELS), timeoutMs = 12000, env = process.env } = {}){
  return async (prompt, { system = '', json = false } = {}) => {
    const key = env.AH_GEMINI_API_KEY; if (!key) throw new Error('AI key not set');
    let last = null;
    for (const model of models){
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 600, ...(json ? { responseMimeType: 'application/json' } : {}) } }) });
      } catch (e) { last = new Error('AI request failed (' + (e.name || 'network') + ')'); continue; }
      if (r.status === 404 || r.status === 400){ last = new Error(`AI model ${model} unavailable (HTTP ${r.status})`); continue; }
      if (r.status === 429) { const e = new Error('AI rate-limited (HTTP 429)'); e.rateLimited = true; throw e; }
      if (!r.ok) { last = new Error(`AI HTTP ${r.status}`); continue; }
      const j = await r.json(); const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (!text) { last = new Error('AI returned no text'); continue; }
      return { text, model };
    }
    throw last || new Error('AI unavailable');
  };
}

// createAi({ generate }) - tests inject a mock generate(prompt, opts) -> { text, model }
export function createAi({ generate = null, enabled = null, env = process.env } = {}){
  const on = enabled ?? aiEnabled(env); const gen = generate || geminiGenerate({ env });
  return {
    enabled: !!on,
    // returns { ok:true, text, model } or { ok:false, reason } - never throws
    async ask(prompt, { system = '', json = false, resources = [] } = {}){
      if (!on) return { ok: false, reason: 'AI off' };
      try { assertSynthetic(prompt, resources); } catch (e) { return { ok: false, reason: e.message, blocked: true }; }
      try { const r = await gen(prompt, { system, json }); return { ok: true, text: String(r.text).trim(), model: r.model || 'mock' }; }
      catch (e) { return { ok: false, reason: e.rateLimited ? 'rate-limited' : e.message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]') }; }
    },
  };
}
export const aiOff = () => createAi({ enabled: false });
