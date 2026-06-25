import { extractArtifactNames, installableArtifactNames, preferCanonicalOicIarArtifacts } from "./artifacts";
import {
  actionPlanLinesFromIm090,
  asBullets,
  environmentSectionFromDocument,
  filterEnvironmentSection,
  hasNumberedInstructionSteps,
  looseSectionByHeadings,
  normalizeEnvironmentName,
  operationalIm090Text,
  prepareManualPhaseContent,
  sectionByAnyHeading
} from "./common";
import type { ManualActionPhase } from "./types";

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function oicBackupFallback(ignoreLookups = false, integrations: string[] = []) {
  const integrationLine = integrations.length
    ? `If ${integrations.join(" or ")} already exists, export the current integration before deactivating or deleting it.`
    : "If the target integration already exists, export the current integration before deactivating or deleting it.";
  return [
    "Before installing, search for the existing integration in the target OIC environment.",
    integrationLine,
    ignoreLookups ? "" : "Export or capture current lookup values before replacing or updating lookup content.",
    "Attach backup files or backup evidence to the RFC.",
    "If backup is not applicable, document the reason in the RFC evidence."
  ].filter(Boolean).join("\n");
}

function oicScopeActivitySection(text: string, startLabel: RegExp, endLabel: RegExp) {
  const start = text.search(startLabel);
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.slice(1).search(endLabel);
  return end >= 0 ? rest.slice(0, end + 1) : rest.slice(0, 2500);
}

function oicVersionedBulletItems(section: string) {
  return Array.from(section.matchAll(/^[\t ]*[*•-]\s*([A-Z][A-Z0-9_]{5,})(?:\s*\(([^)\r\n]+)\))?/gim))
    .map((match) => ({
      name: match[1]?.trim() ?? "",
      version: match[2]?.trim() ?? ""
    }))
    .filter((item) => item.name);
}

function formatOicVersionedItems(items: Array<{ name: string; version?: string }>) {
  return asBullets(items.map((item) => item.version ? `${item.name} (${item.version})` : item.name));
}

function oicScopeBackupPlan(text: string, ignoreLookups = false) {
  const integrationSection = oicScopeActivitySection(
    text,
    /\bGet backup of integrations?\b/i,
    /\n\s*\d+\.\s+(?:Get backup of lookups?|Import(?:ation)?|Configuration|Active|Activate|Start|Artifacts location)\b|\n\s*Best regards\b/i
  );
  const lookupSection = ignoreLookups ? "" : oicScopeActivitySection(
    text,
    /\bGet backup of lookups?\b/i,
    /\n\s*\d+\.\s+(?:Import(?:ation)?|Configuration|Active|Activate|Start|Artifacts location)\b|\n\s*Best regards\b/i
  );
  const integrations = oicVersionedBulletItems(integrationSection);
  const lookups = oicVersionedBulletItems(lookupSection);
  if (!integrations.length && !lookups.length) return "";
  return [
    "Before installing, confirm whether each listed component exists in the target OIC environment.",
    integrations.length ? `Export integration backup(s) as .iar if they exist:\n${formatOicVersionedItems(integrations)}` : "",
    lookups.length ? `Export lookup backup(s) as .csv if they exist:\n${formatOicVersionedItems(lookups)}` : "",
    "If any component does not exist, capture search evidence and document that backup was not applicable.",
    "Attach backup files or backup evidence to the RFC before continuing."
  ].filter(Boolean).join("\n");
}

function oicScheduleFallback() {
  return "Not applicable for this integration unless a schedule is explicitly required by the IM090.";
}

function oicScheduleContentIsNotApplicable(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (/^(?:\d+(?:\.\d+)*\s+)?Schedule activation$/i.test(normalized)) return true;
  return /\bN\/A\b|\bnot applicable\b/i.test(content) &&
    !/\bevery\s+\d+|\bstart schedule\b|\bstart running\b|\bfrequency\b/i.test(content);
}

function hasOicConnectionOnlyInstructions(text: string) {
  return /\bConnections?>\s*OIC\b|R\d-?OIC\s*CONNECTIONS|Configuration\s*Instructions\s*connectors|Configuration\s*Steps/i.test(text) &&
    /\bConnection\s*Name\s*:|\bSearch\s*for\s*[“"]?[A-Z0-9_]{6,}[”"]?\s*connection/i.test(text) &&
    !/\bInstallation artifacts\b|\.iar\b|\bImport button\b|\bActivate\b[\s\S]{0,40}\bintegration\b/i.test(text);
}

function hasOicLookupOnlyInstructions(text: string) {
  return /\bLookups?>\s*OIC\b|\bImport\s+Lookups?\b|\bUpdate\s+Lookups?\b|\bInstallation Instructions for Import Lookups?\b|\bExport General Lookup\b|\bImport General Lookup\b|\bDesign\s*>\s*Lookups?\b/i.test(text) &&
    /\blookups?\b[\s\S]{0,220}\b(?:Export CSV|Import and Replace|Import and replace|Import button|Choose File|Drag and Drop|\.csv)\b|\b(?:Export CSV|Import and Replace|Import and replace)\b[\s\S]{0,220}\blookups?\b|\b[A-Z][A-Z0-9_]{5,}\.csv\b/i.test(text) &&
    !/\bInstallation artifacts\b|\.iar\b|\bActivate\b[\s\S]{0,40}\bintegration\b/i.test(text);
}

function hasVisualBuilderExportWithDataInstructions(text: string) {
  return /\bVisual Builder\b/i.test(text) &&
    /\bExport with Data\b|\bexports?\b[\s\S]{0,120}\bobjects?\s+Visual Builder\b|\bVisual Builder\b[\s\S]{0,160}\bexport/i.test(text) &&
    !/\bImport\b[\s\S]{0,80}\bVisual Builder\b|\bdeploy\b|\bactivate\b/i.test(text);
}

function visualBuilderProjectName(text: string) {
  return firstMatch(text, [
    /\bproject named:\s*([A-Za-z0-9_. -]+?)(?:\s+version\b|\s+on\b|\.|\n|$)/i,
    /\bproject\s+([A-Za-z0-9_. -]+?)\s+version\s+\d+(?:\.\d+)+/i
  ]);
}

function visualBuilderProjectVersion(text: string) {
  return firstMatch(text, [/\bversion\s+(\d+(?:\.\d+)+)\b/i]);
}

function visualBuilderProjectStatus(text: string) {
  return firstMatch(text, [/\bon\s+([A-Za-z ]+?)\s+Status\b/i, /\bStatus\s*:?\s*([A-Za-z ]+)/i]);
}

function visualBuilderOicUrl(text: string) {
  return cleanOicConnectionValue(firstMatch(text, [/\bLogin to OIC Instance\s*\((https?:\/\/[^)\s]+)\)/i, /\b(https?:\/\/[^\s)]+\/ic\/home\/?)/i]));
}

function credentialSessionMessage() {
  return "Customer action required: coordinate a working session with the password administrator to enter or validate connection credentials during execution. Do not request, capture, or document password values in the RFC.";
}

function isOicManagedConnection(value: string) {
  return /^PRESEEDED_/i.test(value) || /^COLLOCATED/i.test(value) || /^LOCAL(?:_|\s)/i.test(value);
}

function oicInstallationFallback(
  scope: ReturnType<typeof oicScopeOverrides>,
  metadata: ReturnType<typeof oicDetectedMetadata>,
  artifacts: string[],
  selectedEnvironment: string,
  text: string
) {
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ");
  const indentNestedBullets = (value: string) => value.replace(/\n-/g, "\n   -");
  const integrationArtifacts = artifacts.filter((artifact) => !/\.csv$/i.test(artifact));
  const lookupArtifacts = artifacts.filter((artifact) => /\.csv$/i.test(artifact));
  const lines: string[] = [
    target ? `Login to the Oracle Cloud Integration Admin Console for ${target}.` : "Login to the target Oracle Cloud Integration Admin Console.",
    "Go to Integrations.",
    metadata.integrations.length ? `Search for ${metadata.integrations.join(" or ")}.` : "Search for the target integration.",
    "If the same integration/version already exists, export a backup, deactivate it, and delete it.",
    integrationArtifacts.length ? `Import the integration artifact(s) without activation:\n${asBullets(integrationArtifacts)}` : "Import the integration artifact from the IM090 package without activation.",
    lookupArtifacts.length && !scope.ignoreLookups ? `Import the lookup CSV file(s):\n${asBullets(lookupArtifacts)}` : "",
    metadata.connections.length
      ? `${scope.commonConnectionsMayExist ? "Validate" : "Configure and validate"} the required connection(s):\n${asBullets(metadata.connections)}`
      : "",
    metadata.connections.length ? credentialSessionMessage() : "",
    scope.commonConnectionsMayExist ? "Configure only missing or failing connections using credentials entered during the approved password administrator working session." : "",
    scope.ignoreLookups ? "Do not execute lookup import/configuration steps." : "",
    scope.ignoreDashboard ? "Do not execute Dashboard / Visual Builder validation steps." : "",
    metadata.integrations.length ? `Activate ${metadata.integrations.join(" and ")}.` : "Activate the imported integration.",
    "Refresh activation status until the integration is active."
  ];
  return lines.filter(Boolean).map((line, index) => `${index + 1}. ${indentNestedBullets(line)}`).join("\n");
}

