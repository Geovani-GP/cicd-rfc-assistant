import { prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueValues(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const clean = normalizeWhitespace(value);
    if (!clean) continue;
    byKey.set(clean.toUpperCase(), clean);
  }
  return Array.from(byKey.values());
}

function odiSummary(text: string) {
  return firstMatch(text, [/Summary\s+(.+?)(?:\n|Description\b)/is]);
}

function odiTechnology(text: string) {
  const value = firstMatch(text, [
    /Open\s+([A-Za-z0-9 ]*RESTful Service)\b/i,
    /expand\s+([A-Za-z0-9 ]*Oracle)\b/i,
    /Open Technologies\s+Open\s+([A-Za-z0-9 ]+)/i
  ]);
  if (/^oracle$/i.test(value)) return "Oracle";
  if (/restful service/i.test(value)) return "RESTful Service";
  return value || "RESTful Service";
}

function odiDataServer(text: string) {
  return firstMatch(text, [
    /Data Server\s+([A-Z0-9_.$-]+)/i,
    /Open the Data Server\s+([A-Z0-9_.$-]+)/i,
    /Data Server:\s*([A-Z0-9_.$-]+)/i,
    /\bOpen\s+(GB_[A-Z0-9_.$-]+)/i,
    /\bOpen\s+([A-Z0-9]+_[A-Z0-9_.$-]+_STG)\b/i
  ]);
}

function odiUser(text: string) {
  return firstMatch(text, [
    /Validate that the user is\s+([A-Za-z0-9_.@-]+)/i,
    /configured user(?:\s+is|:)\s+([A-Za-z0-9_.@-]+)/i,
    /User:\s*([A-Za-z0-9_.@-]+)/i
  ]);
}

function odiAgent(text: string) {
  return firstMatch(text, [
    /select the\s+([A-Za-z0-9_.-]*Agent[A-Za-z0-9_.-]*)/i,
    /\b(OracleDIAgent)\b/i,
    /agent(?:\s+is|:)\s+([A-Za-z0-9_.-]+)/i
  ]) || "OracleDIAgent";
}

export function hasOdiInstructions(text: string) {
  return /\bODI\b|ODI Studio|OdiSftp|OracleDIAgent|setDomainEnv\.sh|KB183202|SUPERVISOR|Topology|Physical Architecture|RESTful Service|Data Server|ODI integration components|Connect to Repository|Regenerate .*scenario|SunopsisExport|SnpMapping|SnpPackage|ODI Mapping:|ODI Package:/i.test(text);
}

function hasOdiComponentImportInstructions(text: string) {
  return /Backup ODI integration components|Import ODI integration components|Regenerate .*scenario|Objects to be Exported|Exporting the following objects|Artifact file:\s*[^\n\r]+\.xml|ODI Mapping:|ODI Package:|ODI Scenario:|SunopsisExport|SnpMapping|SnpPackage/i.test(text);
}

function hasOdiJeeAgentRemediation(text: string) {
  return /KB183202|OdiSftp|OracleDIAgent|setDomainEnv\.sh|commons-vfs2|org\.apache\.commons\.vfs2\.UserAuthenticator|ODI JEE Agent/i.test(text);
}

function objectPattern() {
  return /\b(?:PRC|RPC|PCR|PKG|SCN|MAP|FILE|TAB|VL)[A-Za-z0-9_]*\b/g;
}

function linesBetween(text: string, start: RegExp, end: RegExp) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const startIndex = lines.findIndex((line) => start.test(line));
  if (startIndex < 0) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && end.test(line));
  return lines.slice(startIndex + 1, endIndex >= 0 ? endIndex : lines.length);
}

function objectNamesFromLines(lines: string[]) {
  return uniqueValues(lines.flatMap((line) => line.match(objectPattern()) ?? []));
}

