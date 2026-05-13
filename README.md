# Bimbo CI/CD RFC Assistant

Desktop assistant for preparing OIC CI/CD RFC packages without requiring users to work directly in VS Code.

## Phase 1 Scope

- Compact prerequisite notices for Git, Node.js, and Git user configuration.
- Action Plan generator for RFC activities before repository package preparation.
- CI/CD and manual templates for products such as OIC, ODI Studio, and OSB.
- Temporary `.iar` inspection to detect packaged OIC project code, name, version, type, and state without modifying the source artifact.
- Download links when a prerequisite is missing.
- Workspace folder selection for local regional repositories.
- Local repository discovery from the selected workspace folder.
- Contextual HTTPS clone flow when a repository is missing.
- Compact repository/branch selector in the main toolbar.
- Workspace and setup details available from the status button modal.
- RFC package wizard for `.iar`, `.xml`, and lookup `.csv` files.
- `OIC/Lookups` placement for lookup files.
- `int_adhoc.txt` / `int_full.txt` generation.
- `DevOps/inputs/inputs.properties` updates.
- Review screen before commit and push.
- `release` is fixed as the base branch. The final flow checks out `release`, pulls, creates the RFC branch, pushes it, and returns the repository to `release`.
- Local RFC logs under the app user data directory.
- Quick link to Oracle Visual Builder Studio for Merge Request and Pipeline steps.
- Oracle-inspired desktop UI palette.
- In-app language menu for Spanish, English, and Portuguese.

## Phase 2 Scope

- Create Merge Requests through Visual Builder Studio API or approved automation.
- Reviewer selection.
- Pipeline execution from the app.
- Pipeline Run ID, timestamp, and job log capture.
- RFC history that links commits, Merge Requests, pipeline runs, and deployment result.

## Development

```bash
npm install
npm run electron:dev
```

To run the compiled desktop app without the Vite dev server:

```bash
npm run build
npx electron .
```

For a browser-only UI preview:

```bash
npm run dev
```

Local filesystem and Git actions require Electron because they use the secure preload bridge.

## Build

```bash
npm run electron:dist
```

The packaging target is configured for macOS DMG, Windows NSIS, and Linux AppImage.
