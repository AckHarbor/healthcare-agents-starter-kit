#!/usr/bin/env node
// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Start the AckHarbor(TM) Harbor Engine prototype MLLP listener (127.0.0.1 only).
// Env: AH_MLLP_PORT (2575), AH_FHIR_BASE (http://127.0.0.1:8090/fhir), AH_ENGINE_LOG (optional JSONL file of ACK outcomes)
import { startMllpServer } from './lib/engine.mjs'; import { fhirClient } from './lib/fhir.mjs';
const fhir = fhirClient(); const s = await startMllpServer({ fhir });
const a = s.address(); console.log(`AckHarbor(TM) Harbor Engine listening for MLLP on ${a.address}:${a.port} -> ${fhir.base}`);