function exportedOdiObjects(text: string) {
  const dragList = objectNamesFromLines(linesBetween(text, /Objects to be Exported/i, /Wait for the system/i));
  if (dragList.length) return dragList;
  return objectNamesFromLines(linesBetween(text, /Exporting the following objects/i, /Open ODI Studio/i));
}

function odiObjectNames(text: string) {
  const exported = exportedOdiObjects(text);
  const matches = text.match(objectPattern()) ?? [];
  const values = exported.length ? exported : matches;
  return uniqueValues(values.map(normalizeOdiObjectName))
    .filter((item) => item.length >= 5);
}

function normalizeOdiObjectName(value: string) {
  return normalizeWhitespace(value)
    .replace(/\.xml$/i, "")
    .replace(/^MAP_(MAP_)/i, "$1")
    .replace(/^PACK_(PKG_)/i, "$1")
    .replace(/^PKG_(PKG_)/i, "$1");
}

function componentValues(text: string, label: string) {
  return uniqueValues(
    Array.from(text.matchAll(new RegExp(`\\b${label}:\\s*([^\\n\\r]+)`, "gi")))
      .map((match) => match[1].trim())
      .filter(Boolean)
  );
}

function odiArtifacts(text: string) {
  return uniqueValues(Array.from(text.matchAll(/\bArtifact file:\s*([^\n\r]+\.xml)\b/gi)).map((match) => match[1].trim()));
}

function odiMappings(text: string) {
  return uniqueValues([
    ...componentValues(text, "ODI Mapping").map(normalizeOdiObjectName),
    ...odiObjectNames(text).filter((item) => /^MAP_/i.test(item))
  ]);
}

function odiPackages(text: string) {
  return uniqueValues([
    ...componentValues(text, "ODI Package").map(normalizeOdiObjectName),
    ...odiObjectNames(text).filter((item) => /^PKG_/i.test(item))
  ]);
}

function odiScenarios(text: string) {
  const explicitScenario = odiScenario(text);
  return uniqueValues([
    ...componentValues(text, "ODI Scenario"),
    explicitScenario ? explicitScenario.replace(/\s+Version\s+\d+$/i, "") : "",
    ...odiObjectNames(text).filter((item) => /^SCN_/i.test(item))
  ].filter(Boolean));
}

function odiVariables(text: string) {
  return uniqueValues([
    ...componentValues(text, "ODI Variable"),
    ...Array.from(text.matchAll(/\b(PRY_[A-Z0-9_]+\.V[A-Za-z0-9_]+)\b/g)).map((match) => match[1])
  ]);
}

function odiProcedures(text: string) {
  return uniqueValues([
    ...componentValues(text, "ODI Procedure"),
    ...odiObjectNames(text).filter((item) => /^(?:PRC|RPC|PCR)_/i.test(item))
  ]);
}

function odiProject(text: string) {
  return componentValues(text, "ODI Project")[0] || firstMatch(text, [/\b(PRY_[A-Z0-9_]+)\b/i]);
}

function odiFolder(text: string) {
  return componentValues(text, "ODI Folder")[0] ||
    firstMatch(text, [/\bPRY_[A-Z0-9_]+\s*[-.>]+\s*([A-Z0-9_ ]*COMMONS)\b/i, /\bPRY_[A-Z0-9_]+\.([A-Z0-9_ ]*COMMONS)\./i]);
}

function odiSqlScripts(text: string) {
  return uniqueValues(text.match(/\b[A-Z0-9_.-]+\.sql\b/gi) ?? []);
}

function odiProjectPaths(text: string) {
  return uniqueValues(
    Array.from(text.matchAll(/\b(PRY_[A-Z0-9_]+(?:\s+FOL_[A-Z0-9_]+)?(?:\s+(?:Procedures|Mappings|Variables|Packages))?)/gi))
      .map((match) => match[1])
  );
}

