# AckHarbor™ Harbor Engine: local prototype (with AckHarbor™ Demo EMR)

A lean, $0, offline prototype that grows the free Harbor Engine Sandbox into a working interface engine:
HL7® v2 messages come in over MLLP, the engine maps them to FHIR® R4 resources, posts them to a **local** HAPI FHIR
server (the practice EMR, **AckHarbor™ Demo EMR**), and answers with a proper ACK (AA, or AE/AR with an ERR segment).

- **Synthetic test data only.** Every name, MRN, visit and order number in `samples/` is made up. Never send real patient data.
- **Local only.** Everything binds to 127.0.0.1. No hosting, no paid services, no accounts, no API keys.
- Node 18+ (no npm packages needed) and either Docker or Java 17+.

HL7® and FHIR® are registered trademarks of Health Level Seven International. This prototype is not affiliated with or endorsed by HL7 International.
HAPI FHIR is Apache 2.0 licensed; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 1. Start the local FHIR server (HAPI)

Docker (preferred):

```bash
docker run --rm -p 127.0.0.1:8090:8080 \
  -e hapi.fhir.tester.home.server_address=http://localhost:8090/fhir hapiproject/hapi:v8.12.0-2
```

No Docker: run the same official build with Java 17+ (`main.war` copied out of the `hapiproject/hapi:v8.12.0-2` image, `/app/main.war`):

```bash
HAPI_WAR=/path/to/main.war JAVA=/path/to/java engine/scripts/start-hapi.sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/fhir/metadata   # 200 when ready (~40 s)
```

