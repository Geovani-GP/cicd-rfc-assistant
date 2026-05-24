# Knowledge Layer - Phase 1

Phase 1 introduces an embedded, versioned knowledge layer without changing the runtime behavior of the converters.

## Current Scope

- `src/knowledge/converters.manifest.json`
  - Local manifest for converter products and versions.
  - Intended to become the local copy of the remote Cloudflare manifest in a later phase.

- `src/knowledge/action-templates.json`
  - Declarative Action Plan template catalog.
  - Replaces the hardcoded template list previously stored in `src/App.tsx`.

- `src/knowledge/index.ts`
  - Typed adapter used by the app.
  - Keeps the app isolated from the raw JSON shape.

## Runtime Model

The app still ships with embedded knowledge and remains fully offline-capable. Future sync work should install downloaded knowledge into the user data directory and load it before falling back to this embedded layer.

Recommended precedence for later phases:

1. Valid installed local knowledge package.
2. Previous valid local knowledge package.
3. Embedded knowledge package.

## Future Package Shape

```text
converters/
  manifest.json
  products/
    oic.json
    mft.json
    database.json
  templates/
    action-templates.json
  training-cases/
    oic/
    mft/
```

## Notes

Parser logic remains in TypeScript for now. Only stable declarative data was moved in this phase. Regex-heavy and workflow-heavy logic should be externalized gradually after the manifest, checksum, and rollback flow exists.
