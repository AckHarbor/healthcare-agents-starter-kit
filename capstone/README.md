# Capstone: <your agent's name>

> Synthetic demo data only, not for clinical use. Every patient and identifier here is made up (SYN-...).

## Problem
What clinic workflow does this agent help with, and who uses it?

## Design
The steps the agent takes, in order. Which parts are rules, and which (if any) use the optional AI layer.

## FHIR resources
Which resources it reads and writes, and how writes stay idempotent (conditional create/update on identifiers, If-Match).

## HL7 messages
Which HL7 v2 message(s) it sends or receives, the expected ACK, and the deliberate bad message with its NACK.

## Safety
Synthetic data only; what needs human approval; what is logged as would-send; what happens when the EMR is down.

## How to run
Exact commands, from a fresh start of HAPI and the engine.

## Test results
Paste the output of `node checks/check-capstone.mjs`.
