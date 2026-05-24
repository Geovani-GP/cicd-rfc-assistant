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

function oicScheduleFallback() {
  return "Not applicable for this integration unless a schedule is explicitly required by the IM090.";
}

function oicScheduleContentIsNotApplicable(content: string) {
  if (!content.trim()) return true;
  return /\bN\/A\b|\bnot applicable\b/i.test(content) &&
    !/\bevery\s+\d+|\bstart schedule\b|\bstart running\b|\bfrequency\b/i.test(content);
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
  const lines: string[] = [
    target ? `Login to the Oracle Cloud Integration Admin Console for ${target}.` : "Login to the target Oracle Cloud Integration Admin Console.",
    "Go to Integrations.",
    metadata.integrations.length ? `Search for ${metadata.integrations.join(" or ")}.` : "Search for the target integration.",
    "If the same integration/version already exists, export a backup, deactivate it, and delete it.",
    artifacts.length ? `Import the artifact(s):\n${asBullets(artifacts)}` : "Import the integration artifact from the IM090 package.",
    metadata.connections.length
      ? `${scope.commonConnectionsMayExist ? "Validate" : "Configure and validate"} the required connection(s):\n${asBullets(metadata.connections)}`
      : "",
    scope.commonConnectionsMayExist ? "Configure only missing or failing connections using credentials provided through the approved secure channel." : "",
    scope.ignoreLookups ? "Do not execute lookup import/configuration steps." : "",
    scope.ignoreDashboard ? "Do not execute Dashboard / Visual Builder validation steps." : "",
    metadata.integrations.length ? `Activate ${metadata.integrations.join(" and ")}.` : "Activate the imported integration.",
    "Refresh activation status until the integration is active."
  ];
  return lines.filter(Boolean).map((line, index) => `${index + 1}. ${indentNestedBullets(line)}`).join("\n");
}

