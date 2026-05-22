# Bimbo CI/CD RFC Assistant

Desktop assistant for preparing RFC Action Plans, CI/CD packages, and RFC execution evidence without requiring users to work directly in VS Code.

The app is currently developed and validated on macOS, using Electron + React + Vite.

## Current Scope

- Action Plan generator for manual and CI/CD RFC activities.
- Product-specific conversion logic for:
  - OIC
  - MFT
  - Oracle Database
  - ODI Studio
  - OSB
  - SOA
  - JAVA
- Unified Action Plan environments:
  - DEV
  - REG
  - TEST
  - PROD
- OIC artifact support:
  - `.iar`
  - lookup `.csv`
  - `.xml`
  - packaged `.par`
  - lookup placement under `OIC/Lookups`
  - connection, scheduler, DVM, and internal artifact inspection where available
- MFT manual conversion support for known configuration/change patterns.
- Oracle Database conversion support for SQL-driven plans and dedicated `PASSWORD_LIFE_TIME` profile changes.
- CI/CD package wizard for repository-based deployment packages.
- `int_adhoc.txt` / `int_full.txt` generation.
- `DevOps/inputs/inputs.properties` updates.
- Review screen before commit and push.
- `release` is fixed as the base branch. The final flow checks out `release`, pulls, creates the RFC branch, pushes it, and returns the repository to `release`.
- Local RFC logs under the app user data directory.
- Quick link to Oracle Visual Builder Studio.
- Language support for Spanish, English, and Portuguese.
- Theme customization, including custom dark panel color, transparency, and blur.
- Pending work support:
  - save pending work
  - start new work
  - continue pending work
- RFC Execution support:
  - DEV, REG, TEST, and PROD phases
  - Action Plan step parsing
  - collapsible step review
  - guided execution with internal scrolling for long step lists
  - step comments
  - step evidence capture/import/paste
  - failed-step marker
  - DOCX/PDF export
  - export from the failed step or final step
  - exported evidence no longer includes capture timestamps or auto-generated capture filenames

## Converter Architecture

The app now includes an initial UI architecture for converter synchronization.

The intended long-term split is:

```text
cicd-rfc-assistant
- Desktop app
- UI
- RFC Execution
- evidence export
- local pending work
- repository/package workflow

cicd-rfc-converters
- Product conversion packs
- OIC rules
- MFT rules
- Oracle Database rules
- SOA rules
- JAVA rules
- manifest files
- changelog
- tests / fixtures
```

The `Sync` / `Sincronizar` button opens a converter modal with independent entries per technology:

- OIC
- MFT
- Oracle Database
- SOA
- JAVA

Current buttons are UI scaffolding:

- update converter
- roll back to previous converter version

The Cloudflare download/update flow is not connected yet. The expected future flow is:

```text
GitHub converter repository
  -> CI validation
  -> versioned converter package
  -> Cloudflare Pages or R2 distribution
  -> desktop app downloads and validates package
  -> local cache
  -> rollback available
```

Recommended converter manifest shape:

```json
{
  "version": "2026.05.19-01",
  "minimumAppVersion": "1.4.0",
  "converters": {
    "oic": {
      "version": "2026.05.19-04",
      "url": "https://converters.example.com/oic/2026.05.19-04/oic.zip",
      "sha256": "..."
    }
  }
}
```

## Converter Training Status

Training progress is tracked by product using real RFC/IM090 examples reviewed during development. The counts below are working estimates, not formal coverage guarantees.

Last updated: 2026-05-21

