import { asBullets, prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

export function hasSqlInstructions(text: string) {
  return /\b(?:CREATE|ALTER|DROP|TRUNCATE|DELETE|UPDATE|PURGE|GRANT|REVOKE)\s+\w+\b/i.test(text) || /^\s*SQL>/im.test(text);
}

function hasProfilePasswordLifeTimeRequest(text: string) {
  return /\bPASSWORD[_\s-]*LIFE[_\s-]*TIME\b/i.test(text) &&
    (
      /\b(?:PROFILE|SCHEMA|SCHEMAS|USER|USERS|DBA_PROFILES|DBA_USERS|180\s*DAYS?|180\s*DIAS?|180DAYS?)\b/i.test(text) ||
      /^GB_[A-Z0-9_$#.-]+$/im.test(text)
    );
}

export function hasDatabaseInstructions(text: string) {
  return hasSqlInstructions(text) || hasProfilePasswordLifeTimeRequest(text);
}

function databaseObjectNames(text: string) {
  const matches = Array.from(
    text.matchAll(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\s+([A-Z0-9_$#.-]+)/gi)
  ).map((match) => match[1]);
  return Array.from(new Map(matches.map((name) => [name.toUpperCase(), name])).values());
}

export function databaseProfileCandidates(text: string) {
  const profileMatches = [
    ...Array.from(text.matchAll(/\bPROFILE\s*=\s*['"]?([A-Z0-9_$#.-]+)['"]?/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bALTER\s+PROFILE\s+([A-Z0-9_$#.-]+)/gi)).map((match) => match[1])
  ];
  const listedNames = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => /^[A-Z][A-Z0-9_$#.-]*(?:_[A-Z0-9_$#.-]+)+$/i.test(line));
  return Array.from(new Map([...profileMatches, ...listedNames].map((name) => [name.toUpperCase(), name])).values());
}

function classifyDatabaseOperation(text: string) {
  const normalized = text.toUpperCase();
  const isProfilePasswordLifeTime = /\bALTER\s+PROFILE\b[\s\S]*\bPASSWORD_LIFE_TIME\b|\bPASSWORD[_\s-]*LIFE[_\s-]*TIME\b[\s\S]*\b(?:PROFILE|SCHEMA|SCHEMAS)\b/.test(normalized);
  const isPassword = /\bALTER\s+USER\b[\s\S]*\bIDENTIFIED\s+BY\b|\bPASSWORD\b/.test(normalized);
  const isPurge = /\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|PURGE)\b/.test(normalized);
  const isDml = /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|MERGE\s+INTO)\b/.test(normalized);
  const isCreate = /\bCREATE\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\b/.test(normalized);
  const restoreMentioned = /\b(?:RESTORE\s+POINT|FLASHBACK|EXPDP|BACKUP|SNAPSHOT|ROLLBACK)\b/.test(normalized);

  if (isProfilePasswordLifeTime) return { kind: "profilePasswordLifeTime", restoreMentioned };
  if (isPassword) return { kind: "password", restoreMentioned };
  if (isPurge) return { kind: "purge", restoreMentioned };
  if (isDml) return { kind: "dml", restoreMentioned };
  if (isCreate) return { kind: "create", restoreMentioned };
  return { kind: "general", restoreMentioned };
}

function databaseBackupGuidance(kind: string, restoreMentioned: boolean) {
  if (kind === "profilePasswordLifeTime") {
    return [
      "Capture current DBA_USERS and DBA_PROFILES query results before applying the change.",
      "Record the previous PASSWORD_LIFE_TIME value for rollback.",
      "Confirm CTS/RFC approval before execution."
    ];
  }
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
  if (kind === "profilePasswordLifeTime") {
    return [
      "Run post-change validation queries and capture the result.",
      "- PASSWORD_LIFE_TIME must display 180 only for profiles changed during this RFC.",
      "- If a profile was UNLIMITED, already 180, or the user/profile did not exist, capture the no-action evidence."
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
  if (kind === "profilePasswordLifeTime") {
    return "If rollback is required, restore the previous PASSWORD_LIFE_TIME value captured during pre-analysis. Stop execution and escalate to DBA/request owner if validation fails.";
  }
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

function buildProfilePasswordLifeTimePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const profiles = databaseProfileCandidates(text);
  const hasListedSchemaNames = profiles.some((profile) => /^[A-Z][A-Z0-9_$#.-]*(?:_[A-Z0-9_$#.-]+)+$/i.test(profile));
  const treatsCandidatesAsUsers = (/\b(?:SCHEMA|SCHEMAS|USER|USERS)\b/i.test(text) || hasListedSchemaNames) &&
    !/\b(?:ALTER\s+PROFILE|DBA_PROFILES|PROFILE\s*=)\b/i.test(text);
  const requestedList = profiles.length ? asBullets(profiles) : "- <USER_OR_PROFILE_NAME>";
  const profilePlaceholder = treatsCandidatesAsUsers ? "<PROFILE_NAME_FROM_ANALYSIS>" : "<PROFILE_NAME>";
  const profileList = treatsCandidatesAsUsers
    ? `- ${profilePlaceholder} (unique profile identified for the requested schema/user list)`
    : profiles.length
      ? asBullets(profiles)
      : `- ${profilePlaceholder}`;
  const profilePredicate = treatsCandidatesAsUsers || !profiles.length
    ? `'${profilePlaceholder}'`
    : profiles.map((profile, index) => `${index === 0 ? "" : "                   "}'${profile}'`).join(",\n");
  const currentValueQuery = `SELECT profile,
       resource_name,
       limit
FROM dba_profiles
WHERE profile IN (${profilePredicate})
  AND resource_name = 'PASSWORD_LIFE_TIME';`;
  const alterStatements = treatsCandidatesAsUsers || !profiles.length
    ? `ALTER PROFILE ${profilePlaceholder}
LIMIT PASSWORD_LIFE_TIME 180;`
    : profiles.map((profile) => `ALTER PROFILE ${profile}
LIMIT PASSWORD_LIFE_TIME 180;`).join("\n\n");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, access, and approved maintenance window.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        "Confirm CTS/RFC approval before execution.",
        "Confirm the execution account has privileges to query DBA_PROFILES and execute ALTER PROFILE.",
        `Requested ${treatsCandidatesAsUsers ? "schema/user" : "profile"} candidate(s):\n${requestedList}`,
        `Unique profile(s) to modify:\n${profileList}`,
        treatsCandidatesAsUsers
          ? "If all requested schemas/users share the same profile, execute the profile change only once for that profile."
          : "Execute the profile change only once per unique profile."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Current Profile Value Validation",
      content: [
        "Validate the current PASSWORD_LIFE_TIME value for each unique profile before applying the change.",
        "Execute:",
        currentValueQuery,
        "Expected handling:",
        "- If PASSWORD_LIFE_TIME = 'UNLIMITED', do not modify that profile.",
        "- If PASSWORD_LIFE_TIME is already 180, do not modify that profile.",
        "- If PASSWORD_LIFE_TIME has a different finite value, continue with the profile modification.",
        "Capture the current value because rollback depends on this evidence."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Profile Modification",
      content: [
        "Execute only for profiles validated with a finite PASSWORD_LIFE_TIME value different from 180.",
        alterStatements,
        "Capture and save the execution output.",
        "If ALTER PROFILE returns an Oracle error:",
        "- Stop execution immediately.",
        "- Do not continue with additional profiles.",
        "- Capture the Oracle error message.",
        "- Escalate to DBA or request owner for review."
      ].join("\n\n")
    },
    {
      id: "validation",
      title: "Post-Modification Validation",
      content: [
        "Validate the PASSWORD_LIFE_TIME value after the modification.",
        "Execute:",
        currentValueQuery,
        "Expected result:",
        "- Modified profiles must display PASSWORD_LIFE_TIME = 180.",
        "- Profiles skipped due to UNLIMITED or already 180 must be documented as \"No action performed.\""
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency Plan",
      content: [
        "If rollback is required, restore the previous PASSWORD_LIFE_TIME value captured during the current value validation.",
        "Example:",
        "ALTER PROFILE <PROFILE_NAME>\nLIMIT PASSWORD_LIFE_TIME <PREVIOUS_VALUE>;",
        "If execution or validation fails:",
        "- Stop execution.",
        "- Capture the Oracle error message.",
        "- Escalate to DBA or request owner before retrying."
      ].join("\n\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Current PASSWORD_LIFE_TIME values by profile.",
        "2. ALTER PROFILE execution output, if executed.",
        "3. Final PASSWORD_LIFE_TIME validation by profile.",
        "4. Evidence for no-action scenarios:",
        "- PASSWORD_LIFE_TIME = UNLIMITED",
        "- PASSWORD_LIFE_TIME already equals 180"
      ].join("\n")
    }
  ];
}

export function buildDatabaseSqlPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  if (hasProfilePasswordLifeTimeRequest(text)) return buildProfilePasswordLifeTimePlan(text, selectedEnvironment);

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
