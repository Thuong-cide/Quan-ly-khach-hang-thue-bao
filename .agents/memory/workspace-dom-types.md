---
name: Workspace DOM types
description: TypeScript configuration required by generated browser fetch clients.
---

The generated React API client uses iterable browser APIs such as `Headers.entries()`, so its TypeScript `lib` list must include both `dom` and `dom.iterable`.

**Why:** The generated source can compile in the browser bundler while the composite library typecheck fails if iterable DOM declarations are omitted.

**How to apply:** Preserve `dom.iterable` in `lib/api-client-react/tsconfig.json` when changing workspace compiler configuration.