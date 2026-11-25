# testdata

## openapi.json

Snapshot of the public Octen OpenAPI spec (https://docs.octen.ai/api-reference/openapi.json), downloaded 2026-11-21.
The Chinese example text in the `/v1/messages` `streamContentDelta` response example is replaced with an English
translation, to keep the repository English-only. The request and response schemas of the eleven endpoints this node
calls were compared with the live spec on 2026-11-25 and are identical.

`test/contract.test.ts` checks every node option against this file: the request field must exist, and the choices and
bounds must match. Update the file by hand when the API changes, then fix `nodes/Octen/operations.ts`.
