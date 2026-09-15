---
name: OpenAPI codegen naming
description: Prevent Orval/Zod export collisions when adding API response schemas.
---

When adding response components to the OpenAPI contract, avoid names that Orval derives for the operation response, such as `<OperationName>Response`; use a domain-oriented name instead.

**Why:** Orval emits both operation response schemas and reachable component types into the same public barrel. Matching names cause TS2308 duplicate export failures after codegen.

**How to apply:** After every OpenAPI change, run codegen and the library typecheck before wiring routes or hooks.