The database is in-memory H2 (the starter's default), so it starts empty on every restart. Heap is capped at 900 MB.
HAPI's built-in web UI (tester overlay) is at http://127.0.0.1:8090/ .

## 2. Start the engine and send the sample admit (Milestone 1: ADT^A01)

```bash
cd engine
node server.mjs &                          # MLLP on 127.0.0.1:2575 -> http://127.0.0.1:8090/fhir
node send.mjs samples/adt-a01.hl7          # prints the ACK: MSA|AA|SYNA01000001|Accepted: Patient ... + Encounter ...
curl -s 'http://127.0.0.1:8090/fhir/Patient?identifier=urn:ackharbor:sandbox:mrn|SYN-100001'
curl -s 'http://127.0.0.1:8090/fhir/Encounter?identifier=urn:ackharbor:sandbox:visit|SYN-V-500001'
node send.mjs samples/adt-a01-missing-mrn.hl7   # AE + ERR|PID^1^3|101 and a plain-English explanation
```

Mapping (one FHIR transaction bundle per message, conditional on identifiers, so re-sends update instead of duplicating):

| HL7 v2 | FHIR R4 |
|---|---|
| PID-3 MRN | Patient.identifier (`urn:ackharbor:sandbox:mrn`) |
| PID-5 / PID-7 / PID-8 / PID-11 / PID-13 | Patient.name / birthDate / gender / address / telecom |
| PV1-2 patient class (I/O/E/P) | Encounter.class (IMP/AMB/EMER/PRENC) |
| PV1-3 location, PV1-7 attending, PV1-19 visit number, PV1-44 admit time | Encounter.location / participant / identifier / period.start |
| (A01) | Encounter.status = in-progress, Encounter.subject -> the Patient |

ACK rules: **AA** when HAPI commits the transaction; **AE** + `ERR` for a mapping problem (101 required field missing,
102 data type, 103 code not in table) or a server problem (207: HAPI down or refused); **AR** + `ERR` for a message type
the engine does not route (200/201).

Engine env vars: `AH_MLLP_PORT` (2575), `AH_FHIR_BASE` (http://127.0.0.1:8090/fhir), `AH_ENGINE_LOG` (optional JSONL file of outcomes).

## 3. Scheduling agent (Milestone 2: Slot -> Appointment -> SIU^S12)

```bash
node agents.mjs seed                     # 2 synthetic doctors, Schedules, 30-min free Slots for 7 days (closed Sundays); safe to re-run
node agents.mjs schedule "book SYN-100001 with Dr. Rivera monday morning for follow-up"
#  -> Booked ... Appointment/<id> (SYN-APT-...), Slot/<id> now busy. SIU^S12 ACK: AA
node agents.mjs remind 72                # composes reminders, logged as "would-send" only (nothing is sent)
node agents.mjs reschedule SYN-APT-XXXXXXXX   # next free slot, old Slot freed, SIU^S14 + would-send notice
```

The agent is rule-based (no AI service): it reads the MRN, doctor name or specialty, day (today / tomorrow / weekday /
YYYY-MM-DD) and morning/afternoon, finds the soonest free Slot, then books in ONE transaction: create the Appointment and
flip the Slot to busy with `If-Match` on the Slot version, so two bookings can never take the same Slot (it retries the next
one). It then sends SIU^S12 through the engine; the engine ACKs AA only if that Appointment exists in the EMR with status
booked and PID-3 matches the patient (otherwise AE 204).

## 4. Lab flow (Milestone 3: ORM^O01 -> ServiceRequest; ORU^R01 -> Observation + DiagnosticReport)

```bash
node send.mjs samples/orm-o01.hl7          # AA: ServiceRequest SYN-ORD-7001 (LOINC 2345-7) for the Patient
node send.mjs samples/oru-r01.hl7          # AA: 2 Observations + DiagnosticReport SYN-LAB-9001 (basedOn the ServiceRequest)
node send.mjs samples/oru-r01-bad-value.hl7   # AE + ERR|OBX^1^5|102 (text in an NM result) + plain-English fix
```

| HL7 v2 | FHIR R4 |
|---|---|
| ORC-1 (NW/CA/...), ORC-2/OBR-2 placer #, OBR-4 test, ORC-12 orderer | ServiceRequest.status / identifier / code / requester |
| OBR-3 filler #, OBR-7 collected, OBR-25 status | DiagnosticReport.identifier / effective / status, basedOn -> ServiceRequest |
| OBX-3 code, OBX-5 + OBX-6 value/units (NM -> valueQuantity, else valueString), OBX-7 range, OBX-8 flag | Observation.code / value / referenceRange / interpretation |

## 5. Clinic agents (rule-based by default, local, synthetic; no email, SMS or payer is ever contacted)

```bash
node agents.mjs intake                     # samples/intake-form.json -> ADT^A04 (PID+PV1+IN1) via engine -> Patient + Encounter + Coverage + home meds
node agents.mjs eligibility SYN-100002     # Coverage -> X12 270 -> local mock payer -> 271 -> CoverageEligibilityResponse (AH_SHOW_X12=1 prints both)
node agents.mjs refer "SYN-100001 to cardiology for chest pain"   # referral ServiceRequest + soonest specialist Slot (Appointment.basedOn) + SIU^S12
node agents.mjs priorauth SYN-100001       # DRAFT letter + Claim (use=preauthorization, status=draft); never submitted
node agents.mjs refill "SYN-100002 lisinopril"   # new MedicationRequest status=draft, queued for clinician approval
node agents.mjs discharge                  # samples/adt-a03.hl7 via engine -> Encounter finished; follow-up within 7 days; instructions = would-send
node agents.mjs explain-lab SYN-100001     # plain-language lab summary vs reference ranges; no diagnosis; talk-to-your-doctor note
node agents.mjs explain-ack samples/oru-r01-bad-value.hl7   # interface support: why the NACK happened + suggested mapping fix
```

| Agent | FHIR written | HL7 / X12 | Shown in Demo EMR view |
|---|---|---|---|
| Scheduling, reminder/reschedule | Appointment, Slot busy/free | SIU^S12 / S14 (ACKed) | Schedule, Agent log |
| Intake | Patient, Encounter, Coverage, MedicationRequest (home meds) | ADT^A04 with IN1 | Patients, Encounters, Coverage, Medications |
| Referral | ServiceRequest (category referral), Appointment.basedOn | SIU^S12 | Referrals, Schedule |
| Eligibility | CoverageEligibilityResponse | X12 270/271 (local mock payer) | Coverage, Agent log (270/271 text) |
| Prior auth drafter | Claim (preauthorization, draft) + letter | none (draft only) | Referrals |
| Lab explainer | none (read-only) | ORU results | Labs |
| Refill | MedicationRequest (draft, priorPrescription) | none | Medications |
| Interface support | none | explains ACK ERR segments | Engine ACKs |
| Discharge follow-up | Encounter finished, Appointment | ADT^A03, SIU^S12 | Encounters, Schedule, Agent log |

By default no AI service is used: every agent is deterministic rules and nothing leaves the computer. The optional AI layer (section 6) is off unless you opt in, and it only ever sends synthetic data. "would-send"
entries in the agent log (`/tmp/ackharbor-agent-log.jsonl`, `AH_AGENT_LOG`) are what a real deployment would text or
email; this prototype has no email, SMS or payer connection at all.

## 6. Optional AI layer (Module 6 add-on, OFF by default)

The agents work with no AI at all. To try the AI-assisted versions, set a free-tier Google Gemini key in the environment
and opt in for that command only (the key is read from the environment, never printed, logged or committed):

```bash
export AH_GEMINI_API_KEY=...        # set once in your shell; do not paste it into files
AH_AI=1 node agents.mjs schedule "Patient SYN-100002 would like to see Dr Lee Tuesday afternoon about heart flutters"
AH_AI=1 node agents.mjs explain-ack samples/oru-r01-bad-value.hl7
AH_AI=1 node agents.mjs explain-lab SYN-100001
```

| Use | What the AI does | Checks before anything is used |
|---|---|---|
| Scheduling | Free text -> JSON booking intent (action, MRN, doctor, day, morning/afternoon, reason) | MRN must be copied from the request and SYN-prefixed; doctor must exist; date within 60 days. Only `book` may write (demo slot booking); cancel/reschedule/other need a person |
| Interface support | Plain-English NACK explanation + mapping fix | Only the ACK's MSA/ERR fields are sent (no PID data); the rule-based detail is always shown too |
| Lab explainer | Plain-language summary against reference ranges | No-diagnosis filter (condition names, "you have", treatment/medicine words) -> discarded for the rule text; the "talk to your doctor" note is always added |

Safety, every call:
- **Synthetic-data guard:** the payload must carry a synthetic marker (a SYN- identifier or `urn:ackharbor:sandbox`). Every identifier-like value must be SYN-prefixed. SSNs, non-example emails and phone numbers outside 555-01xx are blocked, and FHIR resources must carry the `synthetic` tag. A blocked call never leaves the computer.
- **Fallback:** when the AI is off, blocked, fails, times out or is rate-limited (HTTP 429), the deterministic rules answer instead.
- **Human approval:** no AI output writes to the Demo EMR except demo slot booking. Prior-auth and refill stay drafts for a clinician.
- **Labels:** AI outputs show **AI-assisted** in the CLI and in the Demo EMR view (Agent log, Labs).
- **Free-tier notice:** AI-assisted by Google Gemini (free tier). Free-tier inputs may be used by Google to improve its products and may be reviewed by people, so only synthetic demo data is ever sent. Rate limits apply.
- **Models:** tried in order: gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-3.8-flash. Override with `AH_AI_MODEL`.

Lab 6 (`node checks/check-m6.mjs`) tests the guardrail pattern with a mock model; no key needed.

## 7. AckHarbor™ Demo EMR (synthetic demo data only, not for clinical use): read-only view and HAPI's own UI

```bash
node emr-view/serve.mjs &                  # http://127.0.0.1:8091/  (GET-only proxy to HAPI; POST/PUT return 405)
```

Tabs: Patients, Encounters, Schedule (day calendar of free/busy Slots + Appointments), Labs (orders, results and the
plain-language explainer), Referrals, Coverage, Medications, Engine ACKs (with the NACK explainer) and Agent log.
HAPI's built-in tester UI is at http://127.0.0.1:8090/ (server "AckHarbor™ Demo EMR (synthetic demo data only, not for clinical use)"). HAPI's own CapabilityStatement description stays "HAPI FHIR R4 Server" (fixed in the starter, not configurable).

## Checks

From the kit folder: `node checks/check-all.mjs` (see the kit README).