| Product | Training files used | Unique cases | Coverage estimate | Current status |
| --- | ---: | ---: | --- | --- |
| OIC | 15 | 14 | 80-85% | Strongest coverage. Handles standard installs, multi-IAR plans, CSV/lookups, WSDL, ZIP libraries, connection declarations, scheduled integrations, scheduler stop plus integration disablement, deactivation-vs-installation distinction, credential-line filtering, wrapped artifact names, and noisy PDF/DOCX extraction. |
| ODI Studio | 3 | 3 | 60-65% | Covers topology password updates for REST/Oracle Data Servers, ODI component import with SQL, backup/export, variables, mappings, datastores, and scenario regeneration. |
| Oracle Database | 3 | 2 | 60-65% | Covers focused `PASSWORD_LIFE_TIME` profile extension plans and database component installation with ordered SQL scripts, schema/PDB connection, object status validation, rollback, and evidence. |
| OSB | 2 | 2 | 45-50% | Covers OSB export packages, pipelines, proxy services, business services, and service accounts. |
| MFT | 0 | 0 | 30% | Parser structure exists, but more real documents are needed. |
| SOA | 0 | 0 | Initial | Product option exists; training data still pending. |
| JAVA | 1 | 1 | Initial | Covers WebLogic/POM user password reset with target-user confirmation and secure password handling. |

Current tracked training set:

- OIC:
  - `GB_IM090_INT764_OIC3.docx`
  - `GB_IM090_ICWC-WMS-982.OUT_WMS_TO_WMS_GBTRANSFERDEV.v1.0.pdf`
  - `GB_IM090_ConfigurationInstructions-ICWE-WMS-241-OUT_WMS_TO_VP_SHIP_LOAD_CEVES.pdf`
  - `GB_IM090_ICWC-CX-290.IN_AR_TO_OEC_CUSTOMER_ATTRIBUTES.SYNC_CUSTOMER_ADDITIONAL_FROM_ERP_v1.0.pdf` from two source folders
  - `R1-ICWC-WMS-155.OUT_WMS_TO_INV_SUBINVENTORY_TRANSFER.pdf`
  - `GB_IM090_ConfigurationInstructions_ICWE_FIN-587.OUT_AP_TO_FECR_INVOICES_OIC.pdf`
  - `GB_IM090_ConfigurationInstructions_ICWE_FIN-586.OUT_AR_TO_FECR_INVOICES_OIC.pdf`
  - `GB_IM090_IEWC-SCM-537.IN_PEGA_TO_SCM_ITEM_CREATEUPDATE_OIC.v2.0.pdf`
  - `IM_090_ICWE-WMS-829_OUT_WMS_TO_GANTRY_TRUCKLOAD_v1.3.pdf`
  - `GB_IM090_ICWC-OTM-1250.OUT_ERP_TO_OTM_PURCHASE_ORDER_MONITORING_OIC_V3_01062025.pdf`
  - `GB_IM-090_OUT_ERP_TO_OTM_PURCHASE_ORDER_MONITORING_v2.0.pdf`
  - `IM090-ICWE-FIN-984-OUT_ERP_TO_TRANSLATOR_EDI810_INVOICES.docx`
  - `GB_IM090_ICWC-CX-506.IN_CX_TO_ERP_ ASSIGNPASSWORD_V1.0.pdf`
- ODI Studio:
  - RFC overview for topology password update on `OIC_PRY_INTPLATCOM_IMPORT`
  - `IM090_ICWE-ERP-956_OUT_ERP_TO_TRANSLATOR_EDI856_ASN.docx`
  - `Step document for password.docx`
- Oracle Database:
  - `PASSWORD_LIFE_TIME` extension action plan examples for application schemas
  - `GB_IM090_ICWE-CDM-CAP-006.OUT_CDM_TO_MC1_EXPORT_CUSTOMERS_UY_DB_v1.0.pdf`
- OSB:
  - `GB_IM090_ConfigurationInstructionsICWC-CX-529.OUT_RTM_TO_CDM_SYNCH_CUSTOMERS_OSB.pdf`
  - `SubmitExtractJobOICTech.jar`
- JAVA:
  - RFC overview for `R5-GBJAVABZR1TE-POM User password reset`

Training review passes:

`Review passes` counts how many times a file or case was reviewed against the converter during development. A higher number usually means the file exposed parser issues and was revalidated after fixes.

