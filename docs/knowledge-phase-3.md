# Knowledge Phase 3

Phase 3 connects the desktop app to locally installed converter knowledge packages.

## Runtime Load Order

1. Current valid local package in the Electron `userData` knowledge store.
2. Previous valid local package in the same store.
3. Embedded package shipped inside the app.

If local package loading fails, the renderer keeps using the embedded catalog, so the app remains offline-capable.

## Local Store

Electron stores installed packages under:

```text
<userData>/knowledge/packages/<knowledgeVersion>/
<userData>/knowledge/current.json
<userData>/knowledge/previous.json
```

The installed package must contain:

```text
manifest.json
products/converters.manifest.json
templates/action-templates.json
training-cases/
```

## Current Scope

- Install a generated ZIP package manually from the converter sync dialog.
- Validate package schema before activating it.
- Track current and previous versions for rollback.
- Load local knowledge on app startup.

Cloud download and signature/checksum validation are intentionally left for the next phase.
