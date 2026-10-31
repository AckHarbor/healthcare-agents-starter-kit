// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Tiny FHIR R4 REST client (fetch). Talks only to the configured local server (default http://127.0.0.1:8090/fhir).
export class FhirError extends Error { constructor(msg, status, body){ super(msg); this.status = status; this.body = body; } }
export function fhirClient(base = process.env.AH_FHIR_BASE || 'http://127.0.0.1:8090/fhir', { timeoutMs = 15000 } = {}){
  base = base.replace(/\/$/, '');
  async function req(method, path, body, headers = {}){
    let r;
    try {
      r = await fetch(path.startsWith('http') ? path : base + '/' + path.replace(/^\//, ''), { method, headers: { Accept: 'application/fhir+json', 'Cache-Control': 'no-cache', ...(body ? { 'Content-Type': 'application/fhir+json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) { throw new FhirError('FHIR server unreachable at ' + base + ' (' + (e.cause?.code || e.name) + ')', 0); }
    const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok){
      const diag = json?.issue?.map(i => i.diagnostics).filter(Boolean).join('; ') || text.slice(0, 200);
      throw new FhirError(`FHIR ${method} ${path.split('?')[0]} failed: HTTP ${r.status}${diag ? ' - ' + diag : ''}`, r.status, json);
    }
    return json;
  }
  return {
    base,
    get: p => req('GET', p),
    transaction: bundle => req('POST', '', bundle),
    put: (p, body, ifMatch) => req('PUT', p, body, ifMatch ? { 'If-Match': ifMatch } : {}),
    // all resources from a search, following next links (bounded)
    async search(p, max = 500){ const out = []; let b = await req('GET', p); while (b){ for (const e of b.entry || []) if (e.search?.mode !== 'include') out.push(e.resource); const nx = b.link?.find(l => l.relation === 'next'); if (!nx || out.length >= max) break; b = await req('GET', nx.url); } return out; },
  };
}
