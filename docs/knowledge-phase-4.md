# Knowledge Phase 4

Phase 4 starts moving converter intelligence from hardcoded parser logic toward versioned external knowledge.

## Step 2 Scope

The desktop app now reads the optional rules catalog from an installed knowledge package:

```text
rules/catalog.json
rules/<product>/manual-action-plan.json
```

For each product, Electron validates that the rule file belongs to the expected product and returns a small summary to the renderer:

- detector count
- extractor count
- phase model count
- rule file path

The converter sync dialog displays whether external rules are loaded and the per-product counts.

## Safety

Rule paths are resolved inside the installed package directory. A package cannot point rule files outside its own package root.

## Current Boundary

The existing TypeScript parser still drives Action Plan generation. External rules are loaded for visibility and validation first; behavior replacement will be introduced gradually in later steps.
