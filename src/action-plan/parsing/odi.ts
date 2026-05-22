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
    /agent(?:\s+is|:)\s+([A-Za-z0-9_.-]+)/i
  ]) || "OracleDIAgent";
}

export function hasOdiInstructions(text: string) {
  return /ODI Studio|SUPERVISOR|Topology|Physical Architecture|RESTful Service|Data Server|ODI integration components|Connect to Repository|Regenerate .*scenario/i.test(text);
}

function hasOdiComponentImportInstructions(text: string) {
  return /Backup ODI integration components|Import ODI integration components|Regenerate .*scenario|Objects to be Exported|Exporting the following objects/i.test(text);
}

function objectPattern() {
  return /\b(?:PRC|RPC|PCR|MAP|FILE|TAB|VL)[A-Za-z0-9_]*\b/g;
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
  return uniqueValues(values)
    .filter((item) => item.length >= 5);
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
  return firstMatch(text, [
    /Regenerate\s+([A-Z0-9_]+\s+Version\s+\d+)/i,
    /Right click on the\s+([A-Z0-9_]+\s+Version\s+\d+)\s+scenario/i
  ]);
}

function odiSchema(text: string) {
  return firstMatch(text, [/schema\s+([A-Z0-9_]+)/i]);
}

export function odiConfigurationItems(text: string) {
  if (hasOdiComponentImportInstructions(text)) {
    const items = [
      ...odiObjectNames(text),
      ...odiSqlScripts(text),
      odiScenario(text) ? `Scenario: ${odiScenario(text)}` : ""
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
  const objects = odiObjectNames(text);
  const scripts = odiSqlScripts(text);
  const projectPaths = odiProjectPaths(text);
  const scenario = odiScenario(text) || "<SCENARIO_NAME> Version <VERSION>";
  const schema = odiSchema(text) || "<TARGET_SCHEMA>";
  const environment = selectedEnvironment || "<Environment>";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        "Confirm ODI Studio access and repository credentials for the target environment.",
        `Confirm the target environment is ${environment}.`,
        "Confirm database access to execute the required SQL script.",
        "Confirm all ODI XML/export files and SQL scripts are available before execution.",
        "Do not capture or expose repository or database password values."
      ].join("\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Open ODI Studio and connect to the repository.",
        "Export the current ODI objects before importing the new version:",
        objects.length ? objects.map((item) => `- ${item}`).join("\n") : "- <ODI_OBJECTS_FROM_RFC>",
        "Capture the export result and backup location.",
        "Capture current scenario/version evidence before regeneration."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "Open ODI Studio and connect to the repository.",
        projectPaths.length ? `Navigate to the required ODI project/folder path(s):\n${projectPaths.map((item) => `- ${item}`).join("\n")}` : "",
        scripts.length ? `Execute the required database script(s) in schema ${schema}:\n${scripts.map((item) => `- ${item}`).join("\n")}` : "",
        "Import the ODI procedure object(s):",
        objects.filter((item) => /^(?:PRC|RPC|PCR)_/i.test(item)).map((item) => `- ${item}`).join("\n") || "- <PROCEDURE_OBJECTS>",
        "Import the ODI mapping object(s):",
        objects.filter((item) => /^MAP_/i.test(item)).map((item) => `- ${item}`).join("\n") || "- <MAPPING_OBJECTS>",
        "Import the ODI variable object(s):",
        objects.filter((item) => /^VL/i.test(item)).map((item) => `- ${item}`).join("\n") || "- <VARIABLE_OBJECTS>",
        "Import the ODI datastore/model object(s):",
        objects.filter((item) => /^(?:FILE|TAB)_/i.test(item)).map((item) => `- ${item}`).join("\n") || "- <DATASTORE_OBJECTS>",
        `Regenerate the ODI scenario:\n- ${scenario}`,
        "Do not change variables marked as Startup Parameter unless the RFC explicitly requires it."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable unless the RFC explicitly requests ODI schedule activation."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the imported ODI objects exist in the target project/folder.",
        scripts.length ? "Validate the database script execution completed successfully." : "",
        `Validate the regenerated scenario is available:\n- ${scenario}`,
        "Confirm there are no ODI import or regeneration errors."
      ].filter(Boolean).join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If import or validation fails, stop the execution and capture the error.",
        "Restore the previously exported ODI objects if rollback is approved.",
        "If the SQL script was executed and rollback is required, coordinate the database rollback with the DBA/request owner.",
        "Escalate to the ODI/application owner before retrying."
      ].join("\n")
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
      content: "Not applicable."
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
