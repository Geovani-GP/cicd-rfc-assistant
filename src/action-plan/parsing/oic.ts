import { extractArtifactNames, installableArtifactNames } from "./artifacts";
import {
  actionPlanLinesFromIm090,
  asBullets,
  environmentSectionFromDocument,
  filterEnvironmentSection,
  hasNumberedInstructionSteps,
  looseSectionByHeadings,
  operationalIm090Text,
  prepareManualPhaseContent,
  sectionByAnyHeading
} from "./common";
import type { ManualActionPhase } from "./types";

export function buildManualPhasesFromDocument(text: string, selectedEnvironment = ""): ManualActionPhase[] {
  const operational = operationalIm090Text(text);
  const lines = actionPlanLinesFromIm090(text);
  const startAt = 0;
  const artifactSection = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Installation artifacts\b/i, /^Installation artifacts\b/i], startAt);
  const artifactContent = artifactSection || looseSectionByHeadings(operational, ["Installation artifacts"], [
    "Pre installation steps",
    "Pre-Installation Steps",
    "Installation Steps"
  ]);
  const artifactDetectionText = [artifactContent, operational].filter(Boolean).join("\n");
  const installableArtifacts = installableArtifactNames(artifactDetectionText);
  const artifacts = installableArtifacts.length
    ? installableArtifacts
    : extractArtifactNames(artifactContent || operational, { includeComponentNames: true });
  const preInstall = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Pre[- ]Installation Steps\b/i, /^Pre[- ]Installation Steps\b/i], startAt, { dedupe: false });
  const backupIntegration = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Get a backup integration\b/i, /^Get a backup integration\b/i], startAt);
  const backupLookups = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Get a backup lookups?\b/i, /^Get a backup lookups?\b/i], startAt);
  const installation = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Installation Steps\b/i, /^Installation Steps\b/i], startAt);
  const schedule = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Schedule activation\b/i, /^\d+(?:\.\d+)*\s+Configure and start scheduler\b/i, /^Schedule activation\b/i, /^Configure and start scheduler\b/i], startAt);
  const validation = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Verification Checklist\b/i, /^Verification Checklist\b/i], startAt);
  const returnPoint = sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Return Point\b/i, /^Return Point\b/i], startAt);
  const environmentContentRaw = environmentSectionFromDocument(text);
  const environmentContent = filterEnvironmentSection(environmentContentRaw, selectedEnvironment);
  const preInstallContent = preInstall || looseSectionByHeadings(operational, ["Pre installation steps", "Pre-Installation Steps"], ["Get a backup integration", "Installation Steps", "2 OUT_"], { dedupe: false });
  const backupContent = [backupIntegration, backupLookups].filter(Boolean).join("\n\n") ||
    looseSectionByHeadings(operational, ["Get a backup integration"], ["Installation Steps"]);
  const installationContent = installation || looseSectionByHeadings(operational, ["Installation Steps"], [
    "Configure and start scheduler",
    "Schedule activation",
    "Verification Checklist",
    "Return Point"
  ]);
  const directInstructionContent = !installationContent && hasNumberedInstructionSteps(operational) ? operational : "";
  const scheduleContent = schedule || looseSectionByHeadings(operational, ["Schedule activation", "Configure and start scheduler"], [
    "Verification Checklist",
    "Return Point"
  ]);
  const validationContent = validation || looseSectionByHeadings(operational, ["Verification Checklist"], ["Return Point"]);
  const returnPointContent = returnPoint || looseSectionByHeadings(operational, ["Return Point"], ["Open and Closed Issues"]);
  const prepareContent = (content: string) => prepareManualPhaseContent(content, selectedEnvironment);
  const preInstallClean = /^pre$/i.test(preInstallContent.trim()) ? "" : preInstallContent;

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareContent([
        "Validate target environment, access, and artifacts before starting the manual installation.",
        environmentContent,
        artifactContent,
        "Artifacts detected:",
        asBullets(artifacts),
        preInstallClean
      ].filter(Boolean).join("\n\n"))
    },
    {
      id: "backup",
      title: "Backup",
      content: prepareContent(backupContent || [
        "Before installing, validate whether each component already exists in the target environment.",
        "If it exists, export or download the current version as backup.",
        "Attach backup files or backup evidence to the RFC.",
        "If backup is not applicable, document the reason in the RFC evidence."
      ].join("\n"))
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: prepareContent(directInstructionContent || installationContent || "Execute the manual installation steps described in the IM090.")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: prepareContent(scheduleContent || "Validate whether schedule activation applies. If applicable, start schedules and capture evidence.")
    },
    {
      id: "validation",
      title: "Validation",
      content: prepareContent(validationContent || "Validate deployed artifacts/components and confirm there are no deployment errors.")
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
        "Attach the IM090 PDF to the RFC.",
        "Attach backup evidence to the RFC.",
        "Attach final validation evidence and share the execution result."
      ].join("\n"))
    }
  ];
}
