import { cleanArtifactCandidate } from "./artifacts";
import { asBullets } from "./common";
import type { ManualActionPhase } from "./types";

export function hasMftInstructions(text: string) {
  return /\b(?:MFT|mftconsole|transfer rule|Deploy Transfer|Preprocessing Actions|Search Artifacts)\b/i.test(text);
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

export function mftConfigurationItems(text: string) {
  const items: string[] = [];
  const transferMatches = [
    ...text.matchAll(/\btransfer rule(?: named| name)?[:\s"]+([A-Z0-9_ -]{6,})/gi),
    ...text.matchAll(/\btransfer name:\s*([A-Z0-9_ -]{6,})/gi),
    ...text.matchAll(/\bPROCESS\s+(?:TO\s+\w+\s+THE\s+)?TRANSFER RULE\s*\(([A-Z0-9_ -]{6,})\)/gi)
  ];
  for (const match of transferMatches) {
    const value = cleanMftCandidate(match[1]);
    if (isLikelyMftTransferRuleName(value)) items.push(`Transfer Rule: ${value}`);
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

function mftActions(text: string) {
  return mftConfigurationItems(text)
    .filter((item) => item.startsWith("Processing Action: "))
    .map((item) => item.replace(/^Processing Action:\s*/, ""));
}

function mftConsoleUrl(text: string) {
  return text.match(/https?:\/\/\S*?mftconsole\b/i)?.[0].replace(/[).,;]+$/g, "") ?? "";
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
