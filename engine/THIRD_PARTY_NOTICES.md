# Third-party notices

## HAPI FHIR JPA Server Starter
- Project: https://github.com/hapifhir/hapi-fhir-jpaserver-starter (official image `hapiproject/hapi`, tag `v8.12.0-2`)
- License: Apache License, Version 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Copyright: University Health Network and the HAPI FHIR contributors.
- Use here: run unmodified as a separate local process (in-memory H2 database). It is not bundled or redistributed in this repository;
  `scripts/start-hapi.sh` starts a copy the developer downloads from the official image. If it is ever redistributed, include the
  Apache 2.0 license text and any NOTICE files shipped inside `main.war`.

## Eclipse Temurin JRE (only when Docker is not available)
- https://adoptium.net — GPLv2 with the Classpath Exception. Downloaded separately; not redistributed here.
