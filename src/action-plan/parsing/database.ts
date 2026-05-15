import { asBullets, prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

export function hasSqlInstructions(text: string) {
  return /\b(?:CREATE|ALTER|DROP|TRUNCATE|DELETE|UPDATE|PURGE|GRANT|REVOKE)\s+\w+\b/i.test(text) || /^\s*SQL>/im.test(text);
}

function databaseObjectNames(text: string) {
  const matches = Array.from(
    text.matchAll(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\s+([A-Z0-9_$#.-]+)/gi)
  ).map((match) => match[1]);
  return Array.from(new Map(matches.map((name) => [name.toUpperCase(), name])).values());
}

function classifyDatabaseOperation(text: string) {
  const normalized = text.toUpperCase();
  const isPassword = /\bALTER\s+USER\b[\s\S]*\bIDENTIFIED\s+BY\b|\bPASSWORD\b/.test(normalized);
  const isPurge = /\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|PURGE)\b/.test(normalized);
  const isDml = /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|MERGE\s+INTO)\b/.test(normalized);
  const isCreate = /\bCREATE\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\b/.test(normalized);
  const restoreMentioned = /\b(?:RESTORE\s+POINT|FLASHBACK|EXPDP|BACKUP|SNAPSHOT|ROLLBACK)\b/.test(normalized);

  if (isPassword) return { kind: "password", restoreMentioned };
  if (isPurge) return { kind: "purge", restoreMentioned };
  if (isDml) return { kind: "dml", restoreMentioned };
  if (isCreate) return { kind: "create", restoreMentioned };
  return { kind: "general", restoreMentioned };
}

function databaseBackupGuidance(kind: string, restoreMentioned: boolean) {
  if (kind === "password") {
    return [
      "Do not capture or store previous/new passwords in the Action Plan or evidence.",
      "Capture current user status from DBA_USERS before the change.",
      "Confirm the approved credential reset/rotation procedure and secure communication channel."
    ];
  }
  if (kind === "purge" || kind === "dml") {
    return [
      "Confirm restore point, export, snapshot, table backup, or approved DBA backup before execution.",
      "Capture backup/restore evidence before running the SQL.",
      "Capture pre-change row counts or validation queries for affected data.",
      restoreMentioned ? "Restore/backup instruction was detected in the source text." : "Do not proceed until backup or restore point evidence is available."
    ];
  }
  if (kind === "create") {
    return [
      "Capture current database object/profile configuration before applying changes.",
      "If the object does not exist, document that no backup applies.",
      "Prepare rollback statement only if it is approved for this RFC."
    ];
  }
  return [
    "Capture current database configuration before applying changes.",
    "Confirm backup, restore point, or rollback procedure with the DBA team when the change can affect data or access."
  ];
}

function databaseValidationGuidance(kind: string, objects: string[]) {
  const objectValidations = objects.length
    ? objects.map((objectName) => `- Validate ${objectName} exists and matches the requested configuration.`)
    : ["- Validate the requested database objects exist and match the requested configuration."];
  if (kind === "password") {
    return [
      "Validate the user account status, lock/expiry state, and required connectivity without exposing credentials.",
      "- Query DBA_USERS or the approved account validation view.",
      "- Confirm the application/customer can authenticate through the approved secure channel."
    ].join("\n");
  }
  if (kind === "purge" || kind === "dml") {
    return [
      "Run post-change validation queries and compare against the pre-change evidence.",
      "- Capture affected row counts.",
      "- Validate business/application impact with the request owner."
    ].join("\n");
  }
  return ["Run validation queries and capture the result.", ...objectValidations].join("\n");
}

function databaseReturnPointGuidance(kind: string, restoreMentioned: boolean) {
  if (kind === "password") {
    return "If authentication fails, follow the approved credential reset/rollback procedure. Do not expose credentials in logs or evidence.";
  }
  if (kind === "purge" || kind === "dml") {
    return restoreMentioned
      ? "Use the documented restore point/backup procedure if validation fails. Stop execution and escalate to DBA before retrying."
      : "If validation fails, stop the change and use the approved backup/restore plan. Do not continue without DBA approval.";
  }
  if (kind === "create") {
    return "If execution fails, stop the change, capture the error, and consult the DBA/technical team. Run rollback/drop statements only if approved.";
  }
  return "If execution fails, stop the change, capture the error, and consult the DBA/technical team before retrying.";
}

export function buildDatabaseSqlPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const sql = prepareManualPhaseContent(text, selectedEnvironment);
  const objects = databaseObjectNames(text);
  const operation = classifyDatabaseOperation(text);
  const backupGuidance = databaseBackupGuidance(operation.kind, operation.restoreMentioned);
  const validationGuidance = databaseValidationGuidance(operation.kind, objects);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, server, access, and approved maintenance window.",
        "Confirm the execution user has privileges to run the requested SQL.",
        objects.length ? `Database object(s):\n${asBullets(objects)}` : ""
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: backupGuidance.join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Login into the target database server as the approved database/oracle user.",
        "2. Open SQL*Plus or the approved SQL execution tool.",
        "3. Execute the SQL below:",
        sql,
        "4. Capture the execution output."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database change unless the RFC explicitly requests job/scheduler activation."
    },
    {
      id: "validation",
      title: "Validation",
      content: validationGuidance
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: databaseReturnPointGuidance(operation.kind, operation.restoreMentioned)
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach SQL execution output.",
        "Attach validation query result.",
        "Share final result with the customer."
      ].join("\n")
    }
  ];
}
