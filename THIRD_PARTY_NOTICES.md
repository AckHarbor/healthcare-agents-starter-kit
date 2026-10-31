# Third-party notices

## Bundled in this kit
**None.** The kit's code is plain Node.js with **no npm dependencies** (no `package.json`, no `node_modules`) and
**no Java/Maven artifacts**. No third-party source or binary files are included, so no third-party file in this kit
has been modified.

## Used alongside the kit (downloaded separately by you, not included)

| Software | Version | License | How you get it |
|---|---|---|---|
| HAPI FHIR JPA Server Starter (official image `hapiproject/hapi`) | v8.12.0-2 | Apache License 2.0 | `docker run hapiproject/hapi:v8.12.0-2`, or `main.war` copied from that image |
| Node.js | 18 or newer | MIT and others (see nodejs.org) | https://nodejs.org |
| Eclipse Temurin JRE (only if you don't use Docker) | 17+ | GPLv2 with the Classpath Exception | https://adoptium.net |

HAPI FHIR: Copyright University Health Network and the HAPI FHIR contributors. Licensed under the Apache License,
Version 2.0 (the "License"); you may not use it except in compliance with the License. You may obtain a copy at
https://www.apache.org/licenses/LICENSE-2.0 (the same license text is in this kit's `LICENSE`). Unless required by
applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. The HAPI image and `main.war` contain their
own NOTICE and license files, together with the licenses of their own dependencies. This kit does not change them.

AckHarbor's own code: Apache License 2.0, Copyright 2026 DaRider Tech LLC (see `LICENSE` and `NOTICE`).

HL7® and FHIR® are registered trademarks of Health Level Seven International. Use does not imply HL7 endorsement.

## Dependency license check (Oct 31, 2026)
- npm: the kit has no `package.json` and no npm dependencies. Nothing to flag.
- Maven/Java: the kit bundles no Java artifacts. For information only, a scan of the separately downloaded HAPI FHIR `main.war`
  (v8.12.0-2, 374 jars) found GPL/AGPL/LGPL wording inside license files of some jars, mostly dual-license or "Classpath Exception"
  notices (for example Jakarta EE APIs: EPL-2.0 OR GPL-2.0 with Classpath Exception) and license lists inside `org.hl7.fhir.*` jars.
  The kit does not redistribute these; you get them from HAPI's official image under HAPI's own notices.