| Product | File / case | Review passes | Result |
| --- | --- | ---: | --- |
| OIC | `GB_IM090_INT764_OIC3.docx` | 3 | WSDL, connection, environment filtering, and DOCX TOC noise validated. |
| OIC | `GB_IM090_ICWC-WMS-982.OUT_WMS_TO_WMS_GBTRANSFERDEV.v1.0.pdf` | 2 | Install-vs-deactivation classification, IAR/CSV artifacts, and connections validated. |
| OIC | `GB_IM090_ConfigurationInstructions-ICWE-WMS-241-OUT_WMS_TO_VP_SHIP_LOAD_CEVES.pdf` | 3 | Multi-IAR artifacts, CSVs, and connection extraction validated. |
| OIC | `GB_IM090_ICWC-CX-290.IN_AR_TO_OEC_CUSTOMER_ATTRIBUTES.SYNC_CUSTOMER_ADDITIONAL_FROM_ERP_v1.0.pdf` | 3 | Multi-IAR artifacts, CSVs, and OEC/report connections validated. |
| OIC | `R1-ICWC-WMS-155.OUT_WMS_TO_INV_SUBINVENTORY_TRANSFER.pdf` | 3 | Current IAR selection, CSV lookups, ZIP library reconstruction, connections, and header cleanup validated. |
| OIC | `GB_IM090_ConfigurationInstructions_ICWE_FIN-587.OUT_AP_TO_FECR_INVOICES_OIC.pdf` | 2 | OIC artifact inspection and dependency extraction validated. |
| OIC | `GB_IM090_ConfigurationInstructions_ICWE_FIN-586.OUT_AR_TO_FECR_INVOICES_OIC.pdf` | 1 | OIC baseline conversion reviewed. |
| OIC | `GB_IM090_IEWC-SCM-537.IN_PEGA_TO_SCM_ITEM_CREATEUPDATE_OIC.v2.0.pdf` | 2 | Low-signal/scanned PDF behavior and OIC deactivation pattern validated. |
| OIC | `IM_090_ICWE-WMS-829_OUT_WMS_TO_GANTRY_TRUCKLOAD_v1.3.pdf` | 2 | IAR artifact and connector declarations from Environment Information validated. |
| OIC | `GB_IM090_ICWC-OTM-1250.OUT_ERP_TO_OTM_PURCHASE_ORDER_MONITORING_OIC_V3_01062025.pdf` | 2 | IAR, lookup CSVs, `CONN_*` connection extraction, and scheduler activation validated. |
| OIC | `GB_IM-090_OUT_ERP_TO_OTM_PURCHASE_ORDER_MONITORING_v2.0.pdf` | 2 | Scheduled job stop plus integration disablement validated without installation artifacts. |
| OIC | `IM090-ICWE-FIN-984-OUT_ERP_TO_TRANSLATOR_EDI810_INVOICES.docx` | 2 | IAR, `edit for` / `Edit connection` extraction, WSDL URL instructions, and password-line filtering validated. |
| OIC | `GB_IM090_ICWC-CX-506.IN_CX_TO_ERP_ ASSIGNPASSWORD_V1.0.pdf` | 2 | Wrapped IAR name cleanup, lookup CSV, connection extraction, and password-line filtering validated. |
| ODI Studio | RFC overview for `OIC_PRY_INTPLATCOM_IMPORT` password update | 2 | Topology password update pattern validated. |
| ODI Studio | `IM090_ICWE-ERP-956_OUT_ERP_TO_TRANSLATOR_EDI856_ASN.docx` | 2 | ODI backup/export, SQL, imports, variables, datastores, and scenario regeneration validated. |
| ODI Studio | `Step document for password.docx` | 2 | Oracle physical architecture Data Server password update, `GB_EDI_OUT_STG`, `OracleDIAgent`, and secure password handling validated. |
| Oracle Database | `PASSWORD_LIFE_TIME` extension examples | 3 | Simple profile-change Action Plan pattern validated against team feedback. |
| Oracle Database | `GB_IM090_ICWE-CDM-CAP-006.OUT_CDM_TO_MC1_EXPORT_CUSTOMERS_UY_DB_v1.0.pdf` | 2 | DB component install, SQL order, schema/PDB, object validation, and credential filtering validated. |
| OSB | `GB_IM090_ConfigurationInstructionsICWC-CX-529.OUT_RTM_TO_CDM_SYNCH_CUSTOMERS_OSB.pdf` | 2 | OSB project/package/resource extraction validated. |
| OSB | `SubmitExtractJobOICTech.jar` | 2 | OSB JAR inspection for pipeline, proxy service, business service, and service account validated. |
| JAVA | RFC overview for `R5-GBJAVABZR1TE-POM User password reset` | 2 | WebLogic Admin Console password reset, realm/user extraction, inconsistent user warning, and no-password-evidence handling validated. |