function odiScenario(text: string) {
  const joinedText = text.replace(/([A-Z0-9])\s*\n\s*(_[A-Z0-9_]+)/g, "$1$2");
  return firstMatch(text, [
    /Regenerate\s+([A-Z0-9_]+\s+Version\s+\d+)/i,
    /Right click on the\s+([A-Z0-9_]+\s+Version\s+\d+)\s+scenario/i
  ]) || firstMatch(joinedText, [/\b(SCN_[A-Z0-9_]+)\b/i]);
}

function odiSchema(text: string) {
  return firstMatch(text, [/schema\s+([A-Z0-9_]+)/i]);
}

function odiTargetInstance(text: string) {
  return firstMatch(text, [
    /Target instance:\s*([A-Z0-9_-]+)/i,
    /\b(GBODI[A-Z0-9_-]+)\b/i
  ]);
}

function odiMiddlewareHosts(text: string) {
  return uniqueValues(Array.from(text.matchAll(/\b(oracle-odi-inst-[A-Za-z0-9-]+)\b/gi)).map((match) => match[1]));
}

function odiDomainHome(text: string) {
  return firstMatch(text, [
    /(\/[A-Za-z0-9_.-]+\/local\/config\/domains\/odi_domain)\b/i,
    /(\/[^\s]+\/domains\/odi_domain)\b/i
  ]) || "<DOMAIN_HOME>";
}

function odiCommonsVfsJarSource(text: string) {
  return firstMatch(text, [
    /(\/u01\/oracle\/mwh\/oracle_common\/modules\/thirdparty\/commons-vfs2-[0-9.]+\.jar)\b/i,
    /(\/[^\s]+\/commons-vfs2-[0-9.]+\.jar)\b/i
  ]) || "/u01/oracle/mwh/oracle_common/modules/thirdparty/commons-vfs2-2.2.jar";
}

function odiManagedServers(text: string) {
  const explicit = uniqueValues(Array.from(text.matchAll(/\b(ODI_server\d+)\b/gi)).map((match) => match[1]));
  return explicit.length ? explicit : ["ODI_server1", "ODI_server2"];
}

function buildOdiJeeAgentRemediationPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const instance = odiTargetInstance(text) || "<ODI_INSTANCE>";
  const domainHome = odiDomainHome(text);
  const domainLib = domainHome === "<DOMAIN_HOME>" ? "<DOMAIN_HOME>/lib" : `${domainHome}/lib`;
  const setDomainEnv = domainHome === "<DOMAIN_HOME>" ? "<DOMAIN_HOME>/bin/setDomainEnv.sh" : `${domainHome}/bin/setDomainEnv.sh`;
  const jarSource = odiCommonsVfsJarSource(text);
  const jarName = jarSource.split("/").pop() || "commons-vfs2-2.2.jar";
  const jarTarget = `${domainLib}/${jarName}`;
  const hosts = odiMiddlewareHosts(text);
  const hostLines = hosts.length ? hosts.map((item) => `- ${item}`).join("\n") : "- Confirm ODI middleware host(s) for the target instance.";
  const servers = odiManagedServers(text);
  const serverLines = servers.map((item) => `- ${item}`).join("\n");
  const agent = odiAgent(text);
  const environment = selectedEnvironment || "<Environment>";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        "Confirm approval to implement KB183202 remediation for ODI JEE Agent deployments.",
        `Confirm target environment and instance:\n- Environment: ${environment}\n- Instance: ${instance}`,
        `Confirm middleware host access:\n${hostLines}`,
        "Confirm the required files and paths before execution:",
        `- Source jar: ${jarSource}`,
        `- Domain Home: ${domainHome}`,
        `- Domain lib directory: ${domainLib}`,
        `- Domain environment script: ${setDomainEnv}`,
        "Confirm the current failure is consistent with:",
        "- ODI-17514: Unrecognized Oracle Data Integrator built-in function: OdiSftp",
        "- java.lang.ClassNotFoundException: org.apache.commons.vfs2.UserAuthenticator",
        "Confirm maintenance window approval and restart authorization for the ODI managed servers.",
        "Do not capture or expose OS, WebLogic, or repository password values."
      ].join("\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Capture current state before modifying the domain:",
        `- Evidence that ${jarSource} exists.`,
        "- Evidence that the jar contains org.apache.commons.vfs2.UserAuthenticator.",
        `- Evidence of current Domain Home: ${domainHome}`,
        `- Evidence of current Domain lib directory state: ${domainLib}`,
        `- Evidence that ${setDomainEnv} currently references commons-vfs2.jar.`,
        "",
        "Backup the current setDomainEnv.sh before editing:",
        `- Source: ${setDomainEnv}`,
        "- Backup name/location: use the approved RFC backup naming convention.",
        "",
        "Capture current WebLogic/ODI managed server status before restart:",
        serverLines
      ].join("\n")
    },
    {
      id: "installation",
      title: "Implementation Steps",
      content: [
        "Implement KB183202 remediation for ODI JEE Agent.",
        "",
        "1. Connect to the approved middleware host(s):",
        hostLines,
        "",
        "2. Create the Domain Home lib directory if it does not exist:",
        `- ${domainLib}`,
        "- Required permissions: drwxr-x---",
        "",
        "3. Copy the commons-vfs2 jar to the Domain Home lib directory:",
        `- From: ${jarSource}`,
        `- To: ${jarTarget}`,
        "",
        "4. Update the domain environment script according to KB183202 section \"For ODI JEE Agent\":",
        `- ${setDomainEnv}`,
        "- Ensure the OracleDIAgent classpath loads the Domain Home lib commons-vfs2 jar.",
        "- Preserve the original script formatting and existing environment-specific values.",
        "",
        "5. Clear WebLogic cache according to KB90003 for the affected ODI managed servers.",
        "",
        "6. Restart ODI managed servers to load the updated classpath:",
        serverLines,
        "",
        "7. If KB183202 validation requires it, perform a controlled Admin Server restart only within the approved window.",
        "",
        `8. Validate ${agent} startup after restart.`
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable. This RFC remediates ODI JEE Agent classpath configuration and does not request ODI schedule activation.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the ODI runtime after remediation:",
        `1. Confirm the managed servers are RUNNING:\n${serverLines}`,
        `2. Confirm ${agent} starts successfully.`,
        "3. Execute the previously failing OdiSftp scenario.",
        "4. Verify the ClassNotFoundException is no longer present:",
        "- org.apache.commons.vfs2.UserAuthenticator",
        "5. Verify ODI-17514 is no longer present:",
        "- Unrecognized Oracle Data Integrator built-in function: OdiSftp",
        "6. Confirm SFTP-related ODI jobs complete successfully."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If validation fails or the managed servers do not start correctly:",
        "1. Stop the affected ODI managed servers.",
        "2. Restore the original setDomainEnv.sh from the backup captured before the change.",
        `3. Remove the copied jar from Domain Home lib if rollback requires it:\n- ${jarTarget}`,
        "4. Clear WebLogic cache according to KB90003.",
        "5. Restart the ODI managed servers:",
        serverLines,
        "6. Validate the environment returns to the pre-change state.",
        "7. Capture the failure evidence and escalate to the ODI/WebLogic technical owner before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "- Pre-change jar/path validation.",
        "- setDomainEnv.sh backup creation.",
        `- ${domainLib} creation and permissions.`,
        "- commons-vfs2 jar copy into Domain Home lib.",
        "- setDomainEnv.sh update according to KB183202.",
        "- WebLogic cache clear according to KB90003.",
        "- ODI managed server restart and RUNNING state.",
        `- ${agent} successful startup.`,
        "- Successful OdiSftp scenario/job retest.",
        "- Absence of ODI-17514 and ClassNotFoundException after the change.",
        "",
        "Do not attach screenshots or files exposing credentials, tokens, private keys, or personal data."
      ].join("\n")
    }
  ];
}