function oicScopeOverrides(text: string) {
  return {
    ignoreDashboard: /\b(?:ignore|exclude|do not (?:install|validate|modify|include)|no incluir|ignorar)\b[\s\S]{0,120}\b(?:dashboard|visual builder)\b|\b(?:dashboard|visual builder)\b[\s\S]{0,120}\b(?:separated RFC|separate RFC|another RFC|ignore|exclude)\b/i.test(text),
    ignoreLookups: /\b(?:ignore|exclude|do not (?:import|configure|modify|include)|no incluir|ignorar)\b[\s\S]{0,120}\blookups?\b|\blookups?\b[\s\S]{0,120}\b(?:separated RFC|separate RFC|another RFC|ignore|exclude)\b/i.test(text),
    commonConnectionsMayExist: /\bconnections?\b[\s\S]{0,160}\b(?:common use|already configured|could be already configured|ignore them if that's the case)\b/i.test(text),
    requiresOnlineCredentialSession: /\b(?:credentials?|passwords?)\b[\s\S]{0,180}\b(?:Daniela Gomez|session|secure channel|owner)\b|\bDaniela Gomez\b/i.test(text)
  };
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

function strictEnvironmentAliases(environment: string) {
  const selected = normalizeEnvironmentName(environment);
  if (selected === "REG") return ["REG", "REGRESSION"];
  if (selected === "TEST") return ["TEST"];
  if (selected === "PREPROD" || selected === "TE") return ["PREPROD", "TE"];
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

function linesMatching(text: string, pattern: RegExp) {
  return uniqueValues(
    text
      .split(/\r?\n/)
      .map((line) => line.match(pattern)?.[1] ?? "")
      .filter(Boolean)
  );
}

function connectionCandidatesFromText(text: string) {
  const technicalConnections = text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_CON(?:N)?ECTION\b/g) ?? [];
  const connPrefixedConnections = text.match(/\bCONN_[A-Z0-9_]+\b/g) ?? [];
  const editForConnections = Array.from(
    text.matchAll(/\bedit\s+for\s+([A-Z0-9][A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const editConnectionNames = Array.from(
    text.matchAll(/\bEdit connection\s+[‘'"]([^’'"]+)[’'"]/gi)
  ).map((match) => match[1]);
  const connectorNameConnections = Array.from(
    text.matchAll(/\b(?:REST|DATABASE)\s+Connector Name:\s*([A-Z0-9][A-Z0-9_ .-]{4,100})/gi)
  ).map((match) => match[1]);
  const namedConnections = Array.from(
    text.matchAll(/^Name:\s*([A-Z0-9][A-Z0-9_ .-]{4,100})$/gim)
  )
    .map((match) => match[1])
    .filter((value) => /\b(?:CONNECTION|API|SERVICE|AUTOMATION|ADAPTER|REST|SOAP)\b/i.test(value));
  const settingConnections = Array.from(
    text.matchAll(/\bSetting Connection\s*\(([^)]+)\)/gi)
  ).map((match) => match[1]);
  const explicitSearchedConnections = Array.from(
    text.matchAll(/\bSearch for\s+([A-Z0-9][A-Z0-9_ .-]{4,100}?)\s+connection,\s+this connection\b/gi)
  ).map((match) => match[1]);
  const chosenConnections = Array.from(
    text.matchAll(/\bConnections area,\s+choose\s+([A-Z0-9][A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const searchedConnections = Array.from(
    text.matchAll(/\bSearch for\s+([A-Z0-9][A-Z0-9_ .-]{4,80}?)\s+connection\b/gi)
  ).map((match) => match[1]);
  const reversedSearchedConnections = Array.from(
    text.matchAll(/\bsearch\s+the\s+connection\s+([A-Z0-9_ .-]{4,100})\b/gi)
  ).map((match) => match[1]);
  const setupConnections = Array.from(
    text.matchAll(/\bconfigure\s+([A-Z0-9][A-Z0-9_ .-]{4,80}?)\b/gi)
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

function sanitizeOicSensitiveContent(content: string) {
  const artifactNames = installableArtifactNames(content);
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
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

function connectionConfigurationNotes(text: string, connections: string[]) {
  const notes: string[] = [];
  const wsdlFiles = installableArtifactNames(text).filter((artifact) => /\.wsdl$/i.test(artifact));
  const hasUsernamePasswordToken = /\bUsername Password Token\b/i.test(text);
  if (!connections.length && !wsdlFiles.length && !hasUsernamePasswordToken) return "";
  if (connections.length) notes.push(`Required connection(s):\n${asBullets(connections)}`);
  if (wsdlFiles.length) notes.push(`WSDL file(s) referenced by the connection configuration:\n${asBullets(wsdlFiles)}`);
  if (hasUsernamePasswordToken) notes.push("Security policy: Username Password Token.");
  notes.push("Use the credentials provided through the approved secure channel. Do not document password values.");
  return notes.join("\n\n");
}

function oicScheduledIntegrationCandidates(text: string) {
  const scheduled = Array.from(
    text.matchAll(/\b(?:schedule|scheduled)\s+(?:the\s+)?([A-Z][A-Z0-9_]{6,})\b/gi)
  ).map((match) => match[1]);
  const frequency = text.match(/\bfrequency\s+is\s+every\s+([A-Za-z0-9 _-]+?)(?:\.|\n|$)/i)?.[1]?.trim();
  return uniqueValues(scheduled)
    .filter((value) => /_/.test(value) && !/\b(?:INTEGRATION|SCHEDULED)\b/i.test(value))
    .map((value) => frequency ? `${value} - every ${frequency}` : value);
}

function oicDetectedMetadata(text: string) {
  const integrationMetadata = text
    .split(/\r?\n/)
    .flatMap((line) => {
      const metadata = line.match(/^Integration:\s*([^|]+)(?:\|([^|]+))?(?:\|([^|]+))?/i);
      if (!metadata) return [];
      const code = metadata[1]?.trim();
      const name = metadata[2]?.trim();
      return [code, name].filter(Boolean);
    });
  const namedIntegrations = Array.from(text.matchAll(/^\s*Name\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gim)).map((match) => match[1]);
  const repeatedIntegrations = Array.from(text.matchAll(/\bRepeat the steps for the\s+([A-Z][A-Z0-9_]{6,})\s+integration\b/gi)).map((match) => match[1]);
  const scheduledIntegrations = oicScheduledIntegrationCandidates(text).map((value) => value.split(/\s+-\s+/)[0]);
  const referencedIntegrations = Array.from(text.matchAll(/\b(?:refer to|Search for|Integration name)\s+((?:IN|OUT|SYNC)_[A-Z0-9_]+)/gi)).map((match) => match[1]);
  const integrations = removePartialIntegrationNames([...integrationMetadata, ...namedIntegrations, ...referencedIntegrations])
    .concat(repeatedIntegrations, scheduledIntegrations)
    .filter((value) => !/^IN_LGFDATA_TO_WMS$/i.test(value))
    .filter((value) => /^(?:IN|OUT|SYNC)_[A-Z0-9_]+$/i.test(value));
  const connections = uniqueValues([
    ...linesMatching(text, /^connection:\s*([A-Z0-9_ .-]+)/i),
    ...connectionCandidatesFromText(text)
  ]);
  const dvms = linesMatching(text, /^dvm:\s*([A-Z0-9_ .-]+)/i);
  const schedules = uniqueValues([...linesMatching(text, /^schedule:\s*([A-Z0-9_ .-]+)/i), ...oicScheduledIntegrationCandidates(text)]);
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

export function buildManualPhasesFromDocument(text: string, selectedEnvironment = ""): ManualActionPhase[] {
  if (hasOicResetPasswordInstructions(text)) return buildOicResetPasswordPlan(text, selectedEnvironment);
  if (hasOicTracingInstructions(text)) return buildOicTracingPlan(text, selectedEnvironment);
  if (hasOicScheduledJobDisableInstructions(text)) return buildOicScheduledJobDisablePlan(text, selectedEnvironment);
  if (hasOicDeactivationInstructions(text)) return buildOicDeactivationPlan(text, selectedEnvironment);
  const scope = oicScopeOverrides(text);
  const operational = operationalIm090Text(text);
  const metadata = oicDetectedMetadata(text);
  const connectionNotes = connectionConfigurationNotes(text, metadata.connections);
  const lines = actionPlanLinesFromIm090(text);
  const startAt = 0;
  const artifactSection = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Installation artifacts\b/i, /^Installation artifacts\b/i], startAt);
  const artifactContent = artifactSection || looseSectionByHeadings(operational, ["Installation artifacts"], [
    "Pre installation steps",
    "Pre-Installation Steps",
    "Installation Steps"
  ]);
  const artifactDetectionText = [artifactContent, operational].filter(Boolean).join("\n");
  const installableArtifacts = sortOicArtifacts(preferCanonicalOicIarArtifacts(collapseSupersededVersionedArtifacts(uniqueValues([
    ...installableArtifactNames(artifactDetectionText),
    ...installableArtifactNames(text),
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
  const environmentContent = oicEnvironmentExecutionContext(
    filterEnvironmentSection(environmentContentRaw, selectedEnvironment),
    environmentContentRaw,
    selectedEnvironment,
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
  const directInstructionContent = !installationContent && hasNumberedInstructionSteps(operational) ? operational : "";
  const scheduleContent = schedule || looseSectionByHeadings(operational, ["Schedule activation", "Configure and start scheduler", "Scheduled Integration", "Scheduled an Integration"], [
    "Verification Checklist",
    "Return Point"
  ]);
  const scheduleNotApplicable = !metadata.schedules.length && oicScheduleContentIsNotApplicable(scheduleContent);
  const validationContent = validation || looseSectionByHeadings(operational, ["Verification Checklist"], ["Return Point"]);
  const returnPointContent = returnPoint || looseSectionByHeadings(operational, ["Return Point"], ["Open and Closed Issues"]);
  const prepareContent = (content: string) => prepareManualPhaseContent(sanitizeOicSensitiveContent(content), selectedEnvironment);
  const preInstallClean = /^pre$/i.test(preInstallContent.trim()) ? "" : preInstallContent;
  const useScopedInstallation = scope.ignoreDashboard || scope.ignoreLookups;
  const scopedInstallationContent = useScopedInstallation
    ? oicInstallationFallback(scope, metadata, artifacts, selectedEnvironment, text)
    : directInstructionContent || installationContent || "Execute the manual installation steps described in the IM090.";

  const phases: ManualActionPhase[] = [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Validate target environment, access, and artifacts before starting the manual installation.",
        environmentContent,
        "Artifacts detected:",
        asBullets(artifacts),
        detectedBlock("Integrations detected", metadata.integrations),
        detectedBlock("Connections detected", metadata.connections),
        scope.ignoreLookups ? "" : detectedBlock("DVM/lookups detected", metadata.dvms),
        scope.requiresOnlineCredentialSession ? "Execution requires an online session with the RFC owner and Daniela Gomez to provide/validate credentials through the approved secure channel." : "",
        "Do not capture or expose password values in the Action Plan or RFC evidence.",
        preInstallClean
      ].filter(Boolean).join("\n\n"))
    },
    {
      id: "backup",
      title: "Backup",
      content: prepareContent(backupContent || oicBackupFallback(scope.ignoreLookups, metadata.integrations))
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: prepareContent([
        scopedInstallationContent,
        !useScopedInstallation && metadata.integrations.length ? `Import/validate the following integration artifact(s):\n${asBullets(metadata.integrations)}` : "",
        !useScopedInstallation && metadata.connections.length
          ? scope.commonConnectionsMayExist
            ? `Validate/configure the required connection(s) only if they are not already configured or if test fails:\n${asBullets(metadata.connections)}`
            : `Configure and test the required connection(s):\n${asBullets(metadata.connections)}`
          : "",
        useScopedInstallation ? "" : connectionNotes,
        !scope.ignoreLookups && metadata.dvms.length ? `Validate or update the required DVM/lookup value(s):\n${asBullets(metadata.dvms)}\nDo not document password values.` : "",
        !useScopedInstallation && metadata.integrations.length ? `Activate the imported integration(s) after connections${scope.ignoreLookups ? "" : " and DVM/lookups"} are configured.` : ""
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
        !scope.ignoreLookups && metadata.dvms.length ? "Validate DVM/lookup values are saved correctly without exposing passwords." : "",
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
