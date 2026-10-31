# Lab 3: your fixed messages go here

Copy each file from `../broken/` into this folder **with the same file name**, fix it, and run `node checks/check-m3.mjs`.

- `adt-a01-missing-mrn.hl7`: give the patient a synthetic MRN in PID-3 (for example `SYN-100003^^^PENFORD^MR`).
- `oru-r01-bad-value.hl7`: the result is NM, so OBX-5 must be a number (the lab re-ran it: 141).
- `adt-a01-bad-gender.hl7`: PID-8 must come from HL7 table 0001. The registration form says female.
- `orm-o02-unsupported.hl7`: do **not** "fix" this one. It is an order response the engine is not built to route. The right fix is a channel filter on the sending side, which you describe in your notes.

Synthetic data only: every MRN must start with SYN-.