function oicScopeOverrides(text: string) {
  const hasConnectionCredentialScope = /\bconnections?\b/i.test(text) && /\b(?:passwords?|credentials?|username|security policy|authentication)\b/i.test(text);
  const lookupImportIsOptional = /\blookups?\b[\s\S]{0,220}\bnot mandatory unless explicitly required\b|\bOnly import the lookups specified in the RFC\b/i.test(text);
  return {
    ignoreDashboard: /\b(?:ignore|exclude|do not (?:install|validate|modify|include)|no incluir|ignorar)\b[\s\S]{0,120}\b(?:dashboard|visual builder)\b|\b(?:dashboard|visual builder)\b[\s\S]{0,120}\b(?:separated RFC|separate RFC|another RFC|ignore|exclude)\b/i.test(text),
    ignoreLookups: lookupImportIsOptional || /\b(?:ignore|exclude|do not (?:import|configure|modify|include)|no incluir|ignorar)\b[\s\S]{0,120}\blookups?\b|\blookups?\b[\s\S]{0,120}\b(?:separated RFC|separate RFC|another RFC|ignore|exclude)\b/i.test(text),
    commonConnectionsMayExist: /\bconnections?\b[\s\S]{0,160}\b(?:common use|already configured|could be already configured|ignore them if that's the case)\b/i.test(text),
    requiresOnlineCredentialSession: hasConnectionCredentialScope || /\b(?:credentials?|passwords?)\b[\s\S]{0,180}\b(?:session|secure channel|owner|administrator)\b/i.test(text)
  };
}

function oicScopeConnectionBlocks(text: string, connection: string) {
  const escaped = connection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startPattern = new RegExp(`(?:^|\\n)\\s*(?:[*•-]\\s*)?${escaped}(?=\\s|:|$)`, "gi");
  const blocks: string[] = [];
  for (const match of text.matchAll(startPattern)) {
    const start = match.index ?? 0;
    const rest = text.slice(start);
    const endMatch = rest.slice(1).search(
      /\n\s*(?:[*•-]\s*)?CONN_[A-Z0-9_]{5,}\b|\n\s*\d+\.\s+(?:Get backup|Import(?:ation)?|Active|Activate|Start|Artifacts location)\b|\n\s*Best regards\b/i
    );
    blocks.push(endMatch >= 0 ? rest.slice(0, endMatch + 1) : rest.slice(0, 1200));
  }
  return blocks;
}

function oicScopeConnectionEndpoint(text: string, connection: string) {
  for (const block of oicScopeConnectionBlocks(text, connection)) {
    const match = block.match(/\b(?:Connection URL|WSDL ERP Cloud Host|WSDL URL|URL|Host)\s*:\s*(https?:\/\/[^\s<>"']+)/i);
    if (match?.[1]) return cleanOicConnectionValue(match[1]);
  }
  return "";
}

function targetInstanceFromText(text: string) {
  return text.match(/\bTarget instance:\s*([A-Z0-9_-]+)/i)?.[1]?.trim() ?? "";
}

function environmentNameFromContent(content: string) {
  return content.match(/\bEnvironment Name:\s*([A-Z0-9 _-]+?)(?:\s+(?:IC|OIC) Service Environment:|\s+OIC Admin Console:|\s+ERP Host:|$)/i)?.[1]?.trim() ?? "";
}

function serviceEnvironmentFromContent(content: string) {
  return content.match(/\b(?:IC|OIC) Service Environment:\s*([A-Z0-9_-]+)/i)?.[1]?.trim() ?? "";
}

function environmentBlocksFromDocument(text: string) {
  const section = environmentSectionFromDocument(text);
  if (!section) return [];
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const starts = lines
    .map((line, index) => (/^Environment Name:/i.test(line) ? index : -1))
    .filter((index) => index >= 0);
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

function strictEnvironmentBlockFromDocument(text: string, selectedEnvironment: string) {
  const aliases = strictEnvironmentAliases(selectedEnvironment);
  if (!aliases.length) return "";
  for (const block of environmentBlocksFromDocument(text)) {
    const name = normalizeEnvironmentName(environmentNameFromContent(block));
    if (aliases.includes(name)) return block;
  }
  return "";
}

function environmentBlockForTargetInstance(text: string) {
  const targetInstance = targetInstanceFromText(text);
  if (!targetInstance) return "";
  const target = normalizeEnvironmentName(targetInstance);
  return environmentBlocksFromDocument(text).find((block) => normalizeEnvironmentName(serviceEnvironmentFromContent(block)) === target) ?? "";
}

function environmentValue(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`\\b${escaped}:\\s*(\\S+)`, "i"))?.[1]?.trim() ?? "";
}

function cleanFusionHost(value: string) {
  return value.replace(/\/fscmUI\/faces\/FuseWelcome\/?$/i, "").replace(/\/+$/, "");
}

function strictEnvironmentAliases(environment: string) {
  const selected = normalizeEnvironmentName(environment);
  if (selected === "REG") return ["REG", "REGRESSION"];
  if (selected === "TEST") return ["TEST", "PREPROD", "TE"];
  if (selected === "PREPROD" || selected === "TE") return ["TEST", "PREPROD", "TE"];
  if (selected === "PROD" || selected === "PRODUCTION" || selected === "PR") return ["PROD", "PRODUCTION", "PR"];
  if (selected === "DEV" || selected === "DEVELOPMENT") return ["DEV", "DEVELOPMENT"];
  return selected ? [selected] : [];
}

function hasStrictEnvironmentData(environmentSection: string, selectedEnvironment: string) {
  const strictAliases = strictEnvironmentAliases(selectedEnvironment);
  if (!environmentSection || !strictAliases.length) return false;
  const environmentNames = Array.from(environmentSection.matchAll(/\bEnvironment Name:\s*([A-Z0-9 _-]+?)(?:\s+(?:IC|OIC) Service Environment:|\s+OIC Admin Console:|\s+ERP Host:|$)/gi))
    .map((match) => normalizeEnvironmentName(match[1] ?? ""));
  return environmentNames.some((name) => strictAliases.includes(name));
}

function oicEnvironmentExecutionContext(environmentContent: string, environmentContentRaw: string, selectedEnvironment: string, text: string) {
  const selected = normalizeEnvironmentName(selectedEnvironment);
  const referenceEnvironment = environmentNameFromContent(environmentContent);
  const referenceInstance = serviceEnvironmentFromContent(environmentContent);
  const targetInstance = targetInstanceFromText(text);
  const reference = normalizeEnvironmentName(referenceEnvironment);
  if (selected && reference && !hasStrictEnvironmentData(environmentContentRaw, selectedEnvironment)) {
    return [
      `Target environment: ${selectedEnvironment}.`,
      targetInstance ? `Target instance: ${targetInstance}.` : `Target instance: confirm the ${selectedEnvironment} instance from the RFC before execution.`,
      `IM090 reference section: ${referenceEnvironment}${referenceInstance ? ` / ${referenceInstance}` : ""} (non-production reference only).`,
      `The IM090 does not include connection data for ${selectedEnvironment}. Use the referenced IM090 section only as procedural guidance and validate final URLs, credentials, and access against the RFC target environment before execution.`,
      referenceInstance && targetInstance && normalizeEnvironmentName(referenceInstance) !== normalizeEnvironmentName(targetInstance)
        ? `Do not use ${referenceInstance} as the execution target unless the RFC owner explicitly confirms it.`
        : ""
    ].filter(Boolean).join("\n");
  }
  return environmentContent;
}

function fullUrlWithFragment(text: string, fragment: string) {
  if (!fragment) return "";
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`https?:\\/\\/\\S*${escaped}\\S*`, "i"))?.[0]?.replace(/[).,;]+$/, "") ?? "";
}

function repairOicTargetEnvironmentContent(content: string, text: string) {
  const targetInstance = targetInstanceFromText(text).toLowerCase();
  const targetOicUrl = fullUrlWithFragment(text, targetInstance);
  if (!targetOicUrl) return content;
  return content
    .split("\n")
    .map((line) => {
      if (/^\s*(?:Test|Dev|Production|Prod|Regression|Pre[- ]?Prod)\s+OIC\b/i.test(line) && targetInstance && line.toLowerCase().includes(targetInstance)) {
        return line.replace(/https?:\/\/\S+/i, targetOicUrl);
      }
      return line;
    })
    .join("\n");
}

function oicTargetEnvironmentSummary(text: string, selectedEnvironment: string) {
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target OIC environment";
  const oicUrl = oicAdminConsoleUrlForTarget(text, selectedEnvironment);
  const erpIntegrationWsdl = oicScopeConnectionEndpoint(text, "CONN_ERP_INTSERV_INVK");
  return [
    `Target environment: ${target}.`,
    oicUrl ? `OIC URL: ${oicUrl}` : "OIC URL: confirm the target OIC URL before execution.",
    erpIntegrationWsdl ? `ERP Integration WSDL: ${erpIntegrationWsdl}` : ""
  ].filter(Boolean).join("\n");
}

function isNonExecutablePreInstallContent(content: string) {
  const normalized = content
    .replace(/^\s*\d+(?:\.\d+)*\s+Pre[- ]Installation Steps\b/igm, "")
    .replace(/\bPre[- ]Installation Steps\b/ig, "")
    .replace(/[\s.]+/g, " ")
    .trim();
  return !normalized || /^(?:N\/A|NA|Not applicable)$/i.test(normalized);
}

function hasOicDeactivationInstructions(text: string) {
  const hasInstallationScope = /\bInstallation artifacts\b|\.iar\b|\.csv\b|\bClick on Import button\b|\bChoose file button to browse file to be imported\b/i.test(text);
  if (hasInstallationScope) return false;
  return /\b(?:deactivate|inactivate|disable|desactivar|inactivar)\b/i.test(text) &&
    /\b(?:integration|integracion|OIC|IN_[A-Z0-9_]+|OUT_[A-Z0-9_]+)\b/i.test(text);
}

function hasOicScheduledJobDisableInstructions(text: string) {
  return /\b(?:turning off scheduled job|stop scheduler components|scheduler was successfully deactivated|disable integration)\b/i.test(text) &&
    /\b(?:Schedule|Scheduler|Stop icon|Deactivate button|Configured status)\b/i.test(text) &&
    /\b(?:IN|OUT)_[A-Z0-9_]+\b/i.test(text);
}

