# Project architecture and style

Follow the existing routes → controllers → services architecture and established
naming, formatting and error-handling conventions. Routes belong in their existing
`src/routes/v1/<domain>/index.ts`, controller functions in
`src/controllers/v1/<domain>/index.ts`, and service/query functions in
`src/services/v1/<domain>/index.ts`. Extend the appropriate existing domain module
rather than creating endpoint-specific files such as `public-preview.ts`.
Keep business rules and database queries in services; controllers handle validated
HTTP input/output. Bind personalized queries to the authenticated user, never to
an arbitrary client-supplied viewer ID. Follow existing test infrastructure and
use disposable databases for integration tests.
