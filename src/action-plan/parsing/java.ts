import { asBullets, prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

function uniqueValues(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    byKey.set(clean.toUpperCase(), clean);
  }
  return Array.from(byKey.values());
}

function weblogicUserCandidates(text: string) {
  return uniqueValues([
    ...Array.from(text.matchAll(/\b([a-z][a-z0-9_.-]*(?:_deployer|_developer|_admin|_user|_operator)?)\b/g))
      .map((match) => match[1])
      .filter((value) => /_/.test(value))
      .filter((value) => !/^(password|summary|description|environment)$/i.test(value)),
    ...Array.from(text.matchAll(/\bFind\s+([A-Za-z0-9_.-]+)\s+user\b/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bfor\s+the\s+([A-Za-z0-9_.-]+)\s+user\b/gi)).map((match) => match[1])
  ].filter((value) => /_/.test(value)));
}

function primaryWeblogicUser(text: string) {
  const candidates = weblogicUserCandidates(text);
  const exactFind = text.match(/\bFind\s+([A-Za-z0-9_.-]+)\s+user\b/i)?.[1];
  if (exactFind) return exactFind;
  const requested = text.match(/\n\s*([A-Za-z0-9_.-]+)\s*\n/)?.[1];
  if (requested && candidates.some((candidate) => candidate.toUpperCase() === requested.toUpperCase())) return requested;
  return candidates[0] || "<WEBLOGIC_USER>";
}

function targetRealm(text: string) {
  return text.match(/\bRealms?\s+([A-Za-z0-9_.-]+)/i)?.[1] ?? "myrealm";
}

function hasInconsistentUsers(candidates: string[]) {
  return candidates.length > 1;
}

export function hasJavaWeblogicInstructions(text: string) {
  return /\bWebLogic Admin Console\b|\bUsers and Groups\b|\bRealms?\s+myrealm\b|\bPassword tab\b|\bPOM\b/i.test(text) &&
    /\bpassword reset\b|\bEnter New Password\b|\bConfirm Password\b|\bSave changes\b/i.test(text);
}

export function javaConfigurationItems(text: string) {
  const user = primaryWeblogicUser(text);
  const realm = targetRealm(text);
  const items = [
    `WebLogic realm: ${realm}`,
    `Target user: ${user}`
  ];
  const candidates = weblogicUserCandidates(text);
  if (hasInconsistentUsers(candidates)) {
    items.push(`User candidates to confirm: ${candidates.join(", ")}`);
  }
  return items;
}

export function buildJavaWeblogicPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const candidates = weblogicUserCandidates(text);
  const user = primaryWeblogicUser(text);
  const realm = targetRealm(text);
  const userBlock = asBullets([user]);
  const warning = hasInconsistentUsers(candidates)
    ? `Validation warning:\nThe request mentions multiple user candidates: ${candidates.join(", ")}.\nConfirm the exact WebLogic user before execution.`
    : "";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: prepareManualPhaseContent([
        "Confirm access to the WebLogic Admin Console for the target environment.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target realm:\n- ${realm}`,
        `Confirm the target user:\n${userBlock}`,
        warning,
        "Confirm approval for the password reset request.",
        "Confirm the new password will be provided and shared only through the approved secure channel.",
        "Do not capture or expose password values in the Action Plan or evidence."
      ].filter(Boolean).join("\n\n"), selectedEnvironment)
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Capture evidence of the target WebLogic user account before the change.",
        `Target user:\n${userBlock}`,
        "Do not capture current password values."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Password Reset Steps",
      content: [
        "Log in to the WebLogic Admin Console.",
        `Go to Domain Structure > Security > Realms > ${realm}.`,
        "Open Users and Groups.",
        `Search and select the target user:\n${userBlock}`,
        "Open the Password tab.",
        "Enter the new password.",
        "Confirm the new password.",
        "Save changes.",
        "Share the updated password only with the approved owner/SDM using the approved secure channel."
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
        "Validate the password reset was saved successfully in WebLogic.",
        "Confirm the owner or authorized team can use the updated credentials through the approved secure channel.",
        "Do not validate by exposing the password in screenshots, logs, or evidence."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the password reset fails, capture the WebLogic error and escalate to the WebLogic/POM owner.",
        "Do not retry with unapproved credentials.",
        "If rollback is required, perform a new password reset using the approved previous or temporary credential procedure."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach target user selected evidence.",
        "Attach password change/save confirmation evidence.",
        "Attach final validation or owner confirmation.",
        "Do not attach password values."
      ].join("\n")
    }
  ];
}
