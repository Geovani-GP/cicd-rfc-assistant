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

export function isOdiProductName(productName: string) {
  return /^(?:ODI|ODI Studio|Oracle Data Integration \(ODI\)|Oracle Data Integrator|Oracle Data Integrator \(ODI\))$/i.test(productName.trim());
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

function odiUrl(text: string) {
  return firstMatch(text, [
    /\bURL(?:\s+must\s+be\s+left\s+exactly\s+as\s+provided\s+in\s+the\s+action\s+plan)?[:\s]+(https?:\/\/[^\s<>"']+)/i,
    /\b(https?:\/\/[a-z0-9.-]+\.integration\.[a-z0-9.-]+\.oraclecloud\.com\/?)\b/i,
    /\b(https?:\/\/[^\s<>"']+)/i
  ]);
}

function odiTargetEnvironmentInstance(text: string) {
  return firstMatch(text, [
    /\bTarget Environment\s*\n\s*(GB[A-Z0-9_-]+)/i,
    /\bEnvironment\s*\n\s*(GB[A-Z0-9_-]+)/i,
    /\bRFC target:\s*(?:[A-Z]+\s*-\s*)?(GB[A-Z0-9_-]+)/i
  ]);
}

function environmentSuffixFromInstance(instance: string, selectedEnvironment: string) {
  const suffix = instance.match(/(DE|TE|PR|RE)$/i)?.[1]?.toLowerCase();
  if (suffix) return suffix;
  if (/prod|production/i.test(selectedEnvironment)) return "pr";
  if (/test/i.test(selectedEnvironment)) return "te";
  if (/dev|development/i.test(selectedEnvironment)) return "de";
  return "";
}

function adaptOdiValueToTargetEnvironment(value: string, targetSuffix: string) {
  if (!value || !targetSuffix) return value;
  return value
    .replace(/(gboic3glr\d)(?:te|pr|de|re)\b/gi, `$1${targetSuffix}`)
    .replace(/-(?:te|pr|de|re)\b/gi, `-${targetSuffix}`);
}

function odiAgent(text: string) {
  return firstMatch(text, [
    /select the\s+([A-Za-z0-9_.-]*Agent[A-Za-z0-9_.-]*)/i,
    /\b(OracleDIAgent)\b/i,
    /agent(?:\s+is|:)\s+([A-Za-z0-9_.-]+)/i
  ]) || "OracleDIAgent";
}

export function hasOdiInstructions(text: string) {
  return /\bODI\b|ODI Studio|OdiSftp|OracleDIAgent|setDomainEnv\.sh|KB183202|SUPERVISOR|Topology|Physical Architecture|RESTful Service|Data Server|ODI integration components|Connect to Repository|Regenerate .*scenario|SunopsisExport|SnpMapping|SnpPackage|ODI Mapping:|ODI Package:|rolling bounce|WebLogic Console|managed servers?/i.test(text);
}

function hasOdiComponentImportInstructions(text: string) {
  return /Backup ODI integration components|Import ODI integration components|Regenerate .*scenario|Objects to be Exported|Exporting the following objects|Artifact file:\s*[^\n\r]+\.xml|ODI Mapping:|ODI Package:|ODI Scenario:|SunopsisExport|SnpMapping|SnpPackage/i.test(text);
}

function hasOdiRollingBounceInstructions(text: string) {
  return /\brolling bounce\b|\brestart\b[\s\S]{0,120}\bmanaged servers?\b|\bslowness\b[\s\S]{0,160}\bregenerating scenarios\b/i.test(text) &&
    /\bODI\b|GB[A-Z0-9]*ODI[A-Z0-9]*\b|OracleDIAgent|ODI_server\d+/i.test(text);
}

function hasOdiJeeAgentRemediation(text: string) {
  return /KB183202|OdiSftp|OracleDIAgent|setDomainEnv\.sh|commons-vfs2|org\.apache\.commons\.vfs2\.UserAuthenticator|ODI JEE Agent/i.test(text);
}

function objectPattern() {
  return /\b(?:PRC|RPC|PCR|PKG|SCN|MAP|FILE|TAB|VL)[A-Za-z0-9_]*\b/g;
}

function isLikelyNoisyOdiObjectName(value: string) {
  const normalized = value.replace(/[^A-Z0-9_]/gi, "").toUpperCase();
  return normalized.length > 90 ||
    /FINDNEXTISSUE|FILEREF|DOCUMENTCONTROL|CONFIGURATIONINSTRUCTIONS|OPENANDCLOSEDISSUES/.test(normalized) ||
    (/MAP_/.test(normalized) && /PKG_/.test(normalized)) ||
    (/MAP_/.test(normalized) && /ESC_/.test(normalized));
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
    .filter((item) => item.length >= 5)
    .filter((item) => !isLikelyNoisyOdiObjectName(item));
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
  const values = uniqueValues([
    ...Array.from(text.matchAll(/\bArtifact file:\s*([^\n\r]+\.xml)\b/gi)).map((match) => match[1].trim()),
    ...Array.from(text.matchAll(/\b(?:using|file|artifact)\s+(?:the\s+)?(?:xml\s+project\s+file\s+)?(?:for\s+this\s+integration\s+)?([A-Z0-9_.-]+\.zip)\b/gi)).map((match) => match[1].trim()),
    ...(text.match(/\b[A-Z0-9_.-]+\.xml\b/gi) ?? [])
  ]).filter((item) => !isLikelyNoisyOdiObjectName(item));
  return values.filter((item) => {
    const withoutDownloadSuffix = item.replace(/(\d+)(\.zip)$/i, "$2");
    return withoutDownloadSuffix === item || !values.some((other) => other.toUpperCase() === withoutDownloadSuffix.toUpperCase());
  });
}

function odiMappings(text: string) {
  const values = uniqueValues([
    ...componentValues(text, "ODI Mapping").map(normalizeOdiObjectName),
    ...odiObjectNames(text).filter((item) => /^MAP_/i.test(item))
  ]);
  return values.filter((item) => {
    const withoutDownloadSuffix = item.replace(/\d+$/g, "");
    return withoutDownloadSuffix === item || !values.some((other) => other.toUpperCase() === withoutDownloadSuffix.toUpperCase());
  });
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
    explicitScenario || "",
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
    firstMatch(text, [
      /\bPRY_[A-Z0-9_]+\s+folder\s*>\s*([A-Z0-9_ ]+)/i,
      /\bPRY_[A-Z0-9_]+\s*[-.>]+\s*([A-Z0-9_ ]*COMMONS)\b/i,
      /\bPRY_[A-Z0-9_]+\.([A-Z0-9_ ]*COMMONS)\./i
    ]);
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
    /Regenerate\s+Scenario\s+([A-Z0-9_]+)\b/i,
    /Scenarios?\s*(?:→|>|-)\s*([A-Z0-9_]+)\s+version\s+\d+/i,
    /Regenerate\s+([A-Z0-9_]+\s+Version\s+\d+)/i,
    /\b([A-Z0-9_]+\s+Version\s+\d+)\s*>\s*click\s+Regenerate/i,
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

function odiRollingBounceManagedServers(text: string) {
  const explicit = uniqueValues([
    ...Array.from(text.matchAll(/\b([a-z0-9-]*odi[a-z0-9-]*_server_\d+)\b/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\b(ODI_server\d+)\b/gi)).map((match) => match[1])
  ]);
  return explicit.length ? explicit : [];
}

function hasOdiRollingBounceCacheCleanup(text: string) {
  return /\b(?:clean|clear|cleanup)\b[\s\S]{0,80}\b(?:cache|tmp)\b|\b(?:cache|tmp)\b[\s\S]{0,80}\b(?:clean|clear|cleanup|backup|mv)\b|\bmv\s+cache\s+cache[._-]|\bmv\s+tmp\s+tmp[._-]/i.test(text);
}

function odiDomainHomeFromRollingBounce(text: string, target: string) {
  return firstMatch(text, [
    /(\/u01\/oracle\/mwh\/user_projects\/domains\/[A-Za-z0-9_-]+_domain)\b/i,
    /(\/u01\/oracle\/mwh\/user_projects\/domains\/[A-Za-z0-9_-]+)\b/i
  ]) || `/u01/oracle/mwh/user_projects/domains/${target}_domain`;
}

function odiRollingBounceHostMap(text: string) {
  const map = new Map<string, string>();
  const sshMatches = Array.from(text.matchAll(/Managed Server\s+(\d+)[\s\S]{0,220}?\bssh\s+<user>@([0-9.]+)/gi));
  for (const match of sshMatches) {
    map.set(match[1], match[2]);
  }
  return map;
}

function odiRollingBounceTarget(text: string, selectedEnvironment: string) {
  return odiTargetEnvironmentInstance(text) ||
    firstMatch(text, [/\bEnvironment\s*\n\s*(GB[A-Z0-9_-]*ODI[A-Z0-9_-]*)/i, /\b(GB[A-Z0-9_-]*ODI[A-Z0-9_-]*)\b/i]) ||
    selectedEnvironment ||
    "<ODI_INSTANCE>";
}

function rfcNumberFromText(text: string) {
  return firstMatch(text, [/\bRFC\s*:?\s*(4-B[0-9A-Z]+)/i, /\b(4-B[0-9A-Z]{5,})\b/i]);
}

function buildOdiRollingBouncePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const target = odiRollingBounceTarget(text, selectedEnvironment);
  const servers = odiRollingBounceManagedServers(text);
  const serverBlock = servers.length
    ? servers.map((server) => `- ${server}`).join("\n")
    : "- Confirm the ODI managed server list from WebLogic Console before execution.";
  const adminServerRequested = /\bAdmin Server\b[\s\S]{0,120}\b(?:restart|start|shutdown)|\bRepeat steps\b[\s\S]{0,80}\bAdmin Server\b/i.test(text);
  const cleanCacheTmp = hasOdiRollingBounceCacheCleanup(text);
  const domainHome = odiDomainHomeFromRollingBounce(text, target);
  const hostMap = odiRollingBounceHostMap(text);
  const cacheBackupSuffix = `${rfcNumberFromText(text) || "<RFC>"}_YYYYMMDD`;
  const issueContext = /\bslowness\b|\bregenerating scenarios\b/i.test(text)
    ? "Current issue context: slowness while regenerating ODI scenarios."
    : "";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        "Confirm RFC approval to execute a rolling bounce for the ODI environment.",
        `Target ODI environment:\n- ${target}`,
        issueContext,
        "Confirm access to Enterprise Manager / monitoring to set and unset blackout if required.",
        "Confirm access to the WebLogic Admin Console for the ODI domain.",
        cleanCacheTmp ? "Confirm SSH access to each ODI managed server host and permission to switch/login as oracle OS user." : "",
        `Confirm the ODI managed server(s) to restart:\n${serverBlock}`,
        cleanCacheTmp ? `Confirm the domain home path:\n- ${domainHome}` : "",
        "Confirm no ODI scenario regeneration or critical execution is running before restarting each server.",
        "Do not capture or expose OS, WebLogic, or repository password values."
      ].filter(Boolean).join("\n\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Pre-Change Evidence",
      content: [
        "No artifact backup is required because this RFC only restarts ODI/WebLogic services.",
        "Capture current evidence before execution:",
        `- Target ODI environment: ${target}`,
        "- WebLogic Admin Console server list.",
        `- Current state of ODI managed server(s):\n${serverBlock}`,
        "- Current health/monitoring status.",
        cleanCacheTmp ? "- Current cache/tmp directory state for each managed server before renaming." : "",
        "- Any visible ODI Agent or scenario regeneration symptom relevant to the request."
      ].filter(Boolean).join("\n")
    },
    {
      id: "installation",
      title: "Rolling Bounce",
      content: cleanCacheTmp ? [
        `1. Set EM/monitoring blackout for ${target}, if required by the operational procedure.`,
        "2. Login to the WebLogic Admin Console for the ODI domain.",
        "3. Go to Environment > Servers > Control.",
        "4. Restart ODI managed servers one by one and clean cache/tmp while each managed server is stopped.",
        "",
        servers.length ? servers.map((server, index) => {
          const number = server.match(/(\d+)$/)?.[1] ?? `${index + 1}`;
          const host = hostMap.get(number);
          return [
            `${index + 5}. Process ${server}:`,
            `   - Shutdown ${server} from WebLogic Console: Shutdown > Force shutdown > Yes.`,
            "   - Wait until the server reaches SHUTDOWN state.",
            host ? `   - Connect by SSH to the managed server host:\n     ssh <user>@${host} -o ServerAliveInterval=60` : "   - Connect by SSH to the managed server host confirmed for this server.",
            "   - Login/switch to oracle OS user.",
            `   - Go to:\n     ${domainHome}/servers/${server}`,
            "   - Backup cache and tmp directories by renaming them:",
            `     mv cache cache_${cacheBackupSuffix}`,
            `     mv tmp tmp_${cacheBackupSuffix}`,
            `   - Start ${server} from WebLogic Console.`,
            "   - Wait until the server reaches RUNNING state before continuing with the next server."
          ].join("\n");
        }).join("\n\n") : [
          "5. For each ODI managed server confirmed in WebLogic Console:",
          "   - Shutdown the managed server: Shutdown > Force shutdown > Yes.",
          "   - Wait until the server reaches SHUTDOWN state.",
          "   - Connect by SSH to the corresponding managed server host.",
          "   - Login/switch to oracle OS user.",
          `   - Go to:\n     ${domainHome}/servers/<MANAGED_SERVER_NAME>`,
          "   - Backup cache and tmp directories by renaming them:",
          `     mv cache cache_${cacheBackupSuffix}`,
          `     mv tmp tmp_${cacheBackupSuffix}`,
          "   - Start the same managed server from WebLogic Console.",
          "   - Wait until the server reaches RUNNING state before continuing with the next server."
        ].join("\n"),
        "",
        adminServerRequested
          ? "Do not clean or restart AdminServer unless the approved instructions explicitly require it and the WebLogic owner confirms the sequence."
          : "Do not clean or restart AdminServer for this RFC unless explicitly approved by the WebLogic owner.",
        `Unset EM/monitoring blackout for ${target} after all requested servers are RUNNING.`
      ].join("\n") : [
        `1. Set EM/monitoring blackout for ${target}, if required by the operational procedure.`,
        "2. Login to the WebLogic Admin Console for the ODI domain.",
        "3. Go to Environment > Servers.",
        "4. Open the Control tab.",
        "5. Restart ODI managed servers one by one:",
        serverBlock,
        "6. For each managed server:",
        "   - Select the server checkbox.",
        "   - Click Shutdown > Force shutdown > Yes.",
        "   - Wait until the server reaches SHUTDOWN state.",
        "   - Select the same server again.",
        "   - Click Start > Yes.",
        "   - Wait until the server reaches RUNNING state before continuing with the next server.",
        adminServerRequested
          ? "7. Restart the Admin Server only because it is explicitly requested in the approved instructions."
          : "7. Do not restart the Admin Server unless it is explicitly approved or required by the WebLogic owner.",
        `8. Unset EM/monitoring blackout for ${target} after all requested servers are RUNNING.`
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable. This RFC is only for ODI/WebLogic rolling bounce.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate all restarted ODI managed servers are RUNNING.",
        cleanCacheTmp ? "Validate new cache/tmp directories are recreated automatically after each managed server starts." : "",
        "Validate the ODI Agent/application health is available after restart.",
        "Validate scenario regeneration can be attempted by the requester or ODI owner.",
        "Confirm no unexpected WebLogic, ODI Agent, or health check errors are present after the rolling bounce."
      ].filter(Boolean).join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If a managed server does not stop or start correctly, stop the rolling bounce and capture the error.",
        "Do not continue with the remaining servers until the ODI/WebLogic owner confirms the next action.",
        "If health checks fail after restart, keep blackout active if needed, capture evidence, and escalate to the WebLogic/ODI support owner.",
        "If rollback-like recovery is needed, follow the WebLogic owner instruction to restart or recover the affected managed server."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence for:",
        "1. EM/monitoring blackout set, if used.",
        "2. Pre-change managed server status.",
        "3. Shutdown/start evidence for each restarted managed server.",
        cleanCacheTmp ? "4. cache/tmp backup rename evidence for each managed server." : "",
        `${cleanCacheTmp ? "5" : "4"}. Final RUNNING status for all restarted servers.`,
        `${cleanCacheTmp ? "6" : "5"}. ODI Agent/application health after restart.`,
        `${cleanCacheTmp ? "7" : "6"}. EM/monitoring blackout unset, if used.`,
        `${cleanCacheTmp ? "8" : "7"}. Final update to the customer/requester.`,
        "Do not attach credential values."
      ].filter(Boolean).join("\n")
    }
  ];
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
        "4. Update setDomainEnv.sh according to KB183202 section \"For ODI JEE Agent\" to ensure commons-vfs2-2.2.jar is available in the OracleDIAgent runtime classpath.",
        `- ${setDomainEnv}`,
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
  if (hasOdiRollingBounceInstructions(text)) {
    const target = odiRollingBounceTarget(text, "");
    const servers = odiRollingBounceManagedServers(text);
    const cleanCacheTmp = hasOdiRollingBounceCacheCleanup(text);
    return [
      `ODI Rolling Bounce: ${target}`,
      "WebLogic Admin Console restart",
      "EM/monitoring blackout if required",
      cleanCacheTmp ? "Managed server cache/tmp cleanup" : "",
      ...servers.map((server) => `Managed Server: ${server}`)
    ].filter(Boolean);
  }
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
  const procedureLines = procedures.length ? procedures.map((item) => `- ${item}`).join("\n") : "- <PROCEDURE_OBJECTS>";
  const scenarioLines = scenarios.length ? scenarios.map((item) => `- ${item}`).join("\n") : `- ${scenario}`;
  const mappingArtifacts = artifacts.filter((item) => /^MAP_/i.test(item));
  const packageArtifacts = artifacts.filter((item) => /^PACK_/i.test(item) || /^PKG_/i.test(item));
  const procedureArtifacts = artifacts.filter((item) => /^(?:TRT_|PRC_)/i.test(item));
  const importTypeLine = /synonym\s+mode\s+insert_update/i.test(text)
    ? "Use Import Type: synonym mode insert_update."
    : "Use the import type specified in the RFC/IM090.";
  const importSections = [
    mappings.length ? [
      "Import the ODI mapping artifact first:",
      mappingArtifacts.map((item) => `- ${item}`).join("\n") || mappingLines,
      "Validate imported mapping object(s):",
      mappingLines
    ].join("\n\n") : "",
    procedures.length ? [
      "Import the ODI procedure artifact:",
      procedureArtifacts.map((item) => `- ${item}`).join("\n") || artifactLines,
      importTypeLine,
      "Validate imported procedure object(s):",
      procedureLines
    ].join("\n\n") : "",
    packageArtifacts.length ? [
      "Import the ODI package artifact after its dependencies:",
      packageArtifacts.map((item) => `- ${item}`).join("\n") || packageLines,
      "Validate imported package object(s):",
      packageLines
    ].join("\n\n") : "",
    !mappings.length && !procedures.length && !packageArtifacts.length ? [
      "Import the ODI XML artifact(s):",
      artifactLines,
      importTypeLine
    ].join("\n\n") : ""
  ].filter(Boolean).join("\n\n");

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
        importSections,
        variables.length ? `Validate referenced ODI variable object(s) remain configured for the target environment:\n${variables.map((item) => `- ${item}`).join("\n")}` : "",
        `Regenerate the ODI scenario as required by the IM090:\n${scenarioLines}`,
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
        procedures.length ? `Validate procedure object(s):\n${procedureLines}` : "",
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
  if (hasOdiRollingBounceInstructions(text)) return buildOdiRollingBouncePlan(text, selectedEnvironment);
  if (hasOdiJeeAgentRemediation(text)) return buildOdiJeeAgentRemediationPlan(text, selectedEnvironment);
  if (hasOdiComponentImportInstructions(text)) return buildOdiComponentImportPlan(text, selectedEnvironment);

  const summary = normalizeWhitespace(odiSummary(text));
  const technology = odiTechnology(text);
  const dataServer = odiDataServer(text) || "<DATA_SERVER>";
  const targetInstance = odiTargetEnvironmentInstance(text);
  const targetSuffix = environmentSuffixFromInstance(targetInstance, selectedEnvironment);
  const url = adaptOdiValueToTargetEnvironment(odiUrl(text), targetSuffix);
  const user = adaptOdiValueToTargetEnvironment(odiUser(text), targetSuffix) || "<CONFIGURED_USER>";
  const agent = odiAgent(text);
  const environment = selectedEnvironment || "<Environment>";
  const repositoryUser = /\bSUPERVISOR\b/i.test(text) ? "SUPERVISOR user" : "approved ODI repository user";
  const hasExplicitUser = user !== "<CONFIGURED_USER>";
  const hasExplicitUrl = Boolean(url);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        `Confirm ODI Studio access with the ${repositoryUser}.`,
        `Confirm the target environment is ${environment}.`,
        targetInstance ? `Confirm the target ODI instance is ${targetInstance}.` : "",
        dataServer !== "<DATA_SERVER>" ? `Confirm the Data Server to update is ${dataServer}.` : "Confirm the Data Server to update from the RFC.",
        hasExplicitUrl ? `Confirm the target URL is approved before execution:\n- ${url}` : "Confirm the target URL before execution.",
        hasExplicitUser ? `Confirm the configured username is approved before execution:\n- ${user}` : "Confirm the configured username before execution.",
        "Confirm the new password is available through the approved secure session.",
        "Do not capture or expose the password value."
      ].filter(Boolean).join("\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Capture current configuration evidence before the change:",
        `- Technology: ${technology}`,
        `- Data Server: ${dataServer}`,
        hasExplicitUrl ? `- Current URL and target URL for comparison: ${url}` : "- Current URL and target URL for comparison",
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
        hasExplicitUrl ? `Update the URL exactly as approved:\n- ${url}` : "Update the URL exactly as approved in the RFC/customer confirmation.",
        hasExplicitUser ? `Update/validate the configured user:\n- ${user}` : "Update/validate the configured user/account before updating the password.",
        "Update the password field with the password shared through the approved secure session/password administrator.",
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
        hasExplicitUrl ? `Validate the saved URL is:\n- ${url}` : "Validate the saved URL matches the approved RFC value.",
        hasExplicitUser ? `Validate the saved username is:\n- ${user}` : "Validate the saved username matches the approved RFC value.",
        `Validate the ${technology} Data Server test is successful using ${agent}.`,
        "Confirm no authentication or connectivity error is returned."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the test fails:",
        "- Revalidate the URL and username against the approved RFC/customer value.",
        "- Revalidate the password with the owner/admin.",
        `- Confirm the selected agent is ${agent}.`,
        "- Do not retry with unapproved credentials.",
        "- Restore the previous URL/username/password only if available and approved."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach evidence of:",
        "1. Data Server selected.",
        "2. URL and configured user validation.",
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
  if (isOdiProductName(productName) && hasOdiRollingBounceInstructions(instructions)) {
    const target = odiRollingBounceTarget(instructions, instanceName || environmentName);
    const servers = odiRollingBounceManagedServers(instructions);
    const cleanCacheTmp = hasOdiRollingBounceCacheCleanup(instructions);
    return [
      "Environment:",
      `- ODI Instance: ${target}`,
      `- RFC Environment: ${environmentName}`,
      "",
      "Impact:",
      "- ODI/WebLogic managed servers will be restarted one by one to refresh runtime health.",
      cleanCacheTmp ? "- Managed server cache/tmp directories will be backed up by renaming while each server is stopped." : "",
      "- No ODI repository object import, topology change, database change, or schedule activation is included.",
      "",
      "Scope:",
      "- Rolling bounce only.",
      cleanCacheTmp ? "- cache/tmp cleanup only for managed servers, unless AdminServer cleanup is explicitly approved." : "",
      "- Admin Server restart only if explicitly approved or required by the WebLogic owner.",
      "",
      servers.length ? `Managed Servers:\n${servers.map((server) => `- ${server}`).join("\n")}` : "Managed Servers:\n- Confirm from WebLogic Console before execution.",
      "",
      "Expected Outcome:",
      "ODI managed servers return to RUNNING state and scenario regeneration slowness is mitigated."
    ].filter(Boolean).join("\n");
  }
  if (isOdiProductName(productName) && hasOdiJeeAgentRemediation(instructions)) {
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
  if (!isOdiProductName(productName) || !hasOdiComponentImportInstructions(instructions)) return "";
  const artifacts = odiArtifacts(instructions);
  const mappings = odiMappings(instructions);
  const packages = odiPackages(instructions);
  const scenarios = odiScenarios(instructions);
  const procedures = odiProcedures(instructions);
  const project = odiProject(instructions);
  const folder = odiFolder(instructions);
  const objectTypes = [
    mappings.length ? "mapping" : "",
    procedures.length ? "procedure" : "",
    packages.length ? "package" : ""
  ].filter(Boolean).join("/");
  return [
    "Environment:",
    `- ODI Instance: ${instanceName}`,
    "",
    "Impact:",
    `- ODI ${objectTypes || "component"} configuration will be imported into the target repository.`,
    "- No database data correction is included unless an approved SQL script is explicitly listed.",
    "",
    "Scope:",
    `- ${environmentName} environment only`,
    "",
    "Expected Outcome:",
    `ODI ${objectTypes || "component"} and related scenario are imported/validated successfully.`,
    "",
    artifacts.length ? `Artifacts:\n${artifacts.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    mappings.length ? `Mappings:\n${mappings.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    procedures.length ? `Procedures:\n${procedures.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    packages.length ? `Packages:\n${packages.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    scenarios.length ? `Scenarios:\n${scenarios.map((item) => `- ${item}`).join("\n")}` : "",
    "",
    project || folder ? `Project / Folder:\n- ${[project, folder].filter(Boolean).join(" / ")}` : ""
  ].filter(Boolean).join("\n");
}
