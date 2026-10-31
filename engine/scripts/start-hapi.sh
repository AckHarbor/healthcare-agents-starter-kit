#!/usr/bin/env bash
# Copyright 2026 DaRider Tech LLC
# SPDX-License-Identifier: Apache-2.0
# Starts the official HAPI FHIR JPA server starter (Apache License 2.0) locally, bound to 127.0.0.1 only.
# In-memory H2 database (the starter's default): every restart starts empty. No hosting, no cost.
# Docker (preferred when available):
#   docker run --rm -p 127.0.0.1:8090:8080 -e hapi.fhir.tester.home.server_address=http://localhost:8090/fhir -e "hapi.fhir.tester.home.name=AckHarbor™ Demo EMR (synthetic demo data only, not for clinical use)" hapiproject/hapi:v8.12.0-2
# Without Docker (this script): Java 17+ plus main.war copied out of the same official image (see README).
#   HAPI_WAR=/path/to/main.war JAVA=/path/to/java ./start-hapi.sh
set -euo pipefail
HAPI_WAR="${HAPI_WAR:?Set HAPI_WAR to the full path of main.war (see the kit README, step 2)}"
JAVA="${JAVA:-java}"
PORT="${HAPI_PORT:-8090}"
LOG="${HAPI_LOG:-/tmp/ackharbor-hapi.log}"
cd "$(dirname "$HAPI_WAR")"
nohup "$JAVA" -Xms256m -Xmx900m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 \
  --class-path "$(basename "$HAPI_WAR")" "-Dloader.path=$(basename "$HAPI_WAR")!/WEB-INF/classes/,$(basename "$HAPI_WAR")!/WEB-INF/" \
  org.springframework.boot.loader.PropertiesLauncher \
  --server.port="$PORT" --server.address=127.0.0.1 \
  --spring.ai.mcp.server.enabled=false \
  --hapi.fhir.tester.home.name="AckHarbor™ Demo EMR (synthetic demo data only, not for clinical use)" \
  --hapi.fhir.tester.home.server_address="http://localhost:$PORT/fhir" \
  > "$LOG" 2>&1 &
echo "$!" > /tmp/ackharbor-hapi.pid
echo "HAPI starting (pid $!), log $LOG. Ready when: curl -s http://127.0.0.1:$PORT/fhir/metadata"