function oicScheduleStopIntegrationCandidates(text: string) {
  return uniqueValues([
    ...Array.from(text.matchAll(/\bstop\s+scheduler\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bstop\s+schedule\s+for\s+the\s+integration\s*:?\s*((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bintegration\s*:?\s*((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gi)).map((match) => match[1])
  ]);
}

function hasOicScheduleStopOnlyInstructions(text: string) {
  const hasStopSchedule = /\b(?:stop|pause)\s+(?:the\s+)?(?:schedule|scheduler)\b|\bSchedule\b[\s\S]{0,120}\bStop\b/i.test(text);
  const hasIntegration = oicScheduleStopIntegrationCandidates(text).length > 0 || /\b(?:IN|OUT|SYNC)_[A-Z0-9_]+\b/i.test(text);
  const hasInstallScope = /\bInstallation artifacts\b|\.iar\b|\.csv\b|\bClick on Import button\b|\bChoose file button to browse file to be imported\b/i.test(text);
  const hasIntegrationDisableScope = /\b(?:deactivate|inactivate)\b|\bdisable\s+integration\b|\bDeactivate button\b|\bConfigured status\b/i.test(text);
  return hasStopSchedule && hasIntegration && !hasInstallScope && !hasIntegrationDisableScope;
}

function hasOicResetPasswordInstructions(text: string) {
  return /\bTemplate reference:\s*OIC\/IDCS reset password\b|\bIdentity Cloud Service\b[\s\S]*\bReset Password\b|\bOIC\b[\s\S]*\breset password\b/i.test(text);
}

function hasOicTracingInstructions(text: string) {
  if (/\bTemplate reference:\s*OIC (?:enable|disable) tracing\b/i.test(text)) return true;
  const hasInstallationScope = /\bInstallation artifacts\b|\.iar\b|\.csv\b|\bClick on Import button\b|\bChoose file button to browse file to be imported\b/i.test(text);
  const hasExplicitTracingChange =
    /\bActions?\s*>\s*Tracing\b|\bCurrent Tracing Status\b|\bTracing configuration\b|\b(?:enable|disable)\s+tracing\s+(?:for|on)\b|\buncheck\s+"?Enable Tracing"?/i.test(text);
  if (hasInstallationScope && !hasExplicitTracingChange) return false;
  return hasExplicitTracingChange;
}

function isOicDisableTracing(text: string) {
  return /\bTemplate reference:\s*OIC disable tracing\b|\bdisable\b[\s\S]*\btracing\b|\buncheck\s+"?Enable Tracing"?/i.test(text);
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

function removePartialIntegrationNames(values: string[]) {
  return uniqueValues(values).filter((value) => {
    const key = value.toUpperCase();
    return !values.some((other) => {
      const otherKey = other.toUpperCase();
      return otherKey !== key && otherKey.startsWith(key) && otherKey.length - key.length >= 3;
    });
  });
}

function repairWrappedOicConnectionNames(text: string) {
  return text.replace(/\b(CONN_[A-Z0-9_]{3,})\s*\n\s*(_[A-Z0-9_]{3,})\b/g, "$1$2");
}

function normalizedConnectionKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function isLikelyTruncatedConnectionAlias(value: string, other: string) {
  const key = normalizedConnectionKey(value);
  const otherKey = normalizedConnectionKey(other);
  if (key === otherKey || key.length < 8 || otherKey.length <= key.length) return false;
  if (otherKey.startsWith(key) && otherKey.length - key.length >= 8) return true;
  if (key.length < 18 || !otherKey.startsWith(key.slice(0, 12))) return false;
  const distance = editDistance(key, otherKey);
  return distance <= Math.max(4, Math.ceil(otherKey.length * 0.2));
}

function dedupeOicConnectionNames(values: string[]) {
  const unique = uniqueValues(values);
  return unique.filter((value) => !unique.some((other) => isLikelyTruncatedConnectionAlias(value, other)));
}

function linesMatching(text: string, pattern: RegExp) {
  return uniqueValues(
    text
      .split(/\r?\n/)
      .map((line) => line.match(pattern)?.[1] ?? "")
      .filter(Boolean)
  );
}

function connectionCandidatesFromText(text: string) {
  const repairedText = repairWrappedOicConnectionNames(text);
  const technicalConnections = repairedText.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_CON(?:N)?ECTION\b/g) ?? [];
  const connPrefixedConnections = repairedText.match(/\bCONN_[A-Z0-9_]+\b/g) ?? [];
  const editForConnections = Array.from(
    repairedText.matchAll(/\bedit\s+for\s+([A-Z0-9][A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const editConnectionNames = Array.from(
    repairedText.matchAll(/\bEdit connection\s+[‘'"]([^’'"]+)[’'"]/gi)
  ).map((match) => match[1]);
  const connectorNameConnections = Array.from(
    repairedText.matchAll(/\b(?:REST|DATABASE)\s+Connector Name:\s*([A-Z0-9][A-Z0-9_ .-]{4,100})/gi)
  ).map((match) => match[1]);
  const namedConnections = Array.from(
    repairedText.matchAll(/^Name:\s*([A-Z0-9][A-Z0-9_ .-]{4,100})$/gim)
  )
    .map((match) => match[1])
    .filter((value) => /\b(?:CONNECTION|API|SERVICE|AUTOMATION|ADAPTER|REST|SOAP)\b/i.test(value));
  const settingConnections = Array.from(
    repairedText.matchAll(/\bSetting Connection\s*\(([^)]+)\)/gi)
  ).map((match) => match[1]);
  const explicitSearchedConnections = Array.from(
    repairedText.matchAll(/\bSearch for\s+([A-Z0-9][A-Z0-9_ .-]{4,100}?)\s+connection,\s+this connection\b/gi)
  ).map((match) => match[1]);
  const chosenConnections = Array.from(
    repairedText.matchAll(/\bConnections area,\s+choose\s+([A-Z0-9][A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const searchedConnections = Array.from(
    repairedText.matchAll(/\bSearch for\s+([A-Z0-9][A-Z0-9_ .-]{4,80}?)\s+connection\b/gi)
  ).map((match) => match[1]);
  const reversedSearchedConnections = Array.from(
    repairedText.matchAll(/\bsearch\s+the\s+connection\s+([A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const setupConnections = Array.from(
    repairedText.matchAll(/\bconfigure\s+([A-Z0-9][A-Z0-9_ .-]{4,80}?)\b/gi)
  )
    .map((match) => match[1])
    .filter((value) => /\bCON(?:N)?ECTION\b/i.test(value));
  const values = uniqueValues([...technicalConnections, ...connPrefixedConnections, ...editForConnections, ...editConnectionNames, ...connectorNameConnections, ...namedConnections, ...settingConnections, ...explicitSearchedConnections, ...chosenConnections, ...searchedConnections, ...reversedSearchedConnections, ...setupConnections])
    .filter((value) => !/^connection$/i.test(value.trim()))
    .filter((value) => /_/.test(value) || value === value.toUpperCase());
  return values.filter((value) => {
    const key = value.toUpperCase();
    return !values.some((other) => {
      const otherKey = other.toUpperCase();
      return otherKey !== key && otherKey.startsWith(`${key} `) && otherKey.length - key.length >= 4;
    });
  });
}

function sanitizeOicSensitiveContent(content: string, options: { omitWsdlFileExamples?: boolean } = {}) {
  const artifactNames = installableArtifactNames(content);
  const wsdlFileNames = options.omitWsdlFileExamples ? artifactNames.filter((artifact) => /\.wsdl$/i.test(artifact)) : [];
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (wsdlFileNames.some((artifact) => new RegExp(`\\b${artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(trimmed))) {
        return false;
      }
      if (artifactNames.some((artifact) => artifact !== trimmed && artifact.toLowerCase().endsWith(trimmed.toLowerCase()) && artifact.length - trimmed.length >= 4)) {
        return false;
      }
      if (/^\s*Password\s*:/i.test(line)) return false;
      if (/<[^>]*password[^>]*>/i.test(line)) return false;
      if (/\b(?:please provide|must be supplied|consult).{0,80}\bpassword\b/i.test(line)) return false;
      return true;
    })
    .join("\n");
}

function connectionConfigurationNotes(text: string, connections: string[], options: { includeConnections?: boolean; includeWsdlFiles?: boolean } = {}) {
  const notes: string[] = [];
  const includeConnections = options.includeConnections ?? true;
  const includeWsdlFiles = options.includeWsdlFiles ?? true;
  const wsdlFiles = includeWsdlFiles ? installableArtifactNames(text).filter((artifact) => /\.wsdl$/i.test(artifact)) : [];
  const hasUsernamePasswordToken = /\bUsername Password Token\b/i.test(text);
  if (!connections.length && !wsdlFiles.length && !hasUsernamePasswordToken) return "";
  if (includeConnections && connections.length) notes.push(`Required connection(s):\n${asBullets(connections)}`);
  if (wsdlFiles.length) notes.push(`WSDL file(s) referenced by the connection configuration:\n${asBullets(wsdlFiles)}`);
  if (hasUsernamePasswordToken) notes.push("Security policy: Username Password Token.");
  notes.push(credentialSessionMessage());
  return notes.join("\n\n");
}

function oicTableEnvironmentLabel(selectedEnvironment: string, targetInstance: string) {
  const normalizedEnvironment = normalizeEnvironmentName(selectedEnvironment);
  const normalizedInstance = normalizeEnvironmentName(targetInstance);
  if (normalizedEnvironment === "DEV" || normalizedEnvironment === "DEVELOPMENT" || /DE$/i.test(targetInstance)) return "Dev";
  if (normalizedEnvironment === "REG" || normalizedEnvironment === "REGRESSION" || /RE$/i.test(targetInstance)) return "Regression";
  if (normalizedEnvironment === "TEST" || normalizedEnvironment === "PREPROD" || normalizedEnvironment === "TE" || /TE$/i.test(targetInstance) || normalizedInstance.endsWith("TE")) return "Test";
  if (normalizedEnvironment === "PROD" || normalizedEnvironment === "PRODUCTION" || normalizedEnvironment === "PR" || /PR$/i.test(targetInstance)) return "Prod";
  return selectedEnvironment || "target";
}

function oicConnectionTableSection(text: string, key: string) {
  const normalizedKey = key.toUpperCase();
  const configurationStart = text.search(/\bConfiguration of connections\b/i);
  const lookupStart = configurationStart >= 0 ? text.slice(configurationStart).search(/\bLookup import\b|\bActivation of integrations\b|\bSchedule activation\b/i) : -1;
  const source = configurationStart >= 0
    ? text.slice(configurationStart, lookupStart > 0 ? configurationStart + lookupStart : undefined)
    : text;
  const patterns: Array<[RegExp, RegExp]> = [
    [/ERP\s+SERVICE\s+API[\s\S]{0,140}?\(ERP Adapter\)/i, /ERP\s+SERVICE\s+API[\s\S]{0,120}?\(ERP Adapter catalog\)|\bREPORT SERVICE SOAP\b|\bGB_FINANCIALS_MX\b/i],
    [/\bGB_FINANCIALS_MX\b[\s\S]{0,260}?•\s*Host\s*:/i, /\bOSBTec REST Service API\b|\bGB_AR_BDU_SERVICE\b\s*•\s*Access type\s*:/i],
    [/\bGB_AR_BDU_SERVICE\b\s*•\s*Access type\s*:/i, /\bERP_Schedule_Service\b\s*•\s*Host\s*:/i],
    [/\bERP_Schedule_Service\b\s*•\s*(?:Host|WSDL URL|Security policy)\s*:/i, /\bNC_INBOUND_DATABASE\b|\n\s*5\.\s+Click|\n\s*2\.3\.\d+/i],
    [/\bOSBTec REST Service API\b\s*•\s*Access type\s*:/i, /\bAR_DIFERENT_PAYMETS\b|\bERP_Schedule_Service\b|\bNC_INBOUND_DATABASE\b|\n\s*5\.\s+Click/i],
    [/\bREPORT SERVICE SOAP[\s\S]{0,120}?CONNECTION ERP\b/i, /\bGB_FINANCIALS_MX\b/i],
    [/\bAR_DIFERENT_PAYMETS\b/i, /\bERP_Schedule_Service\b|\bNC_INBOUND_DATABASE\b|\n\s*5\.\s+Click/i],
    [/\bNC_INBOUND_DATABASE\b/i, /\n\s*5\.\s+Click|\n\s*2\.3\.\d+/i]
  ];
  const index = normalizedKey === "ERP_ADAPTER"
    ? 0
    : normalizedKey === "API_ERP_ADAPTER"
      ? 0
    : normalizedKey === "GB_FINANCIALS_MX"
      ? 1
      : normalizedKey === "GB_AR_BDU_SERVICE"
        ? 2
        : normalizedKey === "ERP_SCHEDULE_SERVICE"
          ? 3
          : normalizedKey === "OSBTEC_REST_SERVICE_API"
            ? 4
            : normalizedKey === "REPORT_SERVICE_SOAP_API"
              ? 5
              : normalizedKey === "AR_DIFERENT_PAYMETS"
                ? 6
                : normalizedKey === "NC_INBOUND_DATABASE"
                  ? 7
          : -1;
  if (index < 0) return "";
  const [startPattern, endPattern] = patterns[index];
  const start = source.search(startPattern);
  if (start < 0) return "";
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  return end > 0 ? rest.slice(0, end) : rest;
}

function oicEnvironmentValueFromSection(section: string, environmentLabel: string) {
  if (!section || !environmentLabel) return "";
  const label = environmentLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`\\bo\\s+${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*o\\s+(?:Dev|Regression|Test|Prod)\\s*:|\\n\\s*•|\\n\\s*\\d+\\.|$)`, "i"));
  return cleanOicConnectionValue(match?.[1] ?? "");
}

function oicConnectionLineValue(section: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`•\\s*${escaped}\\s*:\\s*([^\\n\\r]+)`, "i"));
  return cleanOicConnectionValue(match?.[1] ?? "");
}

function canonicalOicConnectionName(connection: string) {
  const key = connection.toUpperCase();
  if (key === "ERP_SCHEDULE_SERVICE") return "ERP_Schedule_Service";
  if (key === "API_ERP_ADAPTER") return "ERP SERVICE API";
  if (key === "OSBTEC_REST_SERVICE_API") return "OSBTec REST Service API";
  if (key === "REPORT_SERVICE_SOAP_API") return "REPORT SERVICE SOAP CONNECTION ERP";
  return connection;
}

function connectionReferenceDetails(
  connection: string,
  text: string,
  selectedEnvironment: string,
  scope: ReturnType<typeof oicScopeOverrides>
) {
  const key = connection.toUpperCase();
  const targetInstance = targetInstanceFromText(text);
  const targetLabel = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target environment";
  const environmentBlock = strictEnvironmentBlockFromDocument(text, selectedEnvironment);
  const targetPending = `<${targetLabel} target URL/WSDL/host to be provided or confirmed before RFS>`;
  const oicUrl = environmentValue(environmentBlock, "OIC Admin Console");
  const erpHost = cleanFusionHost(environmentValue(environmentBlock, "ERP Host"));
  const oecHost = cleanFusionHost(environmentValue(environmentBlock, "OEC Host"));
  const cdmHost = cleanFusionHost(environmentValue(environmentBlock, "CDM Host"));
  const environmentLabel = oicTableEnvironmentLabel(selectedEnvironment, targetInstance);
  const tableSection = oicConnectionTableSection(text, key);
  const scopeEndpoint = oicScopeConnectionEndpoint(text, connection);
  const targetOicUrl = oicAdminConsoleUrlForTarget(text, selectedEnvironment);
  const credentials = scope.requiresOnlineCredentialSession
    ? "Coordinate a working session with the password administrator for username/password entry or validation."
    : "Use the approved secure channel for username/password.";
  const status = "Validate first; configure only if missing or test fails.";

  let displayName = canonicalOicConnectionName(connection);
  let type = "Confirm adapter type from the imported integration.";
  let endpoint = scopeEndpoint || targetPending;
  let security = "Confirm security policy from the imported connection.";
  let accessType = "";
  let username = "";
  const extraLines: string[] = [];

  if (key === "ERP_ADAPTER" || key === "API_ERP_ADAPTER") {
    displayName = canonicalOicConnectionName(connection);
    type = key === "API_ERP_ADAPTER" ? "ERP Adapter / ERP Cloud Host" : "REST API Base URL";
    endpoint = oicEnvironmentValueFromSection(tableSection, environmentLabel) || erpHost || targetPending;
    security = /Username Password Token/i.test(tableSection) ? "Username Password Token" : "Basic Authentication";
    username = oicConnectionLineValue(tableSection, "Username") || "ORA_SYSTEM_USER_MX";
  } else if (key === "GB_FINANCIALS_MX") {
    type = "Database Adapter";
    const hostStart = tableSection.search(/Host\s*:/i);
    endpoint = (hostStart >= 0 ? oicEnvironmentValueFromSection(tableSection.slice(hostStart), environmentLabel) : "") || oicEnvironmentValueFromSection(tableSection, environmentLabel) || targetPending;
    const serviceName = (() => {
      const serviceNameStart = tableSection.search(/Service Name:/i);
      return serviceNameStart >= 0 ? oicEnvironmentValueFromSection(tableSection.slice(serviceNameStart), environmentLabel) : "";
    })();
    const port = oicConnectionLineValue(tableSection, "Port") || "1521";
    if (port) extraLines.push(`  Port: ${port}`);
    if (serviceName) extraLines.push(`  Service Name: ${serviceName}`);
    security = "Username Password Token";
    username = oicConnectionLineValue(tableSection, "Username") || "GB_FINANCIALS_MX";
    accessType = "Public gateway";
  } else if (key === "GB_AR_BDU_SERVICE") {
    type = "Imported REST/service connection";
    endpoint = targetPending;
    security = "OAuth 2.0 or Basic Authentication";
    accessType = "Select the corresponding agent group / Public gateway as applicable in target OIC.";
  } else if (key === "ERP_SCHEDULE_SERVICE") {
    displayName = "ERP_Schedule_Service";
    type = "SOAP Services Catalog WSDL";
    endpoint = erpHost ? `${erpHost}/fscmService/ServiceCatalogService?WSDL` : targetPending;
    security = /Username Password Token/i.test(tableSection) ? "Username Password Token" : "Basic Authentication";
    username = oicConnectionLineValue(tableSection, "Username") || "ORA_SYSTEM_USER_MX";
    accessType = "Public gateway";
  } else if (key === "OSBTEC_REST_SERVICE_API") {
    displayName = "OSBTec REST Service API";
    type = "REST API Base URL";
    endpoint = oicEnvironmentValueFromSection(tableSection, environmentLabel) || targetPending;
    security = /Basic Auth/i.test(tableSection) ? "Basic Auth" : "Basic Authentication";
    username = oicConnectionLineValue(tableSection, "Username") || "tech-ocloud_mx";
    accessType = "Select the corresponding agent group.";
  } else if (key === "REPORT_SERVICE_SOAP_API") {
    displayName = "REPORT SERVICE SOAP CONNECTION ERP";
    type = "SOAP / ReportService WSDL";
    endpoint = erpHost ? `${erpHost}/xmlpserver/services/v2/ReportService?wsdl` : targetPending;
    security = "No Security Policy";
  } else if (key === "AR_DIFERENT_PAYMETS") {
    type = "Imported REST/service connection";
    endpoint = targetPending;
    security = "OAuth 2.0 or Basic Authentication";
    accessType = "Public Gateway";
  } else if (key === "NC_INBOUND_DATABASE") {
    type = "Imported database/service connection";
    endpoint = targetPending;
    security = "OAuth 2.0 or Basic Authentication";
    accessType = "Public Gateway";
  } else if (/\bOIC\b.*\bSERVICE\b.*\bAPI\b|\bOIC_SERVICE_REST_API\b/.test(key)) {
    type = "REST API Base URL";
    endpoint = oicUrl || targetPending;
    security = "Basic Authentication";
  } else if (/\bREST\b.*\bAPI\b/.test(key)) {
    type = "REST API Base URL";
    endpoint = /OEC/.test(key) ? oecHost || targetPending : targetPending;
    security = "Basic Authentication";
  } else if (/\bREPORT\b.*\bSERVICE\b.*\bSOAP\b/.test(key)) {
    type = "SOAP / ReportService WSDL";
    const host = /OEC/.test(key) ? oecHost : erpHost || oecHost || cdmHost;
    endpoint = host ? `${host}/xmlpserver/services/v2/ReportService?wsdl` : targetPending;
    security = "No Security Policy";
  } else if (/\bCDM\b/.test(key)) {
    type = "ERP Adapter / ERP Services Catalog WSDL URL";
    endpoint = cdmHost || targetPending;
    security = "Username Password Token";
  } else if (/\bOEC\b.*\bAPI\b|\bAPI_OEC_ADAPTER\b/.test(key)) {
    type = "OEC/OSC Services Catalog WSDL URL";
    endpoint = oecHost || targetPending;
    security = "Username Password Token";
  }

  if (scopeEndpoint) {
    endpoint = scopeEndpoint;
  } else if (endpoint === targetPending && /\bOIC\b|_OIC_|OIC_/i.test(key)) {
    endpoint = targetOicUrl || targetPending;
  } else if (endpoint === targetPending && /\bERP\b|_ERP_|ERP_/i.test(key) && erpHost) {
    endpoint = `${erpHost}/fscmService/ErpIntegrationService?wsdl`;
  }

  if (/OIC_TOKEN/i.test(key)) {
    type = "REST API Base URL / OAuth token request";
    security = "OAuth Custom Two-Legged Flow";
  } else if (/\bERP\b|_ERP_|ERP_/i.test(key)) {
    type = /wsdl/i.test(endpoint) ? "ERP Integration Service WSDL" : "ERP Cloud service connection";
  } else if (/ORDER_RELEASE|_IN_ORDER_|WSDL/i.test(key)) {
    type = "SOAP/WSDL connection";
  } else if (/\bOIC\b|_OIC_|OIC_/i.test(key)) {
    type = "REST API Base URL";
    security = security === "Confirm security policy from the imported connection." ? "Basic Authentication" : security;
  }

  return [
    `Connection: ${displayName}`,
    `  Status: ${status}`,
    `  Type: ${type}`,
    `  Target URL/WSDL/Host: ${endpoint}`,
    accessType ? `  Access type: ${accessType}` : "",
    `  Security: ${security}`,
    username ? `  Username: ${username}` : "",
    ...extraLines,
    `  Credentials: ${credentials}`
  ].filter(Boolean).join("\n");
}

function connectionReferenceBlock(
  text: string,
  selectedEnvironment: string,
  connections: string[],
  scope: ReturnType<typeof oicScopeOverrides>
) {
  if (!connections.length) return "";
  const targetInstance = targetInstanceFromText(text);
  const targetLabel = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target environment";
  return [
    "Connection configuration details required before RFS/execution:",
    `Requester/Oracle Consulting must provide or confirm the non-sensitive connection data for ${targetLabel} before execution. Do not use IM090 URLs from another environment as executable target values.`,
    connections.map((connection) => connectionReferenceDetails(connection, text, selectedEnvironment, scope)).join("\n\n")
  ].join("\n\n");
}

type OicConnectionDetail = {
  name: string;
  identifier?: string;
  properties: Array<{ label: string; value: string }>;
  security?: string;
  username?: string;
  accessType?: string;
  selectedAgentGroup?: string;
};

function cleanOicConnectionValue(value: string) {
  const clean = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^https?:\/\//i.test(clean) || /\.[A-Za-z]{2,}\b/.test(clean)) {
    return clean.replace(/\s+/g, "").replace(/\?WSDL$/i, "?WSDL");
  }
  return clean
    .replace(/^Publicgateway$/i, "Public gateway")
    .replace(/^Connectivityagent$/i, "Connectivity agent")
    .replace(/^FTPServerAccessPolicy$/i, "FTP Server Access Policy")
    .replace(/^UsernamePasswordToken$/i, "Username Password Token")
    .replace(/^BasicAuthentication$/i, "Basic Authentication");
}

function valueBetween(content: string, label: string, nextLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const next = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*")).join("|");
  const match = content.match(new RegExp(`${escapedLabel}\\s*:?\\s*([\\s\\S]*?)(?=${next}|$)`, "i"));
  return cleanOicConnectionValue(match?.[1] ?? "");
}

function oicSectionLines(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function valueFromOicConnectionLine(section: string, labels: string[]) {
  const lines = oicSectionLines(section);
  for (const line of lines) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const match = line.match(new RegExp(`^${escaped}\\s*:?\\s+(.+)$`, "i"));
      if (match?.[1]) return cleanOicConnectionValue(match[1]);
    }
  }
  return "";
}

function usernameFromOicConnectionSection(section: string) {
  const lines = oicSectionLines(section);
  for (const line of lines) {
    const match = line.match(/^Username\s*:?\s+(.+)$/i);
    const value = cleanOicConnectionValue(match?.[1] ?? "");
    if (value && !/\b(?:password|policy|authentication|token|for this information)\b/i.test(value)) return value;
  }
  const securityIndex = lines.findIndex((line) => /^Security policy\b/i.test(line));
  if (securityIndex >= 0) {
    for (const line of lines.slice(securityIndex + 1)) {
      if (/^(?:Password|Access type|Selected agent group|Connection|Click|In case)\b/i.test(line)) break;
      const value = cleanOicConnectionValue(line);
      if (value && !/\b(?:password|policy|authentication|token|for this information)\b/i.test(value)) return value;
    }
  }
  return "";
}

function oicConnectionDetails(text: string): OicConnectionDetail[] {
  const sections: string[] = [];
  const starts = Array.from(text.matchAll(/Connection\s*Name\s*:/gi)).map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : text.length;
    sections.push(text.slice(start, end));
  }
  if (!sections.length) {
    const searched = Array.from(text.matchAll(/\bSearch\s*for\s*[“"]?\s*([A-Z0-9_ .-]{6,}?)\s*[”"]?\s*connection/gi)).map((match) => match[1]);
    return uniqueValues(searched).map((name) => ({ name, properties: [] }));
  }

  const details = sections.flatMap((section) => {
    const name = cleanOicConnectionValue(section.match(/Connection\s*Name\s*:\s*([A-Z0-9_ .-]+?)(?=\s*Identifier\s*:)/i)?.[1] ?? "");
    if (!name) return [];
    const identifier = section.match(/Identifier\s*:\s*([A-Z0-9_]+?)(?=\s*Connection\s*properties\s*Value|\s*ConnectionpropertiesValue)/i)?.[1];
    const propertyLabels = [
      "FTP Server Host Address",
      "FTPServerHostAddress",
      "FTP Server Port",
      "FTPServerPort",
      "SFTP Connection",
      "SFTPConnection",
      "Host",
      "Port",
      "Service Name",
      "ServiceName",
      "WSDL URL",
      "WSDLURL"
    ];
    const boundaryLabels = [
      ...propertyLabels,
      "Connection Security Value",
      "ConnectionSecurityValue",
      "Security policy",
      "Securitypolicy",
      "Username",
      "Password",
      "Access type",
      "Accesstype",
      "Selected agent group",
      "Selectedagentgroup",
      "4.Click",
      "2.2."
    ];
    const ftpHost = valueFromOicConnectionLine(section, ["FTP Server Host Address", "FTPServerHostAddress"]) ||
      valueBetween(section, "FTP Server Host Address", boundaryLabels) ||
      valueBetween(section, "FTPServerHostAddress", boundaryLabels);
    const ftpPort = valueFromOicConnectionLine(section, ["FTP Server Port", "FTPServerPort"]) ||
      valueBetween(section, "FTP Server Port", boundaryLabels) ||
      valueBetween(section, "FTPServerPort", boundaryLabels);
    const sftp = valueFromOicConnectionLine(section, ["SFTP Connection", "SFTPConnection"]) ||
      valueBetween(section, "SFTP Connection", boundaryLabels) ||
      valueBetween(section, "SFTPConnection", boundaryLabels);
    const host = ftpHost ? "" : valueFromOicConnectionLine(section, ["Host"]);
    const port = ftpPort ? "" : valueFromOicConnectionLine(section, ["Port"]);
    const serviceName = valueFromOicConnectionLine(section, ["Service Name", "ServiceName"]) ||
      valueBetween(section, "Service Name", boundaryLabels) ||
      valueBetween(section, "ServiceName", boundaryLabels);
    const wsdlUrl = valueFromOicConnectionLine(section, ["WSDL URL", "WSDLURL"]) ||
      valueBetween(section, "WSDL URL", boundaryLabels) ||
      valueBetween(section, "WSDLURL", boundaryLabels);
    const properties = [
      ["FTP Server Host Address", ftpHost],
      ["FTP Server Port", ftpPort],
      ["SFTP Connection", sftp],
      ["Host", host],
      ["Port", port],
      ["Service Name", serviceName],
      ["WSDL URL", wsdlUrl]
    ]
      .filter(([, value]) => value)
      .filter(([label, value], index, list) => list.findIndex(([otherLabel, otherValue]) => otherLabel === label && otherValue === value) === index)
      .map(([label, value]) => ({ label, value }));
    const security =
      /\bFTP\s*Server\s*Access\s*Policy\b/i.test(section)
        ? "FTP Server Access Policy"
        : /\bUsername\s*Password\s*Token\b/i.test(section)
          ? "Username Password Token"
          : /\bBasic\s*Authentication\b/i.test(section)
            ? "Basic Authentication"
            : valueBetween(section, "Security policy", boundaryLabels) || valueBetween(section, "Securitypolicy", boundaryLabels);
    const username = usernameFromOicConnectionSection(section);
    const accessType = valueFromOicConnectionLine(section, ["Access type", "Accesstype"]) ||
      valueBetween(section, "Access type", boundaryLabels) ||
      valueBetween(section, "Accesstype", boundaryLabels);
    const selectedAgentGroup = valueFromOicConnectionLine(section, ["Selected agent group", "Selectedagentgroup"]) ||
      valueBetween(section, "Selected agent group", boundaryLabels) ||
      valueBetween(section, "Selectedagentgroup", boundaryLabels);
    return [{ name, identifier, properties, security, username, accessType, selectedAgentGroup }];
  });
  return Array.from(new Map(details.map((detail) => [detail.name.toUpperCase(), detail])).values());
}

function oicLookupNames(text: string) {
  const bulletLookups = Array.from(
    text.matchAll(/^[\s•*-]+([A-Z][A-Z0-9_]{5,})(?:\s*$|\s+|\.)/gim)
  ).map((match) => match[1]);
  const searchedLookups = Array.from(
    text.matchAll(/\bSearch\s+([A-Z][A-Z0-9_]{5,})\b/gim)
  ).map((match) => match[1]);
  const quotedLookups = Array.from(
    text.matchAll(/[“"]([A-Z][A-Z0-9_]{5,})\s*[”"]/g)
  ).map((match) => match[1]);
  const csvLookups = Array.from(
    text.matchAll(/\b([A-Z][A-Z0-9_]{5,})\.CSV\b/gi)
  ).map((match) => match[1]);
  return uniqueValues([...bulletLookups, ...searchedLookups, ...quotedLookups, ...csvLookups])
    .filter((value) => /_/.test(value))
    .filter((value) => !/\b(?:GBOIC|OIC|ERP|CSV|IM090)\b/i.test(value));
}

export function oicConfigurationItems(text: string) {
  if (hasVisualBuilderExportWithDataInstructions(text)) {
    const project = visualBuilderProjectName(text);
    const version = visualBuilderProjectVersion(text);
    const status = visualBuilderProjectStatus(text);
    return [
      project ? `Visual Builder project: ${project}` : "Visual Builder export with data",
      version ? `Version: ${version}` : "",
      status ? `Status: ${status}` : ""
    ].filter(Boolean);
  }
  if (hasOicScheduleStopOnlyInstructions(text)) {
    return oicScheduleStopIntegrationCandidates(text).map((integration) => `Schedule stop target: ${integration}`);
  }
  if (hasOicLookupOnlyInstructions(text)) return oicLookupNames(text).map((lookup) => `Lookup: ${lookup}`);
  if (!hasOicConnectionOnlyInstructions(text)) return [];
  return oicConnectionDetails(text).map((connection) => `Connection: ${connection.name}`);
}

function oicAdminConsoleUrlForTarget(text: string, selectedEnvironment: string) {
  const environmentBlock = environmentBlockForTargetInstance(text) || strictEnvironmentBlockFromDocument(text, selectedEnvironment);
  const match = environmentBlock.match(/OIC\s*Admin\s*Console\s*:?\s*(https?:\/\/\S+)/i) ||
    text.match(/OIC\s*Admin\s*Console\s*:?\s*(https?:\/\/\S+)/i);
  const directUrl = cleanOicConnectionValue(match?.[1] ?? "");
  if (directUrl) return directUrl;
  const targetInstance = targetInstanceFromText(text);
  return targetInstance ? fullUrlWithFragment(text, targetInstance.toLowerCase()) : "";
}

function buildOicLookupOnlyPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const lookups = oicLookupNames(text);
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target OIC environment";
  const oicUrl = oicAdminConsoleUrlForTarget(text, selectedEnvironment) || "<Target OIC Admin Console URL to be confirmed>";
  const lookupList = lookups.length ? asBullets(lookups) : "- Confirm lookup names listed in the IM090.";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        `Validate access to the target OIC environment before starting: ${target}.`,
        `OIC Admin Console: ${oicUrl}`,
        "Confirm the lookup CSV file(s) are attached to the RFC or available in the approved installation package before execution.",
        "Do not use lookup files from a different environment unless explicitly confirmed by the RFC owner.",
        "",
        "Lookups to backup/import:",
        lookupList
      ].join("\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before importing, export a CSV backup of the current lookup value(s) in the target OIC environment.",
        lookupList,
        "Attach the backup file(s) or backup evidence to the RFC.",
        "If a lookup does not exist before import, document that backup was not applicable for that lookup."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Import Steps",
      content: [
        "1. Login to the target Oracle Cloud Integration Admin Console.",
        "2. Navigate to Design > Lookups.",
        lookups.map((lookup, index) => [
          `${3 + index}. Backup and import lookup: ${lookup}`,
          "   - Search for the lookup by name.",
          "   - If it exists, export it as CSV and keep the backup evidence.",
          "   - Click Import.",
          `   - Choose the approved CSV file for ${lookup}.`,
          "   - Click Import.",
          "   - If OIC prompts that the lookup already exists, click Import and Replace only after the backup is captured.",
          "   - Confirm the import success message."
        ].join("\n")).join("\n\n") || "3. Backup and import each lookup listed in the IM090.",
        `${3 + lookups.length}. Confirm all requested lookups were imported successfully.`
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for OIC lookup import.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate all requested OIC lookups after import.",
        "",
        lookupList,
        "",
        "For each lookup, confirm:",
        "- The lookup exists in the target OIC environment.",
        "- The imported values are visible and saved correctly.",
        "- No import errors are present."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If a lookup import fails, stop execution and capture the error details.",
        "If a replacement causes incorrect values, restore the previous lookup using the exported CSV backup.",
        "Escalate to the OIC technical owner/requester before retrying with a different lookup file."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- Target OIC environment.",
        "- Pre-change lookup search/status.",
        "- Lookup CSV backup/export, when applicable.",
        "- Import and Replace confirmation, when applicable.",
        "- Successful import message.",
        "- Final lookup validation.",
        "",
        "Share final execution result with the RFC requester/customer."
      ].join("\n")
    }
  ];
}

function buildVisualBuilderExportWithDataPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "Production OIC instance";
  const oicUrl = visualBuilderOicUrl(text) || oicAdminConsoleUrlForTarget(text, selectedEnvironment) || "<Production OIC URL>";
  const project = visualBuilderProjectName(text) || "<VISUAL_BUILDER_PROJECT>";
  const version = visualBuilderProjectVersion(text) || "<VERSION>";
  const status = visualBuilderProjectStatus(text) || "Live";
  const projectLines = [
    `- Project: ${project}`,
    `- Version: ${version}`,
    `- Status: ${status}`
  ].join("\n");
  const indentedProjectLines = projectLines.replace(/^- /gm, "   - ");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        `Confirm approved access to the source OIC / Visual Builder environment: ${target}.`,
        `OIC URL: ${oicUrl}`,
        "Confirm the RFC scope is export-only for Visual Builder objects with data.",
        "Confirm the target Visual Builder project before execution:",
        projectLines,
        "Do not capture or expose password values, session tokens, or personal credential details in RFC evidence."
      ].join("\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "No system change is being applied; backup is not required.",
        "Capture pre-export evidence showing:",
        "- Source OIC / Visual Builder environment.",
        ...projectLines.split("\n")
      ].join("\n")
    },
    {
      id: "installation",
      title: "Export Steps",
      content: [
        `1. Login to the OIC instance:\n   - ${oicUrl}`,
        "2. Open the Navigation Menu.",
        "3. Select Visual Builder.",
        "4. Locate and select the Visual Builder project:",
        indentedProjectLines,
        "5. Open the project actions menu using the three-points icon on the right side.",
        "6. Select Export with Data.",
        "7. Save the generated export file(s) to the local working folder.",
        "8. Validate that the export completed successfully and the expected file(s) were generated.",
        "9. Attach the exported file(s) to the RFC."
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for Visual Builder export-only activity.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Confirm the Visual Builder export completed without errors.",
        "Confirm the generated export file(s) are available locally.",
        "Confirm the exported file(s) were attached to the RFC.",
        "Confirm no deployment, import, activation, or runtime configuration change was performed."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the export fails, stop execution and capture the error message.",
        "Do not retry with different project/version values unless approved by the requester.",
        "Escalate to the OIC / Visual Builder owner if the project is missing, not Live, or Export with Data is unavailable."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- OIC / Visual Builder source environment.",
        "- Visual Builder project selected.",
        ...projectLines.split("\n"),
        "- Export with Data action.",
        "- Export completion / generated file(s).",
        "- Exported file(s) attached to the RFC.",
        "Do not attach credential or password evidence."
      ].join("\n")
    }
  ];
}

function buildOicConnectionOnlyPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const connections = oicConnectionDetails(text);
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target OIC environment";
  const oicUrl = oicAdminConsoleUrlForTarget(text, selectedEnvironment) || "<Target OIC Admin Console URL to be confirmed>";
  const connectionList = connections.length ? asBullets(connections.map((connection) => connection.name)) : "- Confirm OIC connections listed in the IM090.";
  const details = connections.map((connection) => [
    `- ${connection.name}`,
    connection.identifier ? `  Identifier: ${connection.identifier}` : "",
    connection.properties.length ? connection.properties.map((property) => `  ${property.label}: ${property.value}`).join("\n") : "  Connection properties: confirm from IM090/imported connection.",
    connection.security ? `  Security: ${connection.security}` : "",
    connection.username ? `  Username: ${connection.username}` : "",
    connection.accessType ? `  Access type: ${connection.accessType}` : "",
    connection.selectedAgentGroup ? `  Selected agent group: ${connection.selectedAgentGroup}` : "",
    `  Credentials: ${credentialSessionMessage()}`
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        `Validate access to the target OIC environment before starting: ${target}.`,
        `OIC Admin Console: ${oicUrl}`,
        "Requester/Oracle Consulting must provide or confirm all connection endpoint values and credentials for the target environment before RFS/execution.",
        credentialSessionMessage(),
        "Do not use connection values from a different environment unless explicitly confirmed by the RFC owner.",
        "Do not capture or expose password values in the Action Plan or RFC evidence.",
        "",
        "Connections to configure/test:",
        connectionList,
        "",
        "Connection configuration reference:",
        details || "- Confirm connection details from the IM090."
      ].join("\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before changing each connection, capture evidence of its current configuration and test status.",
        "If a connection is already configured and tests successfully, document that no change was required.",
        "If a connection is missing or fails validation, capture the current error/status before updating it."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Configuration Steps",
      content: [
        "1. Login to the target Oracle Cloud Integration Admin Console.",
        "2. Navigate to Design > Integrations > Connections.",
        connections.map((connection, index) => [
          `${3 + index}. Configure and validate connection: ${connection.name}`,
          "   - Search for the connection by name.",
          "   - Open/Edit the connection.",
          "   - Validate or update the non-sensitive connection properties listed in the prerequisites.",
          "   - Enter credentials only during the coordinated working session with the password administrator.",
          "   - Click Test and confirm the result reaches 100%.",
          "   - If the test fails, correct the configuration using the approved values and test again.",
          "   - Click Save after successful test.",
          "   - Capture configuration/test evidence without exposing password values."
        ].join("\n")).join("\n\n") || "3. Configure and validate each OIC connection listed in the IM090.",
        `${3 + connections.length}. Confirm all requested connections are saved and test successfully.`
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for OIC connection configuration.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate all requested OIC connections after configuration.",
        "",
        connectionList,
        "",
        "For each connection, confirm:",
        "- Test result is successful / 100%.",
        "- Endpoint/host/port/WSDL values match the target environment.",
        "- Access type and agent group, when applicable, match the IM090/approved values.",
        "- No password values are visible in evidence."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If any connection cannot be configured or tested successfully, stop execution and capture the error details.",
        "Restore prior values using the backup evidence if a change causes a regression.",
        "Escalate to the OIC technical owner/requester before retrying with different endpoint, agent, or credential values."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- Target OIC environment.",
        "- Current/pre-change connection status.",
        "- Updated connection properties, excluding passwords.",
        "- Successful Test result for each connection.",
        "- Save confirmation.",
        "- Final validation summary.",
        "",
        "Share final execution result with the RFC requester/customer."
      ].join("\n")
    }
  ];
}

function oicScheduledIntegrationCandidates(text: string) {
  const scheduled = Array.from(
    text.matchAll(/\b(?:schedule|scheduled)[ \t]+(?:the[ \t]+)?([A-Z][A-Z0-9_]{6,})\b/gi)
  ).map((match) => match[1]);
  const tableScheduled = Array.from(
    text.matchAll(/\b[A-Z0-9_-]+\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)\s+\d{2}\.\d{2}\.\d{4}\s+Schedule(?:r)?\b/gi)
  ).map((match) => match[1]);
  const frequency = text.match(/\bfrequency\s+is\s+every\s+([A-Za-z0-9 _-]+?)(?:\.|\n|$)/i)?.[1]?.trim();
  return uniqueValues([...scheduled, ...tableScheduled])
    .filter((value) => /_/.test(value) && !/\b(?:INTEGRATION|SCHEDULED)\b/i.test(value))
    .map((value) => frequency ? `${value} - every ${frequency}` : value);
}

function hasStructuredOicInstallationSections(text: string) {
  return /^\s*\d+(?:\.\d+)*\s+Installation\s+(?:[A-Z0-9_-]+(?:_[A-Z0-9_-]+)+|(?:IN|OUT|SYNC)_[A-Z0-9_]+)\b/im.test(text);
}

function oicDocumentIntegrationList(text: string) {
  const sections = [
    text.match(/Validate if the following integrations exist:\s*([\s\S]*?)(?:If the integrations do not exist|If the integration does not exist|4\.\s+If)/i)?.[1] ?? "",
    text.match(/The integrations to activate are listed below:\s*([\s\S]*?)(?:Press|3\.\s+Select|File Ref:)/i)?.[1] ?? ""
  ];
  return uniqueValues(
    sections.flatMap((section) =>
      Array.from(section.matchAll(/^\s*(?:[-•]\s*)?([A-Z]{2}(?:_[A-Z0-9]+){2,})\s*$/gim)).map((match) => match[1])
    )
  );
}

function oicDetectedMetadata(text: string) {
  const integrationMetadata = text
    .split(/\r?\n/)
    .flatMap((line) => {
      const metadata = line.match(/^Integration:\s*([^|]+)(?:\|([^|]+))?(?:\|([^|]+))?/i);
      if (!metadata) return [];
      const code = metadata[1]?.trim();
      const name = metadata[2]?.trim();
      return [name || code].filter(Boolean);
    });
  const namedIntegrations = Array.from(text.matchAll(/^\s*Name\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gim)).map((match) => match[1]);
  const repeatedIntegrations = Array.from(text.matchAll(/\bRepeat the steps for the\s+([A-Z][A-Z0-9_]{6,})\s+integration\b/gi)).map((match) => match[1]);
  const scheduledIntegrations = oicScheduledIntegrationCandidates(text).map((value) => value.split(/\s+-\s+/)[0]);
  const referencedIntegrations = [
    ...Array.from(text.matchAll(/\b(?:refer to|Search for|Integration name)\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gi)).map((match) => match[1]),
    ...oicScheduleStopIntegrationCandidates(text)
  ];
  const documentIntegrations = oicDocumentIntegrationList(text);
  const integrations = removePartialIntegrationNames([...integrationMetadata, ...namedIntegrations, ...referencedIntegrations])
    .concat(repeatedIntegrations, scheduledIntegrations, documentIntegrations)
    .filter((value) => !/^IN_LGFDATA_TO_WMS$/i.test(value))
    .filter((value) => /^(?:(?:IN|OUT|SYNC)_[A-Z0-9_]+|[A-Z]{2}(?:_[A-Z0-9]+){2,})$/i.test(value));
  const connections = dedupeOicConnectionNames([
    ...linesMatching(text, /^connection:\s*([A-Z0-9_ .-]+)/i),
    ...connectionCandidatesFromText(text)
  ]).filter((connection) => !isOicManagedConnection(connection));
  const dvms = linesMatching(text, /^dvm:\s*([A-Z0-9_ .-]+)/i);
  const scheduleEntries = oicScheduledIntegrationCandidates(text);
  const inspectedSchedules = linesMatching(text, /^schedule:\s*([A-Z0-9_ .-]+)/i);
  const schedules = uniqueValues([
    ...scheduleEntries,
    ...inspectedSchedules.filter((schedule) => !scheduleEntries.length || !/^Schedule_/i.test(schedule))
  ]);
  return { integrations: uniqueValues(integrations), connections, dvms, schedules };
}

function detectedBlock(title: string, values: string[]) {
  return values.length ? `${title}:\n${asBullets(values)}` : "";
}

function sortOicArtifacts(values: string[]) {
  const priority = (value: string) => {
    if (/\.iar$/i.test(value)) return 0;
    if (/\.par$/i.test(value)) return 1;
    if (/\.zip$/i.test(value)) return 2;
    if (/\.wsdl$/i.test(value)) return 3;
    if (/\.csv$/i.test(value)) return 4;
    if (/\.xml$/i.test(value)) return 5;
    return 9;
  };
  return [...values].sort((left, right) => priority(left) - priority(right) || left.localeCompare(right));
}

function libraryZipArtifacts(text: string) {
  return uniqueValues(
    Array.from(text.matchAll(/\b([A-Z][A-Za-z0-9]+)\s+\1_(\d{2}\.\d{2}\.\d{3})\s*(\d)\.zip\b/g))
      .map((match) => `${match[1]}_${match[2]}${match[3]}.zip`)
  );
}

function loadedOicArtifactFiles(text: string) {
  return uniqueValues(
    linesMatching(text, /^Artifact file:\s*([A-Z0-9][A-Z0-9_.-]+\.(?:iar|par|zip|jar|sql|csv|xml))$/i)
      .filter((artifact) => !/\.wsdl$/i.test(artifact))
  );
}

function collapseSupersededVersionedArtifacts(values: string[]) {
  const selected = new Map<string, string>();
  const score = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const compare = (left: string, right: string) => {
    const leftScore = score(left);
    const rightScore = score(right);
    for (let index = 0; index < Math.max(leftScore.length, rightScore.length); index += 1) {
      const delta = (leftScore[index] ?? 0) - (rightScore[index] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  };
  for (const value of values) {
    const match = value.match(/^(.+_)(\d{2}\.\d{2}\.\d{4})(\.[^.]+)$/i);
    if (!match) {
      selected.set(value.toLowerCase(), value);
      continue;
    }
    const key = `${match[1].toLowerCase()}${match[3].toLowerCase()}`;
    const current = selected.get(key);
    const currentVersion = current?.match(/^(.+_)(\d{2}\.\d{2}\.\d{4})(\.[^.]+)$/i)?.[2] ?? "";
    if (!current || compare(match[2], currentVersion) > 0) selected.set(key, value);
  }
  const collapsed = Array.from(selected.values());
  return collapsed.filter((value) => {
    const key = value.toLowerCase();
    return !collapsed.some((other) => {
      const otherKey = other.toLowerCase();
      return otherKey !== key && otherKey.endsWith(key) && otherKey.length - key.length >= 4;
    });
  });
}

function oicIntegrationCandidates(text: string) {
  const metadata = oicDetectedMetadata(text).integrations;
  const technical = extractArtifactNames(text, { includeComponentNames: true })
    .filter((item) => /^(?:IN|OUT)_[A-Z0-9_]+/i.test(item))
    .map((item) => item.replace(/\.(?:iar|par|xml|wsdl|csv|zip|jar|sql)$/i, ""));
  return uniqueValues([...metadata, ...technical]);
}

function oicSchedulerCandidates(text: string) {
  const explicit = Array.from(
    text.matchAll(/\b(?:scheduler|scheduled job|artifact)\s+(?:name|id|artifact)?\s*[:\-]?\s*(_[A-Z0-9_]{4,})\b/gi)
  ).map((match) => match[1]);
  const underscored = text.match(/\b_[A-Z0-9_]{4,}\b/g) ?? [];
  return uniqueValues([...explicit, ...underscored]);
}

function oicDirectLoginUrl(text: string) {
  return cleanOicConnectionValue(
    text.match(/\bLogin\s+OIC\s+Instance\s*\((https?:\/\/[^)\s]+)\)/i)?.[1] ??
    text.match(/\b(https?:\/\/[^\s)]+)/i)?.[1] ??
    ""
  );
}

function buildOicScheduleStopOnlyPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const integrations = oicScheduleStopIntegrationCandidates(text);
  const integrationBlock = integrations.length ? asBullets(integrations) : "- <INTEGRATION_NAME>";
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target OIC environment";
  const loginUrl = oicDirectLoginUrl(text);
  const urlTargetMismatch = Boolean(loginUrl && targetInstance && !loginUrl.toLowerCase().includes(targetInstance.toLowerCase()));
  const prepareContent = (content: string) => prepareManualPhaseContent(sanitizeOicSensitiveContent(content), selectedEnvironment);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Confirm the RFC is approved to stop the requested OIC integration schedule.",
        `Target OIC environment:\n- ${target}`,
        `Target integration schedule(s):\n${integrationBlock}`,
        loginUrl ? `OIC URL provided in RFC:\n- ${loginUrl}` : "Confirm the target OIC URL before execution.",
        urlTargetMismatch
          ? "Warning: the URL provided in the instructions does not appear to contain the target instance name. Confirm the correct OIC URL with the requester before execution."
          : "",
        "Confirm the execution user has privileges to search integrations and stop schedules.",
        "Do not capture or expose password values in the Action Plan, terminal logs, screenshots, or RFC evidence."
      ].filter(Boolean).join("\n\n"))
    },
    {
      id: "backup",
      title: "Pre-Change Evidence",
      content: [
        "No integration import/deployment backup is required because this RFC only stops an existing schedule.",
        "Before execution, search the target integration in the target OIC environment.",
        `Target integration schedule(s):\n${integrationBlock}`,
        "Open the Schedule option and capture the current schedule status before stopping it.",
        "Capture the current integration activation/status without modifying the integration itself.",
        "If the integration or schedule is not found, stop and confirm the target environment/integration name with the requester."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Stop Schedule",
      content: [
        "Login to the Oracle Integration console for the confirmed target environment.",
        "Go to Design > Integrations.",
        `Search the target integration:\n${integrationBlock}`,
        "Open the Actions menu for the target integration and select Schedule.",
        "On the schedule panel, press Stop.",
        "When the confirmation dialog appears, press Confirm.",
        "Do not deactivate, delete, import, or modify the integration unless a separate approved RFC explicitly requests it."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this RFC. The schedule must remain stopped unless rollback/restart is explicitly approved.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Search the target integration again after execution.",
        `Validate the schedule is stopped for:\n${integrationBlock}`,
        "Confirm the integration itself remains in the expected activation/configuration state.",
        "Confirm there are no unexpected OIC errors after stopping the schedule."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If rollback is approved, return to the same integration schedule and start it again.",
        "Restart the schedule only after requester/OIC owner approval.",
        "If stopping or restarting the schedule fails, capture the Oracle/OIC error message and escalate before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Confirmed target OIC URL/environment.",
        "2. Pre-change schedule status.",
        "3. Schedule stop confirmation.",
        "4. Post-change stopped schedule status.",
        "5. Integration status after execution.",
        "6. Error or rollback/restart evidence if applicable.",
        "Do not attach credential/password evidence."
      ].join("\n")
    }
  ];
}

function buildOicScheduledJobDisablePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const integrations = oicIntegrationCandidates(text);
  const schedulers = oicSchedulerCandidates(text);
  const integrationBlock = integrations.length ? asBullets(integrations) : "- <INTEGRATION_NAME>";
  const schedulerBlock = schedulers.length ? asBullets(schedulers) : "- <SCHEDULER_NAME>";
  const prepareContent = (content: string) => prepareManualPhaseContent(sanitizeOicSensitiveContent(content), selectedEnvironment);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Confirm OIC access for the target environment.",
        "Confirm privileges to search integrations, stop schedules, and deactivate integrations.",
        `Confirm the integration(s) requested for scheduler stop and disablement:\n${integrationBlock}`,
        `Confirm the scheduler component(s) requested to be stopped:\n${schedulerBlock}`,
        "Confirm RFC/CTS approval before execution."
      ].join("\n\n"))
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before execution, search the target integration in OIC and capture the current integration status.",
        "Open the schedule option and capture the current scheduler status.",
        `Target integration(s):\n${integrationBlock}`,
        `Target scheduler component(s):\n${schedulerBlock}`,
        "If export is required by the RFC, export the current integration version before making changes."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Stop Scheduler and Disable Integration",
      content: [
        "Login to the Oracle Integration console for the target environment.",
        "Go to Integrations.",
        `Search the target integration:\n${integrationBlock}`,
        "Open the Schedule option for the target integration.",
        "Click the Stop icon for the scheduler component.",
        "Confirm the scheduler stop action and validate the scheduler is deactivated/stopped.",
        "Return to Integrations and search the same target integration.",
        "Open the integration status/action menu and select Disabled or Deactivate.",
        "Confirm the deactivation action.",
        "Validate the integration changes to Configured/inactive status.",
        "Capture the scheduler stop and integration disablement results."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this change. The scheduler must remain stopped unless rollback/reactivation is approved."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Search the target integration after execution.",
        `Validate the integration(s) are disabled/configured:\n${integrationBlock}`,
        `Validate the scheduler component(s) are stopped/deactivated:\n${schedulerBlock}`,
        "Confirm there are no unexpected OIC errors after the change."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If rollback/reactivation is approved, reactivate the same integration version that was disabled.",
        "Restart the same scheduler component only after the integration is validated active.",
        "If scheduler stop, deactivation, or reactivation fails, capture the Oracle error message and escalate to the OIC/application owner before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach pre-change integration status evidence.",
        "Attach pre-change scheduler status evidence.",
        "Attach scheduler stop/deactivation confirmation evidence.",
        "Attach integration disablement/configured status evidence.",
        "Attach final validation evidence.",
        "Attach rollback/reactivation evidence if executed."
      ].join("\n")
    }
  ];
}

function buildOicDeactivationPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const integrations = oicIntegrationCandidates(text);
  const integrationBlock = integrations.length ? asBullets(integrations) : "- <INTEGRATION_NAME>";
  const prepareContent = (content: string) => prepareManualPhaseContent(sanitizeOicSensitiveContent(content), selectedEnvironment);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Confirm OIC access for the target environment.",
        "Confirm privileges to search, deactivate, and reactivate integrations if rollback is required.",
        `Confirm the integration(s) requested for deactivation:\n${integrationBlock}`,
        "Confirm RFC/CTS approval before execution."
      ].join("\n\n"))
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before deactivation, search each target integration in OIC and capture the current status.",
        `Target integration(s):\n${integrationBlock}`,
        "If export is available and required by the RFC, export the current integration version before making changes.",
        "Capture schedule status or active event subscription state if applicable."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Deactivation Steps",
      content: [
        "Login to the Oracle Integration console for the target environment.",
        "Go to Integrations.",
        `Search the target integration(s):\n${integrationBlock}`,
        "Open the deactivate action for each active integration.",
        "If the integration is event-based and the dialog asks about deleting the event subscription, do not delete the subscription unless the RFC explicitly requires it.",
        "Confirm deactivation.",
        "Capture the deactivation result."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this deactivation change. Do not start schedules unless rollback/reactivation is approved."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Search the integration again after execution.",
        `Validate the integration(s) are inactive/deactivated:\n${integrationBlock}`,
        "Confirm there are no unexpected activation or runtime errors after the change."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If rollback is required, reactivate the same integration version that was deactivated.",
        "If event subscriptions or schedules were changed, restore the previous state captured before execution.",
        "If reactivation fails, capture the error and escalate to the OIC/application owner before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach current status evidence before deactivation.",
        "Attach deactivation confirmation evidence.",
        "Attach final inactive/deactivated status evidence.",
        "Attach rollback/reactivation evidence if executed."
      ].join("\n")
    }
  ];
}

function oicUserCandidates(text: string) {
  return uniqueValues([
    ...Array.from(text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)).map((match) => match[0]),
    ...Array.from(text.matchAll(/\buser(?: name| email)?\s*[:=]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)).map((match) => match[1])
  ]);
}

function buildOicResetPasswordPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const users = oicUserCandidates(text);
  const userBlock = users.length ? asBullets(users) : "- <OIC_USER_EMAIL>";
  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm access to Identity Cloud Service / OCI Identity for the target OIC environment.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target user(s):\n${userBlock}`,
        "Confirm RFC/CTS approval before execution.",
        "Do not capture or expose password values in screenshots, logs, or RFC evidence."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Current User Validation",
      content: [
        "Open Identity Cloud Service / OCI Identity Users.",
        `Search and validate the requested user(s):\n${userBlock}`,
        "Capture current user status before reset.",
        "If a user does not exist, document it as \"No action performed.\""
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Password Reset",
      content: [
        "For each existing user, open the user detail page.",
        "Click Reset Password.",
        "Confirm the password reset action.",
        "Validate the console displays the reset confirmation.",
        "Repeat only for the requested users."
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the password reset confirmation was completed for each requested user.",
        "Confirm the requester/user receives the reset notification or approved reset communication.",
        "Do not capture password values."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: "If reset fails, capture the console error and escalate to the identity/OIC owner before retrying. Do not attempt unapproved manual password handling."
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach user search/status evidence.",
        "Attach reset confirmation evidence.",
        "Attach no-action evidence for missing users.",
        "Do not attach password values."
      ].join("\n")
    }
  ];
}

function buildOicTracingPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const integrations = oicIntegrationCandidates(text);
  const integrationBlock = integrations.length ? asBullets(integrations) : "- <INTEGRATION_NAME>";
  const disable = isOicDisableTracing(text);
  const action = disable ? "Disable" : "Enable";
  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm OIC access for the target environment.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target integration(s):\n${integrationBlock}`,
        "Confirm RFC/CTS approval before execution.",
        disable ? "Confirm tracing must be disabled for the listed integrations." : "Confirm tracing/payload capture is approved for the target environment before enabling it."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Current Tracing Status Validation",
      content: [
        "Login to the Oracle Integration console.",
        "Go to Integrations.",
        `Search each target integration:\n${integrationBlock}`,
        "Capture current tracing status before applying changes."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: `${action} Tracing`,
      content: [
        "Open the Actions menu for the target integration in Active status.",
        "Click Tracing.",
        disable ? "Uncheck Enable Tracing." : "Check Enable Tracing.",
        disable ? "" : "Check Include Payload only if approved for the environment.",
        "Click Save.",
        "Repeat for each listed integration.",
        "Capture the save confirmation."
      ].filter(Boolean).join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for tracing configuration."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Reopen the Tracing configuration for each target integration.",
        disable ? "Validate Enable Tracing is unchecked." : "Validate Enable Tracing is checked and Include Payload matches the approved request.",
        "Confirm no unexpected OIC errors are displayed."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: `If validation fails, restore the previous tracing setting captured before the change and escalate to the OIC owner before retrying.`
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach pre-change tracing status.",
        "Attach save confirmation.",
        "Attach final tracing status for each integration."
      ].join("\n")
    }
  ];
}

function oicPackageArtifactName(artifact: string) {
  return artifact.replace(/\.par$/i, "");
}

function oicParPackageArtifacts(text: string) {
  return sortOicArtifacts(uniqueValues([
    ...loadedOicArtifactFiles(text),
    ...installableArtifactNames(text)
  ]))
    .filter((artifact) => /\.par$/i.test(artifact))
    .filter((artifact) => !/^icspackage_/i.test(artifact));
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function oicPackageSections(text: string, artifact: string) {
  const artifactEscaped = escapedRegex(artifact);
  const packageName = oicPackageArtifactName(artifact);
  const packageEscaped = escapedRegex(packageName);
  const sections: string[] = [];
  const fileSection = text.match(new RegExp(`(?:^|\\n)File:\\s*${artifactEscaped}\\b[\\s\\S]*?(?=\\nFile:\\s*[A-Z0-9_.-]+\\.par\\b|\\n##\\s|\\n[A-F]\\)\\s|$)`, "i"))?.[0];
  if (fileSection) sections.push(fileSection);
  const packageSection = text.match(new RegExp(`\\bPackage\\s+${packageEscaped}\\b[\\s\\S]*?(?=\\bPackage\\s+(?!${packageEscaped}\\b)[A-Z0-9][A-Z0-9_.-]+\\b|\\bEnvironments:\\b|\\b\\d+(?:\\.\\d+)*\\s+Installation Steps\\b|$)`, "i"))?.[0];
  if (packageSection) sections.push(packageSection);
  const installSection = text.match(new RegExp(`\\bInstallation Steps\\s+${packageEscaped}\\b[\\s\\S]*?(?=\\b\\d+(?:\\.\\d+)*\\s+Installation Steps\\s+(?!${packageEscaped}\\b)[A-Z0-9][A-Z0-9_.-]+\\b|\\b[A-Z]\\)\\s|$)`, "i"))?.[0];
  if (installSection) sections.push(installSection);
  return sections.length ? sections : [text];
}

function integrationDisplayKey(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, "").toUpperCase();
}

function dedupeIntegrationDisplays(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = integrationDisplayKey(clean);
    const current = byKey.get(key);
    if (!current || (!/\([^)]*\)$/.test(current) && /\([^)]*\)$/.test(clean))) {
      byKey.set(key, clean);
    }
  }
  return Array.from(byKey.values());
}

function oicPackageIntegrationDisplays(text: string, artifact: string) {
  const values = oicPackageSections(text, artifact).flatMap((section) => {
    const normalized = section.replace(/\s+/g, " ");
    const versioned = Array.from(
      normalized.matchAll(/\b((?:IN|OUT|SYNC)_[A-Z0-9_]+)\s*\(\s*([0-9]+(?:\.[0-9]+){0,3})\s*\)/gi)
    ).map((match) => `${match[1]} (${match[2]})`);
    const inspected = Array.from(
      normalized.matchAll(/\|\s*((?:IN|OUT|SYNC)_[A-Z0-9_]+)\s*\|\s*\d{2}\.\d{2}\.\d{4}\b/gi)
    ).map((match) => match[1]);
    return [...versioned, ...inspected];
  });
  return dedupeIntegrationDisplays(values);
}

function oicPackageFriendlyConnectionNames(text: string, fallbackConnections: string[]) {
  const friendly = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*-]+/, "").replace(/^Connections\s+\d+\s+/i, "").trim())
    .map((line) => line.replace(/\s+(?:Reference|Name|Type|Role\(s\)|Connection\s+Properties)\b.*$/i, "").trim())
    .filter((line) => /^(?:Rest Conn for|Erp Connection Service For)\b/i.test(line));
  return uniqueValues(friendly.length ? friendly : fallbackConnections);
}

function buildOicPackageImportPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const packageArtifacts = oicParPackageArtifacts(text);
  if (!packageArtifacts.length) return [];

  const metadata = oicDetectedMetadata(text);
  const targetInstance = targetInstanceFromText(text);
  const target = [selectedEnvironment, targetInstance].filter(Boolean).join(" / ") || selectedEnvironment || "target OIC environment";
  const oicUrl = oicAdminConsoleUrlForTarget(text, selectedEnvironment) || "<Target OIC Admin Console URL to be confirmed>";
  const packageInfos = packageArtifacts.map((artifact) => ({
    artifact,
    name: oicPackageArtifactName(artifact),
    integrations: oicPackageIntegrationDisplays(text, artifact)
  }));
  const packageList = asBullets(packageArtifacts);
  const connections = oicPackageFriendlyConnectionNames(text, metadata.connections);
  const connectionList = connections.length ? asBullets(connections) : "- Confirm required package connections from the OIC Configuration Editor.";
  const validationList = packageInfos.map((info) => [
    `Package: ${info.name}`,
    info.integrations.length ? asBullets(info.integrations) : "- Validate each integration listed in the IM090 for this package."
  ].join("\n")).join("\n\n");
  const integrationList = dedupeIntegrationDisplays(packageInfos.flatMap((info) => info.integrations));
  const deactivationList = integrationList.length ? asBullets(integrationList) : "- Deactivate each integration listed in the IM090 for this package.";
  const nonProdScheduleSkip = /\bnon[-\s]?productive environments?\b[\s\S]{0,160}\bskip\b[\s\S]{0,120}\b(?:Add Schedule|Schedule and Future Runs|Start Schedule)\b/i.test(text) ||
    /\bonly apply to productive environments?\b[\s\S]{0,180}\b(?:skip|non[-\s]?productive)\b/i.test(text);
  const environmentIsProduction = normalizeEnvironmentName(selectedEnvironment) === "PROD" || /(?:PR|PROD)$/i.test(targetInstance);
  const packageSummary = packageInfos.map((info) =>
    `- ${info.name}: ${info.integrations.length || "IM090-listed"} integration(s) to activate/validate`
  ).join("\n");
  const prepareContent = (content: string, options: { dedupe?: boolean } = {}) =>
    prepareManualPhaseContent(sanitizeOicSensitiveContent(content, { omitWsdlFileExamples: true }), selectedEnvironment, options);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        `Confirm the RFC is approved for execution in ${target}.`,
        `OIC Admin Console: ${oicUrl}`,
        "Confirm access to Oracle Integration Cloud with a provisioned user able to import packages, configure connections, and activate integrations.",
        `Confirm the approved OIC package file(s) are available before execution:\n${packageList}`,
        `Packages detected:\n${packageSummary}`,
        "Coordinate a working session with the password administrator to enter or validate credentials required for the OIC connections during execution.",
        "Do not request, capture, document, or attach password values in the RFC evidence."
      ].join("\n\n"))
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: prepareContent([
        "Before importing, search in OIC for existing packages and related integrations.",
        `Target package(s):\n${packageList}`,
        "If existing components are found, export the current package/integration backup before replacement.",
        "Capture evidence of the target OIC environment, existing package/integration status, and backup/export result when applicable.",
        "If a component does not exist before import, document that backup was not applicable for that component."
      ].join("\n\n"))
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: prepareContent([
        "1. Access the Oracle Integration Cloud console for the target environment.",
        [
          "2. Deactivate the integrations included in the package before importing/replacing the package:",
          deactivationList.replace(/^- /gm, "   - "),
          "   - Navigate to Design > Integrations.",
          "   - Search each integration and deactivate it when it is currently active.",
          "   - Capture deactivation status evidence before continuing."
        ].join("\n"),
        packageInfos.map((info, index) => {
          const baseStep = 3 + (index * 3);
          return [
            `${baseStep}. Import package ${info.artifact}:`,
            "   - Navigate to Integrations > Packages > Import.",
            `   - Browse and select ${info.artifact}.`,
            "   - Deselect Include Asserter Recordings if displayed.",
            "   - Click Import.",
            "   - Click Import and Replace when prompted.",
            "   - Click Import and Configure if the Configuration Editor is displayed.",
            "   - Wait until the Configuration Editor is displayed.",
            "",
            `${baseStep + 1}. Configure and validate the required connections for the imported package:`,
            connectionList.replace(/^- /gm, "   - "),
            "   - Open/edit each connection from the Configuration Editor.",
            "   - Validate environment-specific connection values for the target environment.",
            "   - The password administrator will enter or validate the required credential values.",
            "   - Test and save each connection.",
            "   - Refresh metadata when applicable.",
            "",
            `${baseStep + 2}. Activate the integrations included in ${info.name} after all required connections are 100% configured.`,
            "   - Enable Audit and payload validation for every integration when prompted.",
            nonProdScheduleSkip && !environmentIsProduction
              ? "   - Do not configure Add Schedule or Start Schedule steps in this non-production environment; IM090 marks schedule sections as productive-only."
              : ""
          ].join("\n");
        }).join("\n\n")
      ].join("\n\n"))
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable unless the imported package explicitly includes scheduled integrations requiring schedule start.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: prepareContent([
        `Validate both package import and integration activation for the target environment: ${target}.`,
        `Validate package(s) imported successfully:\n${packageList}`,
        `Validate all required connections test successfully:\n${connectionList}`,
        "Validate each expected integration is present and Active in the target OIC environment.",
        nonProdScheduleSkip && !environmentIsProduction
          ? "Validate scheduled integrations remain active without configuring or starting schedules because the IM090 marks schedule steps as productive-only for non-production environments."
          : "",
        "",
        "Integration validation list:",
        validationList
      ].join("\n\n"), { dedupe: false })
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: prepareContent([
        "If package import, connection configuration, or activation fails, stop execution and capture the error.",
        "If existing components were replaced and rollback is required, restore the exported backup package/integrations.",
        "Do not change credentials, endpoints, connection policies, or package content outside the approved scope without confirmation."
      ].join("\n"))
    },
    {
      id: "evidence",
      title: "Evidence",
      content: prepareContent([
        "Attach evidence showing:",
        "1. Target OIC environment.",
        "2. Backup/export evidence, if existing components were found.",
        "3. Import result for each .par package.",
        "4. Connection test/save success for the required connections.",
        "5. Activation status of the integrations.",
        "6. Final validation confirming all expected integrations are Active.",
        "Do not attach screenshots or files exposing password values."
      ].join("\n"))
    }
  ];
}

export function buildManualPhasesFromDocument(text: string, selectedEnvironment = ""): ManualActionPhase[] {
  if (hasVisualBuilderExportWithDataInstructions(text)) return buildVisualBuilderExportWithDataPlan(text, selectedEnvironment);
  if (hasOicLookupOnlyInstructions(text)) return buildOicLookupOnlyPlan(text, selectedEnvironment);
  if (hasOicConnectionOnlyInstructions(text)) return buildOicConnectionOnlyPlan(text, selectedEnvironment);
  if (hasOicResetPasswordInstructions(text)) return buildOicResetPasswordPlan(text, selectedEnvironment);
  if (hasOicTracingInstructions(text)) return buildOicTracingPlan(text, selectedEnvironment);
  if (hasOicScheduleStopOnlyInstructions(text)) return buildOicScheduleStopOnlyPlan(text, selectedEnvironment);
  if (hasOicScheduledJobDisableInstructions(text)) return buildOicScheduledJobDisablePlan(text, selectedEnvironment);
  if (hasOicDeactivationInstructions(text)) return buildOicDeactivationPlan(text, selectedEnvironment);
  const packageImportPlan = buildOicPackageImportPlan(text, selectedEnvironment);
  if (packageImportPlan.length) return packageImportPlan;
  const scope = oicScopeOverrides(text);
  const operational = operationalIm090Text(text);
  const metadata = oicDetectedMetadata(text);
  const connectionReference = connectionReferenceBlock(text, selectedEnvironment, metadata.connections, scope);
  const lines = actionPlanLinesFromIm090(text);
  const startAt = 0;
  const artifactSection = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Installation artifacts\b/i, /^Installation artifacts\b/i], startAt);
  const artifactContent = artifactSection || looseSectionByHeadings(operational, ["Installation artifacts"], [
    "Pre installation steps",
    "Pre-Installation Steps",
    "Installation Steps"
  ]);
  const artifactDetectionText = [artifactContent, operational].filter(Boolean).join("\n");
  const loadedArtifacts = loadedOicArtifactFiles(text);
  const referencedArtifacts = installableArtifactNames(text).filter((artifact) => !/\.wsdl$/i.test(artifact));
  const connectionNotes = connectionConfigurationNotes(text, metadata.connections, { includeConnections: false, includeWsdlFiles: !loadedArtifacts.length });
  const installableArtifacts = loadedArtifacts.length
    ? sortOicArtifacts(preferCanonicalOicIarArtifacts(collapseSupersededVersionedArtifacts(uniqueValues([...loadedArtifacts, ...referencedArtifacts]))))
    : sortOicArtifacts(preferCanonicalOicIarArtifacts(collapseSupersededVersionedArtifacts(uniqueValues([
        ...installableArtifactNames(artifactDetectionText),
        ...referencedArtifacts,
        ...libraryZipArtifacts(text)
      ]))));
  const artifacts = (installableArtifacts.length
    ? installableArtifacts
    : extractArtifactNames(artifactContent || operational, { includeComponentNames: true }))
    .filter((artifact) => !scope.ignoreLookups || !/\.csv$/i.test(artifact));
  const preInstall = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Pre[- ]Installation Steps\b/i, /^Pre[- ]Installation Steps\b/i], startAt, { dedupe: false });
  const backupIntegration = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Get a backup integration\b/i, /^Get a backup integration\b/i], startAt);
  const backupLookups = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Get a backup lookups?\b/i, /^Get a backup lookups?\b/i], startAt);
  const installation = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Installation Steps\b/i, /^Installation Steps\b/i], startAt);
  const schedule = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Schedule activation\b/i, /^\d+(?:\.\d+)*\s+Configure and start scheduler\b/i, /^\d+(?:\.\d+)*\s+Scheduled(?: an)? Integration\b/i, /^Schedule activation\b/i, /^Configure and start scheduler\b/i, /^Scheduled(?: an)? Integration\b/i], startAt);
  const validation = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Verification Checklist\b/i, /^Verification Checklist\b/i], startAt);
  const returnPoint = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Return Point\b/i, /^Return Point\b/i], startAt);
  const environmentContentRaw = environmentSectionFromDocument(text);
  const environmentContent = repairOicTargetEnvironmentContent(
    oicEnvironmentExecutionContext(
      filterEnvironmentSection(environmentContentRaw, selectedEnvironment),
      environmentContentRaw,
      selectedEnvironment,
      text
    ),
    text
  );
  const preInstallContent = preInstall || looseSectionByHeadings(operational, ["Pre installation steps", "Pre-Installation Steps"], ["Get a backup integration", "Installation Steps", "2 OUT_"], { dedupe: false });
  const backupContent = [backupIntegration, scope.ignoreLookups ? "" : backupLookups].filter(Boolean).join("\n\n") ||
    looseSectionByHeadings(operational, ["Get a backup integration"], ["Installation Steps"]);
  const installationContent = installation || looseSectionByHeadings(operational, ["Installation Steps"], [
    "Configure and start scheduler",
    "Schedule activation",
    "Verification Checklist",
    "Return Point"
  ]);
  const structuredInstallationSections = hasStructuredOicInstallationSections(operational);
  const directInstructionContent = !installationContent && !structuredInstallationSections && hasNumberedInstructionSteps(operational) ? operational : "";
  const scheduleContent = schedule || looseSectionByHeadings(operational, ["Schedule activation", "Configure and start scheduler", "Scheduled Integration", "Scheduled an Integration"], [
    "Verification Checklist",
    "Return Point"
  ]);
  const scheduleNotApplicable = !metadata.schedules.length && oicScheduleContentIsNotApplicable(scheduleContent);
  const validationContent = validation || looseSectionByHeadings(operational, ["Verification Checklist"], ["Return Point"]);
  const returnPointContent = returnPoint || looseSectionByHeadings(operational, ["Return Point"], ["Open and Closed Issues"]);
  const prepareContent = (content: string, options: { dedupe?: boolean } = {}) => prepareManualPhaseContent(sanitizeOicSensitiveContent(content, { omitWsdlFileExamples: Boolean(loadedArtifacts.length) }), selectedEnvironment, options);
  const preInstallClean = /^pre$/i.test(preInstallContent.trim()) || isNonExecutablePreInstallContent(preInstallContent) ? "" : preInstallContent;
  const useScopedInstallation = scope.ignoreDashboard || scope.ignoreLookups;
  const fallbackInstallationContent = oicInstallationFallback(scope, metadata, artifacts, selectedEnvironment, text);
  const useFallbackInstallation = useScopedInstallation || structuredInstallationSections;
  const prerequisiteEnvironmentContent = useFallbackInstallation
    ? oicTargetEnvironmentSummary(text, selectedEnvironment)
    : environmentContent;
  const scopedBackupContent = useFallbackInstallation
    ? oicScopeBackupPlan(text, scope.ignoreLookups) || oicBackupFallback(scope.ignoreLookups, metadata.integrations)
    : backupContent || oicBackupFallback(scope.ignoreLookups, metadata.integrations);
  const scopedInstallationContent = useFallbackInstallation
    ? fallbackInstallationContent
    : directInstructionContent || installationContent || fallbackInstallationContent;
  const importValidationItems = loadedArtifacts.length ? artifacts : metadata.integrations;
  const lookupArtifactItems = artifacts.filter((artifact) => /\.csv$/i.test(artifact));

  const phases: ManualActionPhase[] = [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Validate target environment, access, and artifacts before starting the manual installation.",
        prerequisiteEnvironmentContent,
        "Artifacts detected:",
        asBullets(artifacts),
        detectedBlock("Integrations detected", metadata.integrations),
        detectedBlock("Connections detected", metadata.connections),
        metadata.connections.length ? credentialSessionMessage() : "",
        connectionReference,
        !useFallbackInstallation && !scope.ignoreLookups ? detectedBlock("DVM/lookups detected", metadata.dvms) : "",
        scope.requiresOnlineCredentialSession && !metadata.connections.length ? "Execution requires an online session with the RFC owner and password administrator to provide/validate credentials through the approved secure channel." : "",
        "Do not capture or expose password values in the Action Plan or RFC evidence.",
        preInstallClean
      ].filter(Boolean).join("\n\n"), { dedupe: false })
    },
    {
      id: "backup",
      title: "Backup",
      content: prepareContent(scopedBackupContent)
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: prepareContent([
        scopedInstallationContent,
        !useFallbackInstallation && importValidationItems.length ? `Import/validate the following integration artifact(s):\n${asBullets(importValidationItems)}` : "",
        !useFallbackInstallation && metadata.connections.length
          ? scope.commonConnectionsMayExist
            ? `Validate/configure the required connection(s) only if they are not already configured or if test fails:\n${asBullets(metadata.connections)}`
            : `Configure and test the required connection(s):\n${asBullets(metadata.connections)}`
          : "",
        useFallbackInstallation ? "" : connectionNotes,
        !useFallbackInstallation && !scope.ignoreLookups && metadata.dvms.length ? `Validate or update the required DVM/lookup value(s):\n${asBullets(metadata.dvms)}\nDo not document password values.` : "",
        !useFallbackInstallation && importValidationItems.length ? `Activate the imported integration(s) after connections${scope.ignoreLookups ? "" : " and DVM/lookups"} are configured.` : ""
      ].filter(Boolean).join("\n\n"))
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: prepareContent([
        metadata.schedules.length
          ? "Configure and start the required schedule(s) only after successful activation."
          : scheduleNotApplicable
            ? oicScheduleFallback()
            : scheduleContent || oicScheduleFallback(),
        detectedBlock("Schedules detected", metadata.schedules),
        metadata.schedules.length ? "Capture schedule activation evidence." : ""
      ].filter(Boolean).join("\n\n")),
      defaultIncluded: Boolean(metadata.schedules.length || (!scheduleNotApplicable && scheduleContent.trim()))
    },
    {
      id: "validation",
      title: "Validation",
      content: prepareContent([
        validationContent || "Validate deployed artifacts/components and confirm there are no deployment errors.",
        metadata.integrations.length ? "Validate all imported integrations are active." : "",
        metadata.connections.length ? "Validate all required connections show a successful test." : "",
        !scope.ignoreLookups && lookupArtifactItems.length ? `Validate imported lookup file(s) are saved correctly:\n${asBullets(lookupArtifactItems)}` : "",
        !useFallbackInstallation && !scope.ignoreLookups && !lookupArtifactItems.length && metadata.dvms.length ? "Validate DVM/lookup values are saved correctly without exposing passwords." : "",
        scope.ignoreDashboard ? "Confirm Dashboard / Visual Builder validation or installation was not executed as requested in the RFC." : "",
        scope.ignoreLookups ? "Confirm lookup import/configuration was not executed as requested in the RFC." : "",
        metadata.schedules.length ? "Validate required schedules are active." : ""
      ].filter(Boolean).join("\n\n"))
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: prepareContent(returnPointContent || "If the installation or validation fails, review configuration and consult the technical team.")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: prepareContent([
        "Capture evidence for each relevant installation step.",
        "Verify the source IM090 PDF is already available in the RFC; attach it only if it is missing.",
        "Attach backup evidence to the RFC.",
        "Attach final validation evidence and share the execution result.",
        scope.ignoreDashboard || scope.ignoreLookups ? "Attach evidence or execution notes for RFC scope exclusions." : ""
      ].join("\n"))
    }
  ];

  if (scope.ignoreDashboard || scope.ignoreLookups || scope.commonConnectionsMayExist) {
    phases.splice(1, 0, {
      id: "scope",
      title: "RFC Scope Adjustments",
      content: [
        scope.ignoreDashboard ? "Dashboard / Visual Builder section is excluded by the RFC description. Do not execute Dashboard validation, installation, or modification in this RFC." : "",
        scope.ignoreLookups ? "Lookup import/configuration is excluded by the RFC description. Do not import, replace, or modify lookup values in this RFC." : "",
        scope.commonConnectionsMayExist ? "Common-use connections may already be configured. Validate and test them first; change only connections that are missing or failing validation." : ""
      ].filter(Boolean).join("\n\n")
    });
  }

  return phases;
}