export function odiConfigurationItems(text: string) {
  if (hasOdiJeeAgentRemediation(text)) {
    const instance = odiTargetInstance(text);
    const domainHome = odiDomainHome(text);
    const jarSource = odiCommonsVfsJarSource(text);
    return [
      instance ? `ODI Instance: ${instance}` : "",
      "KB183202 ODI JEE Agent remediation",
      `Domain Home: ${domainHome}`,
      `setDomainEnv.sh: ${domainHome === "<DOMAIN_HOME>" ? "<DOMAIN_HOME>/bin/setDomainEnv.sh" : `${domainHome}/bin/setDomainEnv.sh`}`,
      `Source jar: ${jarSource}`,
      "WebLogic cache clear: KB90003",
      ...odiManagedServers(text).map((server) => `Managed Server: ${server}`)
    ].filter(Boolean);
  }
  if (hasOdiComponentImportInstructions(text)) {
    const artifacts = odiArtifacts(text);
    const mappings = odiMappings(text);
    const packages = odiPackages(text);
    const scenarios = odiScenarios(text);
    if (artifacts.length) return artifacts;
    const items = [
      ...mappings.map((item) => `Mapping: ${item}`),
      ...packages.map((item) => `Package: ${item}`),
      ...scenarios.map((item) => `Scenario: ${item}`),
      ...odiSqlScripts(text),
    ].filter(Boolean);
    return items.length ? items : ["ODI integration components"];
  }
  const technology = odiTechnology(text);
  const dataServer = odiDataServer(text);
  const user = odiUser(text);
  const items = [
    technology ? `Technology: ${technology}` : "",
    dataServer ? `Data Server: ${dataServer}` : "",
    user ? `Configured user: ${user}` : ""
  ].filter(Boolean);
  return items.length ? items : ["Confirm ODI Studio topology configuration item from the RFC overview."];
}

function buildOdiComponentImportPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const artifacts = odiArtifacts(text);
  const mappings = odiMappings(text);
  const packages = odiPackages(text);
  const scenarios = odiScenarios(text);
  const variables = odiVariables(text);
  const procedures = odiProcedures(text);
  const objects = uniqueValues([...mappings, ...packages, ...scenarios, ...procedures, ...variables]);
  const scripts = odiSqlScripts(text);
  const projectPaths = odiProjectPaths(text);
  const scenario = scenarios[0] || odiScenario(text) || "<SCENARIO_NAME>";
  const schema = odiSchema(text) || "<TARGET_SCHEMA>";
  const environment = selectedEnvironment || "<Environment>";
  const project = odiProject(text);
  const folder = odiFolder(text);
  const projectFolder = [project, folder].filter(Boolean).join(" / ");
  const artifactLines = artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : "- <ODI XML export artifact(s)>";
  const mappingLines = mappings.length ? mappings.map((item) => `- ${item}`).join("\n") : "- <MAPPING_OBJECTS>";
  const packageLines = packages.length ? packages.map((item) => `- ${item}`).join("\n") : "- <PACKAGE_OBJECTS>";
  const scenarioLines = scenarios.length ? scenarios.map((item) => `- ${item}`).join("\n") : `- ${scenario}`;

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        "Confirm ODI Studio access and repository credentials for the target environment.",
        `Confirm the target environment is ${environment}.`,
        scripts.length ? "Confirm database access to execute the required SQL script." : "",
        "Confirm all ODI XML/export files are available before execution.",
        artifacts.length ? `Artifacts detected:\n${artifactLines}` : "",
        projectFolder ? `Confirm the target ODI project/folder:\n- ${projectFolder}` : "",
        "Do not capture or expose repository or database password values."
      ].filter(Boolean).join("\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Open ODI Studio and connect to the repository.",
        "Export the current ODI objects before importing the new version:",
        objects.length ? objects.map((item) => `- ${item}`).join("\n") : "- <ODI_OBJECTS_FROM_RFC>",
        "Capture the export result and backup location.",
        scenarios.length ? `Capture current scenario/version evidence:\n${scenarioLines}` : "Capture current scenario/version evidence before regeneration."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "Open ODI Studio and connect to the repository.",
        projectFolder ? `Navigate to the target ODI project/folder:\n- ${projectFolder}` : projectPaths.length ? `Navigate to the required ODI project/folder path(s):\n${projectPaths.map((item) => `- ${item}`).join("\n")}` : "",
        scripts.length ? `Execute the required database script(s) in schema ${schema}:\n${scripts.map((item) => `- ${item}`).join("\n")}` : "",
        "Import the ODI mapping artifact first:",
        artifacts.filter((item) => /^MAP_/i.test(item)).map((item) => `- ${item}`).join("\n") || mappingLines,
        "Validate imported mapping object(s):",
        mappingLines,
        "Import the ODI package artifact after the mapping dependency:",
        artifacts.filter((item) => /^PACK_/i.test(item) || /^PKG_/i.test(item)).map((item) => `- ${item}`).join("\n") || packageLines,
        "Validate imported package object(s):",
        packageLines,
        procedures.length ? `Validate referenced ODI procedure object(s):\n${procedures.map((item) => `- ${item}`).join("\n")}` : "",
        variables.length ? `Validate referenced ODI variable object(s) remain configured for the target environment:\n${variables.map((item) => `- ${item}`).join("\n")}` : "",
        `Validate or regenerate the ODI scenario as required by the ODI procedure:\n${scenarioLines}`,
        "Do not change variables marked as Startup Parameter unless the RFC explicitly requires it."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable unless the RFC explicitly requests ODI schedule activation.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the imported ODI objects exist in the target project/folder.",
        mappings.length ? `Validate mapping object(s):\n${mappingLines}` : "",
        packages.length ? `Validate package object(s):\n${packageLines}` : "",
        scripts.length ? "Validate the database script execution completed successfully." : "",
        `Validate the scenario is available:\n${scenarioLines}`,
        mappings.length && packages.length ? "Confirm the package references the imported mapping dependency correctly." : "",
        "Confirm there are no ODI import or regeneration errors."
      ].filter(Boolean).join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If import or validation fails, stop the execution and capture the error.",
        "Restore the previously exported ODI objects if rollback is approved.",
        scripts.length ? "If the SQL script was executed and rollback is required, coordinate the database rollback with the DBA/request owner." : "",
        "Escalate to the ODI/application owner before retrying."
      ].filter(Boolean).join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach ODI object backup/export evidence.",
        scripts.length ? "Attach SQL script execution evidence." : "",
        "Attach ODI import confirmation evidence.",
        "Attach scenario regeneration evidence.",
        "Attach final validation evidence.",
        "Do not attach credential/password evidence."
      ].filter(Boolean).join("\n")
    }
  ];
}

