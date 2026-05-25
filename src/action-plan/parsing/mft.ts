import { cleanArtifactCandidate } from "./artifacts";
import { asBullets } from "./common";
import type { ManualActionPhase } from "./types";

export function hasMftInstructions(text: string) {
  return /\b(?:MFT|mftconsole|transfer rule|Deploy Transfer|Preprocessing Actions|Search Artifacts|MFT server|MFT folders?|User Access|Folder Access Settings)\b/i.test(text) ||
    /\bmft\/(?:source|target|transfer|security)\//i.test(text);
}

function quotedValues(value: string) {
  return Array.from(value.matchAll(/["“]([^"”]+)["”]/g))
    .map((match) => match[1].trim())
    .filter((item) => item && !/^https?:\/\//i.test(item));
}

function cleanMftCandidate(value: string) {
  return cleanArtifactCandidate(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function isLikelyMftTargetName(value: string) {
  return /^[A-Z0-9][A-Z0-9_]{5,}$/i.test(value);
}

function isLikelyMftTransferRuleName(value: string) {
  return /^[A-Z0-9_]{8,}$/.test(value) && /_/.test(value);
}

function cleanMftActionName(value: string) {
  return cleanMftCandidate(value).replace(/^\d+\.\s*/, "").trim();
}

function uniqueValues(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    byKey.set(clean.toUpperCase(), clean);
  }
  return Array.from(byKey.values());
}

function mftFolderPaths(text: string) {
  return uniqueValues(Array.from(text.matchAll(/(?:^|\s)(\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/gm)).map((match) => match[1]));
}

function mftAccessUsers(text: string) {
  const explicit = text.match(/\bUser:\s*([A-Za-z0-9_ |.-]+)/i)?.[1] ?? "";
  if (!explicit) return [];
  return uniqueValues(
    explicit
      .split(/\s*\|\s*|,\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function mftAccessPermissions(text: string) {
  const explicit = text.match(/\bPermissions?:\s*([A-Za-z/ |,.-]+)/i)?.[1] ?? "";
  if (!explicit) return [];
  return uniqueValues(
    explicit
      .split(/\s*\/\s*|\s*\|\s*|,\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.toUpperCase() === "WRITE" ? "Write" : item.toUpperCase() === "READ" ? "Read" : item.toUpperCase() === "LIST" ? "List" : item.toUpperCase() === "DELETE" ? "Delete" : item)
  );
}

function hasMftFolderAccessInstructions(text: string) {
  return mftFolderPaths(text).length > 0 &&
    (/\bcreate\b[\s\S]{0,80}\bfolders?\b|\bfolders?\b[\s\S]{0,80}\bMFT server\b/i.test(text) ||
      /\bFolder Access Settings\b|\bUser Access\b|\bPermissions?:\b/i.test(text));
}

export function mftConfigurationItems(text: string) {
  const items: string[] = [];
  for (const match of text.matchAll(/\bArtifact file:\s*([^\n\r]+\.(?:xml|zip|asc))\b/gi)) {
    items.push(`Artifact: ${cleanMftCandidate(match[1])}`);
  }
  for (const match of text.matchAll(/(?:^|[\s"'“”‘’()[\]{}:;,\n])([A-Z0-9][A-Z0-9_.-]+?\.(?:xml|zip|asc))(?=$|[^A-Z0-9_.-])/gi)) {
    items.push(`Artifact: ${cleanMftCandidate(match[1])}`);
  }
  for (const folder of mftFolderPaths(text)) items.push(`Folder: ${folder}`);
  for (const user of mftAccessUsers(text)) items.push(`User: ${user}`);
  const permissions = mftAccessPermissions(text);
  if (permissions.length) items.push(`Permissions: ${permissions.join("/")}`);
  const transferMatches = [
    ...text.matchAll(/\btransfer rule(?: named| name)?[:\s"]+([A-Z0-9_ -]{6,})/gi),
    ...text.matchAll(/\btransfer name:\s*([A-Z0-9_ -]{6,})/gi),
    ...text.matchAll(/\bPROCESS\s+(?:TO\s+\w+\s+THE\s+)?TRANSFER RULE\s*\(([A-Z0-9_ -]{6,})\)/gi)
  ];
  for (const match of transferMatches) {
    const value = cleanMftCandidate(match[1]);
    if (isLikelyMftTransferRuleName(value)) items.push(`Transfer Rule: ${value}`);
  }

  for (const match of text.matchAll(/\bSource:\s*([A-Z0-9_ -]{4,})/gi)) {
    const value = cleanMftCandidate(match[1]);
    if (isLikelyMftTargetName(value) || isLikelyMftTransferRuleName(value)) items.push(`Source: ${value}`);
  }

  for (const match of text.matchAll(/\bTarget:\s*([A-Z0-9_ -]{4,})/gi)) {
    const value = cleanMftCandidate(match[1]);
    if (isLikelyMftTargetName(value) || isLikelyMftTransferRuleName(value)) items.push(`Target: ${value}`);
  }

  for (const match of text.matchAll(/\bdestination\s+["“]?([^"\n”]+)["”]?/gi)) {
    const value = cleanMftCandidate(match[1]);
    if (isLikelyMftTargetName(value)) items.push(`Target: ${value}`);
  }

  for (const match of text.matchAll(/\b(?:Preprocessing Actions?|Selected Actions?)\b[\s\S]{0,120}?["“]?([A-Z0-9][A-Z0-9_ .-]*(?:Decryption|Encryption|Compression|Validation|Action))[\"”]?/gi)) {
    const value = cleanMftActionName(match[1]);
    if (/^(?:PGP\s+)?(?:Decryption|Encryption|Compression|Validation|Action)\b/i.test(value) || /\b(?:Decryption|Encryption|Compression|Validation)\b/i.test(value)) {
      items.push(`Processing Action: ${value}`);
    }
  }

  for (const value of quotedValues(text)) {
    const cleanValue = cleanMftCandidate(value);
    if (/PGP|Decryption|Encryption/i.test(cleanValue)) items.push(`Processing Action: ${cleanMftActionName(cleanValue)}`);
    if (isLikelyMftTransferRuleName(cleanValue)) items.push(`Transfer Rule: ${cleanValue}`);
  }

  return Array.from(new Map(items.map((item) => [item.toLowerCase().replace(/^processing action:\s*\d+\.\s*/i, "processing action: "), item.replace(/^Processing Action:\s*\d+\.\s*/i, "Processing Action: ")])).values());
}

function mftArtifacts(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Artifact: "))
    .map((item) => item.replace(/^Artifact:\s*/, ""));
}

function missingMftArtifacts(text: string) {
  return uniqueValues(Array.from(text.matchAll(/\bMissing artifact file:\s*([^\n\r]+\.(?:xml|zip|asc))\b/gi)).map((match) => cleanMftCandidate(match[1])));
}

function mftTransferRules(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Transfer Rule: "))
    .map((item) => item.replace(/^Transfer Rule:\s*/, ""));
}

function mftTargets(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Target: "))
    .map((item) => item.replace(/^Target:\s*/, ""));
}

function mftSources(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Source: "))
    .map((item) => item.replace(/^Source:\s*/, ""));
}

function mftActions(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Processing Action: "))
    .map((item) => item.replace(/^Processing Action:\s*/, ""));
}

function mftConsoleUrl(text: string) {
  return text.match(/https?:\/\/\S*?mftconsole\b/i)?.[0].replace(/[).,;]+$/g, "") ?? "";
}

function hasMftDeploymentInstructions(text: string) {
  return /\b(?:MFT Transfers deploy|Transfers deploy|Deploy Transfer|import package|deploy package|configuration package)\b/i.test(text) ||
    /\bArtifact file:\s*[^\n\r]+\.zip\b/i.test(text) ||
    /\bArtifact file:\s*[^\n\r]+\.asc\b/i.test(text) ||
    /\bmft\/(?:source|target|transfer|security)\//i.test(text);
}

function hasMftImportOnlyInstruction(text: string) {
  return /\bdo\s+not\s+deploy\b|\bno\s+deploy(?:ment)?\b|\bimport\s+only\b|\bjust\s+need\s+to\s+import\b|\bonly\s+need\s+to\s+import\b/i.test(text);
}

function buildMftFolderAccessPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const folders = mftFolderPaths(text);
  const users = mftAccessUsers(text);
  const permissions = mftAccessPermissions(text);
  const folderLines = folders.length ? asBullets(folders) : "- Confirm MFT folder paths requested in the RFC.";
  const userLines = users.length ? asBullets(users) : "- Confirm MFT users requested in the RFC.";
  const permissionLines = permissions.length ? asBullets(permissions) : "- Confirm required permissions.";
  const instance = text.match(/\b(?:Target instance|Instance):\s*([A-Z0-9_-]+)/i)?.[1]?.trim() ?? "";
  const target = [selectedEnvironment, instance].filter(Boolean).join(" / ") || selectedEnvironment || "target MFT environment";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        `Validate access to the target MFT environment before starting the change: ${target}.`,
        "Validate SFTP access with an approved admin user. Use an SFTP client such as FileZilla or an approved equivalent.",
        "Requester/owner must provide or confirm the MFT hostname, port, admin user, and credentials through the approved secure channel before execution.",
        "Do not capture or expose password values in the Action Plan or RFC evidence.",
        "",
        "Folders requested:",
        folderLines,
        "",
        "Users requested:",
        userLines,
        "",
        "Permissions requested:",
        permissionLines
      ].join("\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before making changes, capture evidence of the current MFT folder state and current user access configuration.",
        "",
        "Capture:",
        "- Existing folder listing for each parent path.",
        "- Current User Access settings for the requested users, if already configured.",
        "- Evidence if any requested folder already exists.",
        "",
        "If no prior configuration exists, document that backup is not applicable for the new folder/access entry."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Implementation Steps",
      content: [
        "Create MFT folders.",
        "",
        "1. Open the approved SFTP client.",
        "2. Connect to the target MFT server using the confirmed connection data:",
        "   - Protocol: SFTP - SSH File Transfer Protocol",
        "   - Host: MFT hostname for the target environment",
        "   - Port: MFT port for the target environment",
        "   - User: approved admin user",
        "   - Password: provided through secure channel",
        "3. Validate each parent path exists or create the required parent structure as needed.",
        "4. Create the following folders:",
        folders.map((folder) => `   - ${folder}`).join("\n") || "   - <folder paths from RFC>",
        "5. Capture evidence of the created folders.",
        "",
        "Configure User Permissions.",
        "",
        "6. Login to MFT Console for the target instance.",
        "7. Click Administration.",
        "8. Go to Embedded Servers > User Access.",
        "9. In Folder Access Settings For, select User.",
        users.map((user, index) => [
          `${10 + index}. Search and configure user: ${user}`,
          "   - Click Add Folder.",
          "   - Add the requested folders:",
          folders.map((folder) => `     - ${folder}`).join("\n") || "     - <folder paths from RFC>",
          "   - Click Add Selected.",
          "   - Select the requested permissions:",
          permissions.map((permission) => `     - ${permission}`).join("\n") || "     - <permissions from RFC>",
          "   - Click Save.",
          "   - Capture evidence for this user."
        ].join("\n")).join("\n"),
        `${10 + users.length}. Confirm all requested users have the same folder access configuration.`,
        `${11 + users.length}. Save all changes and capture final evidence.`
      ].filter(Boolean).join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for MFT folder creation and user access assignment.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the MFT folders and user permissions after implementation.",
        "",
        "1. Confirm each requested folder exists in the target MFT server:",
        folderLines,
        "",
        "2. Confirm each requested user has access to the requested folders:",
        userLines,
        "",
        "3. Confirm the assigned permissions match the RFC request:",
        permissionLines,
        "",
        "4. If possible, perform or request a read/list/write validation using an approved non-production validation file, then remove the validation file if created.",
        "5. Capture final validation evidence."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If folder creation or permission assignment fails, stop execution and capture the error details.",
        "",
        "Rollback/contingency:",
        "1. If folders were created incorrectly and are empty, remove only the folders created during this RFC after approval.",
        "2. If permissions were assigned incorrectly, remove or correct only the access entries changed during this RFC.",
        "3. Restore any previous User Access settings using the backup evidence.",
        "4. Validate the restored configuration and capture rollback evidence.",
        "5. Escalate to the MFT technical owner if any folder contains files or if access cannot be restored cleanly."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- SFTP connection to the target MFT environment.",
        "- Folder listing before changes for relevant parent paths.",
        "- Folder creation results.",
        "- MFT Console User Access configuration for each requested user.",
        "- Assigned permissions.",
        "- Final validation results.",
        "- Rollback evidence, if applicable.",
        "",
        "Share final execution result with the RFC requester/customer."
      ].join("\n")
    }
  ];
}

function buildMftDeploymentPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const artifacts = mftArtifacts(text);
  const missingArtifacts = missingMftArtifacts(text);
  const missingXmlArtifacts = missingArtifacts.filter((item) => /\.xml$/i.test(item));
  const xmlArtifacts = artifacts.filter((item) => /\.xml$/i.test(item));
  const zipArtifacts = artifacts.filter((item) => /\.zip$/i.test(item));
  const pgpArtifacts = artifacts.filter((item) => /\.asc$/i.test(item));
  const transferRules = mftTransferRules(text);
  const sources = mftSources(text);
  const targets = mftTargets(text);
  const actions = mftActions(text);
  const importOnly = hasMftImportOnlyInstruction(text);
  const blockedByMissingXml = missingXmlArtifacts.length > 0;
  const deployAllowed = !importOnly && !blockedByMissingXml;
  const instance = text.match(/\b(?:Target instance|Instance):\s*([A-Z0-9_-]+)/i)?.[1]?.trim() ?? "";
  const targetEnvironment = [selectedEnvironment, instance].filter(Boolean).join(" / ") || selectedEnvironment || "target MFT environment";
  const artifactLines = artifacts.length ? asBullets(artifacts) : "- Confirm the MFT package and key artifacts attached to the RFC.";
  const transferLines = transferRules.length ? asBullets(transferRules) : "- Validate transfer rules imported from the MFT package.";
  const sourceLines = sources.length ? asBullets(sources) : "- Validate sources imported from the MFT package.";
  const targetLines = targets.length ? asBullets(targets) : "- Validate targets imported from the MFT package.";
  const actionLines = actions.length ? asBullets(actions) : "- Validate security/processing actions imported from the MFT package.";
  const pgpLines = pgpArtifacts.length ? asBullets(pgpArtifacts) : "- Confirm whether a PGP key artifact is required for this RFC.";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        `Validate access to the target MFT environment before starting the import: ${targetEnvironment}.`,
        blockedByMissingXml
          ? "Execution blocker: the IM090 requires a configuration plan XML that is not loaded. Do not import or deploy until the missing XML is attached or the requester confirms an approved replacement."
          : importOnly
          ? "Confirm the current RFC scope is import only. Do not deploy, start, activate, or execute any transfer rule."
          : "Confirm the RFC is approved for the production MFT instance before importing or deploying any transfer configuration.",
        "Confirm MFT admin access and any required credentials are available through the approved secure channel.",
        "Do not capture or expose password values, private key contents, or passphrases in the Action Plan or RFC evidence.",
        "",
        "Artifacts detected:",
        artifactLines,
        missingArtifacts.length ? "\nMissing artifact(s) that must be resolved before execution:" : "",
        missingArtifacts.length ? asBullets(missingArtifacts) : "",
        xmlArtifacts.length ? "\nConfiguration plan artifact(s) required by the IM090:" : "",
        xmlArtifacts.length ? asBullets(xmlArtifacts) : "",
        zipArtifacts.length ? "\nArchive artifact(s) required by the IM090:" : "",
        zipArtifacts.length ? asBullets(zipArtifacts) : "",
        "",
        "PGP/security artifact handling:",
        pgpLines,
        "Import or validate key material only through the approved MFT security/key management procedure."
      ].join("\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before importing the new package, capture current MFT configuration evidence.",
        "",
        "Capture/export if available:",
        "- Current import/configuration status for matching transfer rules.",
        "- Existing transfer rule definitions that will be replaced or updated.",
        "- Existing source and target definitions that match the package content.",
        "- Existing security/PGP action configuration and key aliases without exposing key material.",
        "",
        "If a matching configuration does not exist, document that backup is not applicable for that component."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        blockedByMissingXml ? "Do not execute the import. Resolve the missing configuration plan XML before proceeding." : importOnly ? "Import the MFT package only. Do not deploy the transfer rules." : "Import and deploy the MFT package.",
        "",
        "1. Login to the target MFT console using the approved admin account.",
        "2. Navigate to the MFT design/import area for transfer configuration packages.",
        "3. Select the approved archive ZIP package attached to this RFC:",
        zipArtifacts.length ? zipArtifacts.map((item) => `   - ${item}`).join("\n") : "   - <MFT package ZIP>",
        "4. Select the approved configuration plan XML required by the IM090:",
        xmlArtifacts.length ? xmlArtifacts.map((item) => `   - ${item}`).join("\n") : "   - <MFT configuration plan XML>",
        "5. Click Import to apply the package import.",
        "6. Review the import summary and confirm there are no import errors.",
        "7. Import or validate required PGP/security key material using the approved secure procedure:",
        pgpArtifacts.length ? pgpArtifacts.map((item) => `   - ${item}`).join("\n") : "   - <PGP key artifact, if applicable>",
        "8. Validate or adjust imported sources:",
        sourceLines,
        "9. Validate or adjust imported targets:",
        targetLines,
        "10. Validate or adjust imported security/processing actions:",
        actionLines,
        "11. Save imported configuration changes if prompted.",
        blockedByMissingXml
          ? "12. Stop. Do not click Import or Deploy until the missing configuration plan XML is provided or formally waived."
          : importOnly
          ? "12. Stop after import/save. Do not click Deploy and do not run transfer functionality validation."
          : "12. Deploy the imported transfer rule(s):",
        deployAllowed ? transferLines : "",
        blockedByMissingXml ? "13. Capture the RFI/blocker evidence." : importOnly ? "13. Capture import confirmation evidence." : "13. Capture the import/deploy confirmation evidence."
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: [
        importOnly
          ? "Not applicable. The current RFC scope is import only; do not deploy, start, activate, or schedule transfer execution."
          : blockedByMissingXml
          ? "Not applicable while the required configuration plan XML is missing."
          : "Not applicable unless the imported transfer package includes a separate scheduled activation step.",
        "",
        importOnly || blockedByMissingXml ? "Confirm transfer rule(s) are not deployed under the current blocker/scope:" : "Confirm deployed transfer rule(s):",
        transferLines
      ].join("\n"),
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        blockedByMissingXml ? "Validate the blocker state. Do not validate deployment." : importOnly ? "Validate the imported MFT configuration without deploying transfer rules." : "Validate the imported MFT configuration after deployment.",
        "",
        blockedByMissingXml ? "1. Confirm the required configuration plan XML is missing and the RFC remains blocked/pending customer response:" : importOnly ? "1. Confirm the transfer rule(s) are imported and visible in MFT Designer:" : "1. Confirm the transfer rule(s) are deployed successfully:",
        blockedByMissingXml ? asBullets(missingXmlArtifacts) : transferLines,
        blockedByMissingXml ? "" : "",
        blockedByMissingXml ? "2. Confirm no import or deploy action was executed." : "2. Confirm source definitions are present and configured:",
        blockedByMissingXml ? "" : sourceLines,
        blockedByMissingXml ? "3. Keep validation limited to artifact/readiness checks until the missing XML is resolved." : "",
        blockedByMissingXml ? "" : "",
        blockedByMissingXml ? "" : "3. Confirm target definitions are present and configured:",
        blockedByMissingXml ? "" : targetLines,
        blockedByMissingXml ? "" : "",
        blockedByMissingXml ? "" : "4. Confirm security/PGP actions and key aliases are present without exposing private key material:",
        blockedByMissingXml ? "" : actionLines,
        blockedByMissingXml ? "" : "",
        blockedByMissingXml ? "" : importOnly ? "5. Confirm no transfer rule was deployed, started, activated, or executed." : "5. Confirm there are no deployment or validation errors in the MFT console.",
        blockedByMissingXml ? "" : importOnly ? "6. Do not perform file pickup/send functional validation unless a new RFC update explicitly authorizes deployment/execution." : "6. If business validation is required, coordinate a controlled file transfer test with the requester/owner."
      ].filter(Boolean).join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        blockedByMissingXml ? "If the required configuration plan XML is missing, do not proceed with import or deployment." : importOnly ? "If import or key validation fails, stop execution and capture the error details." : "If import, key validation, or deployment fails, stop execution and capture the error details.",
        "",
        "Rollback/contingency:",
        blockedByMissingXml ? "1. Keep the RFC in awaiting-customer/RFI status until the missing XML is attached or formally waived." : importOnly ? "1. Do not deploy or execute any transfer as part of troubleshooting." : "1. Undeploy the transfer rule(s) changed by this RFC, if they were partially deployed.",
        blockedByMissingXml ? "2. If the requester confirms the ZIP replaces the XML, update the Action Plan evidence with that confirmation before execution." : importOnly ? "2. Remove or restore imported transfer/source/target/security configuration using backup/export evidence, if rollback is approved." : "2. Restore the previous transfer/source/target/security configuration using the backup/export evidence.",
        blockedByMissingXml ? "3. Regenerate the Action Plan after the artifact discrepancy is resolved." : importOnly ? "3. Revalidate import/configuration status after restoration." : "3. Revalidate deployment status after restoration.",
        "4. Escalate to the MFT technical owner before retrying with different package, endpoint, key, or credential values."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- MFT target environment and instance.",
        "- Backup/export or current-state evidence.",
        blockedByMissingXml ? "- RFI/blocker evidence showing the missing configuration plan XML." : "- ZIP package import summary.",
        xmlArtifacts.length ? "- Configuration plan XML selection/import evidence." : "",
        "- PGP/security key validation evidence without key material or passphrases.",
        blockedByMissingXml ? "- Evidence that no import, deploy, start, activation, or transfer execution was performed." : importOnly ? "- Transfer rule import confirmation, without deployment evidence." : "- Transfer rule deployment confirmation.",
        blockedByMissingXml ? "" : "- Source, target, and security action validation.",
        importOnly ? "- Evidence that no transfer was deployed, started, activated, or executed." : "",
        "- Final validation result.",
        "- Rollback evidence, if applicable.",
        "",
        "Share final execution result with the RFC requester/customer."
      ].join("\n")
    }
  ];
}

function buildMftImplementationSteps(text: string) {
  const transferRule = mftTransferRules(text)[0] ?? "<Transfer rule>";
  const targets = mftTargets(text);
  const actions = mftActions(text);
  const action = actions[0] ?? "<Processing action>";
  const url = mftConsoleUrl(text) || "<MFT console URL>";
  const targetSteps = targets.length
    ? targets.map((target, index) => {
      const stepNumber = 4 + index;
      return `${stepNumber}. Remove ${action} preprocessing action from target:\n   - ${target}\n\n   Steps:\n   ${stepNumber}.1. In Transfer Definition, locate target:\n         ${target}\n   ${stepNumber}.2. Open Preprocessing Actions.\n   ${stepNumber}.3. Select:\n         1. ${action}\n   ${stepNumber}.4. In Selected Actions, delete:\n         ${action}\n   ${stepNumber}.5. Click OK to confirm the change.`;
    }).join("\n\n")
    : `4. Remove or update the affected preprocessing action.\n\n   Steps:\n   4.1. In Transfer Definition, locate the affected target.\n   4.2. Open Preprocessing Actions.\n   4.3. Select the affected processing action.\n   4.4. Apply the approved configuration change.\n   4.5. Click OK to confirm the change.`;
  const finalStep = targets.length ? 4 + targets.length : 5;

  return [
    "Implementation steps are based on customer-provided instructions and will be executed as documented.",
    "",
    "1. Access the MFT Console:",
    url,
    "",
    "2. Undeploy the transfer rule:",
    `   - ${transferRule}`,
    "",
    "   Steps:",
    "   2.1. Navigate to Monitoring.",
    "   2.2. Open Deployments from the left-hand menu.",
    "   2.3. In Display, select Transfers Only.",
    "   2.4. Locate transfer rule:",
    `         ${transferRule}`,
    "   2.5. Select the transfer rule.",
    "   2.6. Click Undeployment.",
    "   2.7. Confirm the undeployment request by clicking Yes.",
    "   2.8. Wait for completion confirmation and click OK.",
    "",
    "3. Update transfer rule:",
    `   - ${transferRule}`,
    "",
    "   Steps:",
    "   3.1. Navigate to Design.",
    "   3.2. Click Search Artifacts.",
    "   3.3. In Search, select Transfers.",
    "   3.4. Search for:",
    `         ${transferRule}`,
    "   3.5. Open the transfer rule from the search results.",
    "",
    targetSteps,
    "",
    `${finalStep}. Save and deploy the updated transfer rule.`,
    "",
    "   Steps:",
    `   ${finalStep}.1. Click Save.`,
    `   ${finalStep}.2. Click Deploy.`,
    `   ${finalStep}.3. In the Deploy Transfer window, click Deploy to complete deployment.`
  ].join("\n");
}

export function buildMftConfigurationPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  if (hasMftDeploymentInstructions(text)) return buildMftDeploymentPlan(text, selectedEnvironment);
  if (hasMftFolderAccessInstructions(text)) return buildMftFolderAccessPlan(text, selectedEnvironment);
  const transferRule = mftTransferRules(text)[0] ?? "<Transfer rule>";
  const targets = mftTargets(text);
  const actions = mftActions(text);
  const action = actions[0] ?? "<Processing action>";
  const targetLines = targets.length ? asBullets(targets) : "- Confirm affected MFT targets.";
  const actionLines = actions.length ? asBullets(actions) : "- Confirm affected processing actions.";
  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "1. Validate access to the target MFT console before starting the change.",
        `2. Validate the target transfer rule exists:\n- ${transferRule}`,
        `3. Validate the affected targets and processing action exist in the transfer definition:\n${targetLines}\n${actionLines}`,
        "4. Confirm the approved change window and validate the transfer rule can be undeployed and deployed during execution."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before implementing the change, capture evidence of the current configuration.",
        "",
        "Capture:",
        "- Current deployment status of the transfer rule",
        "- Current transfer rule configuration",
        "- Current source and target configuration details",
        "- Current preprocessing actions for affected targets",
        `- Current ${action} configuration prior to removal`,
        "",
        "If MFT export/versioning functionality is available, export or save the current transfer rule configuration before execution."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Implementation Steps",
      content: buildMftImplementationSteps(text)
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: `Not applicable unless a separate activation schedule is required by the RFC.\n\nConfirm the transfer rule:\n- ${transferRule}\n\nis successfully deployed after the update.`
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the transfer rule and configuration after deployment.",
        "",
        "1. Navigate to:\n   Monitoring > Deployments",
        "2. Select:\n   Transfers Only",
        `3. Confirm transfer rule:\n   ${transferRule}\n\n   is successfully deployed.`,
        "4. Navigate to:\n   Design > Search Artifacts",
        `5. Open transfer rule:\n   ${transferRule}`,
        targets.map((target, index) => `${6 + index}. Validate target:\n   - ${target}\n\n   no longer contains the ${action} preprocessing action.`).join("\n\n"),
        `${6 + targets.length}. Capture evidence of:\n   - Final deployment status\n   - Final transfer configuration\n   - Updated preprocessing actions`
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the update or deployment fails, stop execution and capture all error details before proceeding.",
        "",
        "Rollback Procedure:",
        "",
        `1. Undeploy the modified transfer rule:\n   - ${transferRule}`,
        "2. Open the transfer rule from:\n   Design > Search Artifacts",
        targets.length
          ? `3. Restore the ${action} preprocessing action for:\n${targetLines}`
          : "3. Restore the affected processing action/configuration using backup evidence.",
        "4. Save the transfer rule.",
        "5. Deploy the transfer rule.",
        "6. Validate the original preprocessing configuration has been restored successfully.",
        "7. Capture rollback evidence and deployment confirmation.",
        "",
        "If deployment or rollback issues persist:\n- Escalate to the MFT technical support team before retrying execution."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- MFT login/environment",
        "- Initial deployment status",
        "- Backup/current configuration before change",
        "- Undeployment confirmation",
        "- Configuration update evidence",
        targets.length ? `- Removal of ${action} from:\n${targets.map((target) => `  - ${target}`).join("\n")}` : `- ${action} update evidence`,
        "- Save confirmation",
        "- Deploy confirmation",
        "- Final deployment status",
        "- Final preprocessing action validation",
        "- Rollback execution evidence (if applicable)",
        "",
        "Share final execution results with the RFC requester/customer."
      ].join("\n")
    }
  ];
}

export function mftManualPlanMetadata(productName: string, environmentName: string, instanceName: string, instructions: string) {
  if (productName !== "MFT" || !hasMftInstructions(instructions)) return "";
  if (hasMftDeploymentInstructions(instructions)) {
    const artifacts = mftArtifacts(instructions);
    const transferRules = mftTransferRules(instructions);
    const sources = mftSources(instructions);
    const targets = mftTargets(instructions);
    const actions = mftActions(instructions);
    const importOnly = hasMftImportOnlyInstruction(instructions);
    const missingArtifacts = missingMftArtifacts(instructions);
    const blockedByMissingXml = missingArtifacts.some((item) => /\.xml$/i.test(item));
    return [
      "Environment:",
      `- MFT Instance: ${instanceName}`,
      "",
      "Estimated Duration:",
      "30-45 minutes",
      "",
      "Impact:",
      blockedByMissingXml
        ? "- Execution blocked. Required MFT configuration plan XML is missing."
        : importOnly
        ? "- Import-only change. No transfer rule deployment or file processing impact expected."
        : "- MFT transfer configuration will be imported/deployed in the target environment.",
      blockedByMissingXml
        ? "- No import, deploy, start, activation, or file processing should be performed until the artifact discrepancy is resolved."
        : importOnly
        ? "- No transfer should be started, activated, deployed, or functionally executed under the current RFC scope."
        : "- File transfer impact depends on the deployed transfer rules and should be coordinated with the requester/owner.",
      "",
      "Scope:",
      `- ${environmentName} environment only`,
      "",
      "Expected Outcome:",
      blockedByMissingXml
        ? "Missing configuration plan XML is resolved before any MFT import or deployment activity proceeds."
        : importOnly
        ? "MFT package imported and required security/key material validated without deploying transfer rules."
        : "MFT package imported, required security/key material validated, and transfer rules deployed successfully.",
      "",
      artifacts.length ? `Artifacts:\n${asBullets(artifacts)}` : "",
      "",
      missingArtifacts.length ? `Missing Artifacts:\n${asBullets(missingArtifacts)}` : "",
      "",
      transferRules.length ? `Transfer Rules:\n${asBullets(transferRules)}` : "",
      "",
      sources.length ? `Sources:\n${asBullets(sources)}` : "",
      "",
      targets.length ? `Targets:\n${asBullets(targets)}` : "",
      "",
      actions.length ? `Security / Processing Actions:\n${asBullets(actions)}` : ""
    ].filter(Boolean).join("\n");
  }
  if (hasMftFolderAccessInstructions(instructions)) {
    const folders = mftFolderPaths(instructions);
    const users = mftAccessUsers(instructions);
    const permissions = mftAccessPermissions(instructions);
    return [
      "Environment:",
      `- MFT Instance: ${instanceName}`,
      "",
      "Estimated Duration:",
      "20-30 minutes",
      "",
      "Impact:",
      "- No transfer rule deployment impact expected.",
      "- Access impact is limited to the requested folders and users.",
      "",
      "Scope:",
      `- ${environmentName} environment only`,
      "",
      "Expected Outcome:",
      "Requested MFT folders created and requested users assigned with the approved folder permissions.",
      "",
      folders.length ? `Folders:\n${asBullets(folders)}` : "",
      "",
      users.length ? `Users:\n${asBullets(users)}` : "",
      "",
      permissions.length ? `Permissions:\n${asBullets(permissions)}` : ""
    ].filter(Boolean).join("\n");
  }
  const transferRule = mftTransferRules(instructions)[0] ?? "<Transfer rule>";
  const targets = mftTargets(instructions);
  const actions = mftActions(instructions);
  const action = actions[0] ?? "<Processing action>";
  const url = mftConsoleUrl(instructions);
  const isProd = /PROD|PR/i.test(environmentName);
  return [
    "Environment:",
    `- MFT Instance: ${instanceName}`,
    url ? `- URL: ${url}` : "",
    "",
    "Estimated Duration:",
    "15-20 minutes",
    "",
    "Impact:",
    "Temporary interruption of transfer processing for:",
    `- ${transferRule}`,
    "",
    `during undeployment/deployment activities in the ${environmentName} environment.`,
    "",
    "Scope:",
    `- ${environmentName} environment only`,
    isProd ? "- Production impact must be confirmed with the RFC approver" : "- No production impact expected",
    "",
    "Expected Outcome:",
    `${transferRule} deployed successfully with the requested configuration updates.`,
    "",
    targets.length ? `Affected Targets:\n${asBullets(targets)}` : "",
    "",
    "Configuration Change:",
    `- Removal of the ${action} preprocessing action from the affected targets`
  ].filter(Boolean).join("\n");
}
