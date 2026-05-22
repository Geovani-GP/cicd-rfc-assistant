import { extractArtifactNames } from "./artifacts";
import { prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function osbPackage(text: string) {
  return firstMatch(text, [/([A-Z0-9][A-Z0-9_.-]+\.jar)\b/i]) || "<OSB_IMPORT_JAR>";
}

function osbProject(text: string) {
  return firstMatch(text, [
    /(IEWC-CX-\d+\s*[-_]\s*OUT_[A-Z0-9_]+)/i,
    /(ICWC-CX-\d+\s*[-_]\s*OUT_[A-Z0-9_]+)/i,
    /\b(OUT_[A-Z0-9_]+)\b/i
  ]);
}

function osbPipeline(text: string) {
  return firstMatch(text, [/([A-Za-z0-9]+(?:To|TO)[A-Za-z0-9]+\.?Pipeline)\b/i]);
}

function osbProxyService(text: string) {
  return firstMatch(text, [/\b([A-Za-z0-9_]+ProxyService)\b/i, /^proxyService:\s*([A-Za-z0-9_ .-]+)/im]);
}

function osbBusinessService(text: string) {
  return firstMatch(text, [/\b([A-Z0-9_]+_SVC_OIC3)\b/i, /\b([A-Z0-9_]+BusinessService)\b/i]);
}

function osbServiceAccount(text: string) {
  return firstMatch(text, [/\b(OICServiceCredentials[A-Za-z0-9_]*)\b/i, /\b([A-Za-z0-9_]+ServiceAccount)\b/i]);
}

function osbEndpoint(text: string) {
  return firstMatch(text, [/(https:\/\/[^\s<>"']+)/i]);
}

export function hasOsbInstructions(text: string) {
  return /Oracle Service Bus|OSB|Service Bus|BusinessService|ServiceAccount|sbconsole|Pipeline/i.test(text);
}

export function osbConfigurationItems(text: string) {
  const artifacts = extractArtifactNames(text).filter((item) => /\.jar$/i.test(item));
  const project = osbProject(text);
  const pipeline = osbPipeline(text);
  const proxyService = osbProxyService(text);
  const businessService = osbBusinessService(text);
  const serviceAccount = osbServiceAccount(text);
  return [
    ...artifacts.map((artifact) => `Import package: ${artifact}`),
    project ? `OSB project/resource: ${project}` : "",
    pipeline ? `Pipeline: ${pipeline}` : "",
    proxyService ? `Proxy Service: ${proxyService}` : "",
    businessService ? `Business Service: ${businessService}` : "",
    serviceAccount ? `Service Account: ${serviceAccount}` : ""
  ].filter(Boolean);
}

export function buildOsbConfigurationPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const artifact = osbPackage(text);
  const project = osbProject(text) || "<OSB_PROJECT>";
  const pipeline = osbPipeline(text);
  const proxyService = osbProxyService(text);
  const businessService = osbBusinessService(text);
  const serviceAccount = osbServiceAccount(text);
  const endpoint = osbEndpoint(text);
  const environment = selectedEnvironment || "<Environment>";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        `Confirm OSB access for the target environment ${environment}.`,
        "Confirm privileges to create/activate OSB sessions and import configuration packages.",
        `Confirm the OSB import package is available:\n- ${artifact}`,
        "Confirm target endpoint and credentials are provided through the approved secure channel.",
        "Do not capture or expose passwords in RFC evidence."
      ].join("\n\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before applying the change, create an OSB session and capture/export the current configuration if it exists.",
        `Validate current OSB project/resource:\n- ${project}`,
        pipeline ? `Capture current Pipeline status:\n- ${pipeline}` : "",
        proxyService ? `Capture current Proxy Service configuration:\n- ${proxyService}` : "",
        businessService ? `Capture current Business Service configuration:\n- ${businessService}` : "",
        serviceAccount ? `Capture current Service Account username only:\n- ${serviceAccount}` : "",
        endpoint ? `Capture current endpoint host/value without credentials:\n- ${endpoint}` : "",
        "Do not capture password values."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "Login to the OSB console for the target environment.",
        "Create a new OSB change session.",
        `Import the OSB configuration package:\n- ${artifact}`,
        "Review the import/customization plan before activation.",
        proxyService ? `Validate/update Proxy Service configuration:\n- ${proxyService}` : "",
        businessService ? `Validate/update Business Service target configuration:\n- ${businessService}` : "Validate/update Business Service target configuration.",
        endpoint ? `Replace development endpoint with the target environment endpoint as required. Current package endpoint detected:\n- ${endpoint}` : "Validate the endpoint points to the target environment.",
        serviceAccount ? `Validate/update Service Account credentials through the approved secure channel:\n- ${serviceAccount}` : "Validate/update Service Account credentials through the approved secure channel.",
        "Activate the OSB session.",
        "Confirm activation completes successfully."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for OSB configuration import unless explicitly required by the RFC."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate the imported OSB resources are active.",
        pipeline ? `Validate Pipeline:\n- ${pipeline}` : "",
        proxyService ? `Validate Proxy Service:\n- ${proxyService}` : "",
        businessService ? `Validate Business Service:\n- ${businessService}` : "",
        serviceAccount ? `Validate Service Account is configured without exposing the password:\n- ${serviceAccount}` : "",
        "Confirm there are no activation, endpoint, authentication, or routing errors."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If import or validation fails, discard the current OSB session if it has not been activated.",
        "If the session was activated and rollback is required, restore the previous exported OSB configuration.",
        "Capture the error and escalate to the OSB/application owner before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC:",
        "1. Source IM090/configuration instructions.",
        "2. OSB package selected for import.",
        "3. Pre-change backup/current configuration evidence.",
        "4. Import/customization review evidence.",
        "5. Session activation evidence.",
        "6. Final validation evidence.",
        "",
        "Do not attach password evidence."
      ].join("\n")
    }
  ];
}