Next recommended improvement: move these examples into automated fixtures so every converter change can be regression-tested against the same training set.

## Oracle Database Notes

The Database converter has dedicated behavior for `PASSWORD_LIFE_TIME` profile changes.

For requests like:

```text
Modify DB profile to extend password_life_time to 180 days to application schemas

GB_SCM_BR
GB_FIN_AR
GB_CAP_LAC
```

the generated plan is intentionally simple and closed:

- validate current profile value
- modify profile
- validate post-change value
- execute once per unique profile
- document no-action scenarios for `UNLIMITED` or already `180`

If the user captures only schemas/users, the generated plan uses a profile placeholder such as:

```text
<PROFILE_NAME_FROM_ANALYSIS>
```

That means the profile should be resolved before execution. A future improvement is to add an optional `Resolved profile(s)` field so generated SQL can be fully concrete.

## Development

Install dependencies:

```bash
npm install
```

Run the app with Vite + Electron:

```bash
npm run electron:dev
```

Run the compiled desktop app without the Vite dev server:

```bash
npm run build
npx electron .
```

Browser-only UI preview:

```bash
npm run dev
```

Local filesystem, screenshot, export, artifact inspection, and Git actions require Electron because they use the secure preload bridge.

## Build

Build the app:

```bash
npm run build
```

Create a packaged build:

```bash
npm run electron:dist
```

Configured package targets:

- macOS: DMG
- Windows: NSIS installer
- Linux: AppImage

## Platform Requirements

### macOS

Validated development platform.

Recommended:

- Node.js 20 or newer
- npm
- Git
- Xcode Command Line Tools

Development:

```bash
npm install
npm run electron:dev
```

Distribution:

```bash
npm run electron:dist
```

For external distribution, macOS notarization/signing would still need to be configured.

### Windows

To run from source:

- Windows 10/11
- Node.js 20 or newer
- npm
- Git for Windows
- PowerShell or Windows Terminal

Commands:

```powershell
npm install
npm run electron:dev
```

To package on Windows:

```powershell
npm run electron:dist
```

Expected output: NSIS installer under `release/`.

Notes:

- Windows packaging should be tested on Windows even if the config exists.
- Code signing is recommended before distributing internally.
- Some screenshot/region capture behavior may need Windows-specific validation.

### Linux

To run from source:

- Node.js 20 or newer
- npm
- Git
- common Electron runtime libraries for the target distro

Commands:

```bash
npm install
npm run electron:dev
```

To package on Linux:

```bash
npm run electron:dist
```

Expected output: AppImage under `release/`.

Notes:

- AppImage should be tested on the target distro.
- Screenshot and region capture may depend on display server behavior, especially Wayland vs X11.
- Some corporate Linux environments may require additional desktop integration or sandbox settings.

## Cross-Platform Status

The app is designed with Electron, so Windows and Linux are feasible, but they still need validation.

Current confidence:

- macOS: actively used and validated
- Windows: expected to run, needs packaging/runtime validation
- Linux: expected to run, needs AppImage/runtime validation

Most app logic is platform-neutral React/TypeScript. The main areas that need OS-specific validation are:

- screen capture / region capture
- file dialogs and local filesystem paths
- opening exported files/folders
- Git command behavior and line endings
- installer signing and corporate security policies
