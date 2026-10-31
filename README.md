# AckHarbor™ starter kit: AckHarbor™ Healthcare Agents Course

*Build automated and AI software agents on HL7® FHIR®*

> **Synthetic demo data only, not for clinical use.** Every patient, MRN, visit, member ID, payer and doctor in this kit is made up (`SYN-...`, Penford Medical Center, Sandbox Health Plan). Never enter real patient data anywhere in this kit, and never paste real records into any AI tool.

Everything runs on your own computer, bound to 127.0.0.1. It costs $0 and needs no accounts, cloud services or API keys. The optional AI step in Module 6 is off by default and works with a mock model.

## What's inside

| Folder | What it is |
|---|---|
| `engine/` | The working AckHarbor™ Harbor Engine: MLLP listener, HL7 v2 → FHIR R4 mapping, ACK/NACK, 9 rule-based agents, the AckHarbor™ Demo EMR view, optional AI layer (off) |
| `labs/lab1` … `labs/lab6` | One folder per lab. Files with `TODO` are yours to complete |
| `checks/` | `check-m1.mjs` … `check-m6.mjs`, `check-capstone.mjs`, `check-all.mjs`: run them to see PASS/FAIL |
| `capstone/` | Capstone template: manifest, README template, sample good/bad messages, agent skeleton |
| `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, `.env.example` | Apache License 2.0; notices; third-party notices (HAPI FHIR); contributions policy; settings template |

Lab solutions are not in this free kit; they are shown online in the paid course.

## 1. Install (free)

- **Node.js 18 or newer** (https://nodejs.org). No `npm install` is needed; the kit has no dependencies.
- **One of:** Docker (Docker Desktop or Docker Engine), **or** Java 17+ (for example Eclipse Temurin from https://adoptium.net).
- About 2 GB of free memory.

Check: `node -v` prints v18 or higher; `docker -v` or `java -version` works.

## 2. Start the local FHIR server (the AckHarbor™ Demo EMR's database)

The Demo EMR stores everything in HAPI FHIR, the open-source FHIR® R4 server, running on your own computer.

**With Docker:**

```bash
docker run --rm -p 127.0.0.1:8090:8080 \
  -e hapi.fhir.tester.home.server_address=http://localhost:8090/fhir \
  hapiproject/hapi:v8.12.0-2
```

**Without Docker (Java 17+):** copy `main.war` out of the same official image once (on any machine with Docker: `docker create --name hapi hapiproject/hapi:v8.12.0-2 && docker cp hapi:/app/main.war ./main.war && docker rm hapi`), then:

```bash
HAPI_WAR=/full/path/to/main.war ./engine/scripts/start-hapi.sh
```

Wait about 40 seconds, then check: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/fhir/metadata` prints `200`.

The database is in memory. **Every restart starts empty**: re-run the lab steps (they are safe to repeat).

## 3. Start the engine and the Demo EMR view

Open two more terminals in this folder:

```bash
cd engine && node server.mjs            # MLLP on 127.0.0.1:2575 -> http://127.0.0.1:8090/fhir
cd engine && node emr-view/serve.mjs    # AckHarbor™ Demo EMR view: http://127.0.0.1:8091/ (read-only)
```

## 4. Do the labs

| Lab | Module | Run when done |
|---|---|---|
| Lab 1 First light | 1 | `node checks/check-m1.mjs` |
| Lab 2 Map it | 2 | `node checks/check-m2.mjs` |
| Lab 3 NACK detective | 3 | `node checks/check-m3.mjs` |
| Lab 4 Book it | 4 | `node checks/check-m4.mjs` |
| Lab 5 Clinic in a box | 5 | `node checks/check-m5.mjs` |
| Lab 6 Guardrails | 6 | `node checks/check-m6.mjs` (no server needed) |
| Capstone | 7 | `node checks/check-capstone.mjs` |

Each check prints `PASS` or `FAIL` per item and ends with `check-mN PASS` when everything is done. `SKIP` means the server or engine isn't running.

## 5. Optional: the AI step (Module 6)

Not needed to finish the course. If you want to try it, use **your own** free-tier key from Google AI Studio and keep it in your shell environment only, never in a file:

```bash
export AH_GEMINI_API_KEY=...   # your own key; never commit or paste it into files
AH_AI=1 node engine/agents.mjs explain-lab SYN-100001
```

Free-tier inputs may be used by the provider to improve its products and may be reviewed by people. That is one more reason the course uses synthetic data only. Rate limits apply; the rules take over automatically when the AI is off, blocked, fails or is rate-limited.

## Engine tests

The engine ships with its own tests (no server needed): `node --test tests/engine.test.mjs` (14 tests).

## Ports and settings

| Setting | Default | Change with |
|---|---|---|
| FHIR server | http://127.0.0.1:8090/fhir | `AH_FHIR_BASE` |
| Engine MLLP | 127.0.0.1:2575 | `AH_MLLP_PORT` |
| Demo EMR view | http://127.0.0.1:8091/ | `AH_VIEW_PORT` |
| Agent log | /tmp/ackharbor-agent-log.jsonl | `AH_AGENT_LOG` |
| Engine ACK log | /tmp/ackharbor-engine-acks.jsonl | `AH_ENGINE_LOG` |

"would-send" entries in the agent log are messages a real deployment would send. This kit has no email, SMS, pharmacy or payer connection at all.

---

## License and notices

AckHarbor™ starter kit by DaRider Tech LLC. Code licensed under the Apache License 2.0 (see LICENSE and NOTICE). Third-party components keep their own licenses (see THIRD_PARTY_NOTICES), including HAPI FHIR under Apache 2.0.
AckHarbor™ is a trademark of DaRider Tech LLC. The license does not grant rights to use the AckHarbor name or logo. If you redistribute a changed version, rename it and don't imply our endorsement.
HL7® and FHIR® are registered trademarks of Health Level Seven International. Use does not imply HL7 endorsement.
Educational software with synthetic data only. Not a medical device, not for clinical use, and not tested for production or HIPAA compliance. Never load real patient data (PHI). Provided "as is" without warranty, as stated in the license.

Contributions: see CONTRIBUTING.md (no outside pull requests for now). Lab solutions, lesson text and videos are not part of this kit; they are in the paid AckHarbor™ Healthcare Agents Course (all rights reserved).
