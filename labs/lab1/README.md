# Lab 1: First light

Goal: run your own FHIR® R4 server, send a synthetic admit (ADT^A01) through the engine, read the ACK, and find the records.

1. Start HAPI (kit README step 2) and wait for `/fhir/metadata` to answer 200.
2. Start the engine: `cd engine && node server.mjs`
3. Send the admit: `cd engine && node send.mjs samples/adt-a01.hl7`
   You should see `MSA|AA|SYNA01000001|Accepted: Patient SYN-100001 + Encounter SYN-V-500001 ...`
4. Find the patient: `curl -s 'http://127.0.0.1:8090/fhir/Patient?identifier=urn:ackharbor:sandbox:mrn|SYN-100001'`
5. Start the Demo EMR view (`node emr-view/serve.mjs`) and open http://127.0.0.1:8091/ : Patients and Encounters tabs.
6. Run the check from the kit folder: `node checks/check-m1.mjs`

Stretch: restart HAPI, run the Patient search again (empty: in-memory database), re-send the admit, and see it come back.