export function buildOdiTopologyPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  if (hasOdiJeeAgentRemediation(text)) return buildOdiJeeAgentRemediationPlan(text, selectedEnvironment);
  if (hasOdiComponentImportInstructions(text)) return buildOdiComponentImportPlan(text, selectedEnvironment);

  const summary = normalizeWhitespace(odiSummary(text));
  const technology = odiTechnology(text);
  const dataServer = odiDataServer(text) || "<DATA_SERVER>";
  const user = odiUser(text) || "<CONFIGURED_USER>";
  const agent = odiAgent(text);
  const environment = selectedEnvironment || "<Environment>";
  const repositoryUser = /\bSUPERVISOR\b/i.test(text) ? "SUPERVISOR user" : "approved ODI repository user";
  const hasExplicitUser = user !== "<CONFIGURED_USER>";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        `Confirm ODI Studio access with the ${repositoryUser}.`,
        `Confirm the target environment is ${environment}.`,
        "Confirm the new password is available through the approved secure session.",
        "Do not capture or expose the password value."
      ].join("\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Capture current configuration evidence before the change:",
        `- Technology: ${technology}`,
        `- Data Server: ${dataServer}`,
        hasExplicitUser ? `- Configured user: ${user}` : "- Configured user/account: validate before update",
        "",
        "Do not capture or expose the current password value."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        `Login to ODI Studio with the ${repositoryUser}.`,
        "Go to Topology.",
        "Open Physical Architecture.",
        "Open Technologies.",
        `Open ${technology}.`,
        `Open Data Server:\n- ${dataServer}`,
        hasExplicitUser ? `Validate that the configured user is:\n- ${user}` : "Validate the configured user/account before updating the password.",
        "Update the password field with the password shared through the approved secure session.",
        "Click Save.",
        "Click Test.",
        `Select:\n- ${agent}`,
        "Confirm the connection test completes successfully."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        `Validate the ${technology} Data Server test is successful using ${agent}.`,
        "Confirm no authentication or connectivity error is returned."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the test fails:",
        "- Revalidate the password with the owner/admin.",
        `- Confirm the selected agent is ${agent}.`,
        "- Do not retry with unapproved credentials.",
        "- Restore the previous password only if available and approved."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence of:",
        "1. Data Server selected.",
        "2. Configured user validation.",
        "3. Save action.",
        `4. Successful test result with ${agent}.`,
        "",
        "Do not attach password evidence.",
        summary ? `\nRFC summary: ${summary}` : ""
      ].filter(Boolean).join("\n")
    }
  ];
}

export function odiManualPlanMetadata(productName: string, environmentName: string, instanceName: string, instructions: string) {
  if (productName === "ODI Studio" && hasOdiJeeAgentRemediation(instructions)) {
    const instance = odiTargetInstance(instructions) || instanceName;
    const hosts = odiMiddlewareHosts(instructions);
    const domainHome = odiDomainHome(instructions);
    const jarSource = odiCommonsVfsJarSource(instructions);
    return [
      "Environment:",
      `- ODI Instance: ${instance}`,
      `- RFC Environment: ${environmentName}`,
      hosts.length ? `- Middleware host(s): ${hosts.join(", ")}` : "",
      "",
      "Impact:",
      "- ODI JEE Agent classpath will be remediated to restore OdiSftp execution.",
      "- ODI managed servers will be restarted during the approved maintenance window.",
      "",
      "Scope:",
      "- Implement KB183202 for ODI JEE Agent.",
      "- Clear WebLogic cache according to KB90003.",
      "- No ODI repository object import or data correction is included.",
      "",
      "Configuration:",
      `- Domain Home: ${domainHome}`,
      `- Source jar: ${jarSource}`,
      "",
      "Expected Outcome:",
      "OdiSftp scenarios run without ODI-17514 or ClassNotFoundException for org.apache.commons.vfs2.UserAuthenticator."
    ].filter(Boolean).join("\n");
  }
  if (productName !== "ODI Studio" || !hasOdiComponentImportInstructions(instructions)) return "";
  const artifacts = odiArtifacts(instructions);
  const mappings = odiMappings(instructions);
  const packages = odiPackages(instructions);
  const scenarios = odiScenarios(instructions);
  const project = odiProject(instructions);
  const folder = odiFolder(instructions);
  return [
    "Environment:",
    `- ODI Instance: ${instanceName}`,
    "",
    "Impact:",
    "- ODI mapping/package configuration will be imported into the target repository.",
    "- No database data correction is included unless an approved SQL script is explicitly listed.",
    "",
    "Scope:",
    `- ${environmentName} environment only`,
    "",
    "Expected Outcome:",
    "ODI mapping, package, and related scenario are imported/validated successfully.",
    "",
    artifacts.length ? `Artifacts:\n${artifacts.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    mappings.length ? `Mappings:\n${mappings.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    packages.length ? `Packages:\n${packages.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    scenarios.length ? `Scenarios:\n${scenarios.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    project || folder ? `Project / Folder:\n- ${[project, folder].filter(Boolean).join(" / ")}` : ""
  ].filter(Boolean).join("\n");
}
